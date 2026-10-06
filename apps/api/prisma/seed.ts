import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { baseEnvSchema } from '../src/config/env.schema';
import { PrismaClient, Role } from '../src/generated/prisma/client';
import { SEED_CATEGORIES } from './seed-data';
import { seedBulkProducts } from './seed-bulk';

// `prisma db seed -- --bulk [count]` also adds synthetic products (default 5000) for query-plan work.
// Run through `prisma db seed`: the Prisma CLI loads the environment (see `prisma.config.ts`).
// The seed runs outside the Nest container, so it validates its few variables itself, with the
// same schema pieces the API uses.
const seedEnvSchema = baseEnvSchema.pick({ DATABASE_URL: true }).extend({
  ADMIN_EMAIL: z
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  ADMIN_PASSWORD: z.string().min(8).max(72),
});

/**
 * Name-based UUID (version 5 layout). Products have no natural unique key, so the same name
 * always maps to the same id: that is what makes re-running the seed an upsert instead of a
 * second copy of the catalog.
 */
function seedId(name: string): string {
  const digest = createHash('sha1').update(`mini-marketplace-seed:${name}`).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main(): Promise<void> {
  const env = seedEnvSchema.parse(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

  try {
    // Existing rows are never overwritten (`update: {}`): the seed runs on every container
    // start, and it must not reset stock sold since, un-archive products or revert an
    // administrator's password.
    const admin = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });
    if (!admin) {
      await prisma.user.create({
        data: {
          email: env.ADMIN_EMAIL,
          name: 'Administrator',
          passwordHash: await argon2.hash(env.ADMIN_PASSWORD, { type: argon2.argon2id }),
          role: Role.ADMIN,
        },
      });
    }

    let productCount = 0;
    const categoryIds: string[] = [];
    for (const { name, products } of SEED_CATEGORIES) {
      const category = await prisma.category.upsert({
        where: { name },
        create: { id: seedId(`category:${name}`), name },
        update: {},
      });

      categoryIds.push(category.id);

      for (const product of products) {
        await prisma.product.upsert({
          where: { id: seedId(`product:${product.name}`) },
          create: {
            id: seedId(`product:${product.name}`),
            ...product,
            // Stored only; the browser fetches it. Seeded per product so it never changes.
            imageUrl: `https://picsum.photos/seed/${slugify(product.name)}/600/600`,
            categoryId: category.id,
          },
          update: {},
        });
        productCount += 1;
      }
    }

    const bulkFlag = process.argv.indexOf('--bulk');
    if (bulkFlag !== -1) {
      const requested = Number(process.argv[bulkFlag + 1]);
      const count = Number.isInteger(requested) && requested > 0 ? requested : 5000;
      const added = await seedBulkProducts(prisma, categoryIds, count, seedId);
      console.log(`Bulk seed: ${added} of ${count} synthetic products added.`);
    }

    console.log(
      `Seed complete: administrator ${env.ADMIN_EMAIL} ${admin ? 'already existed' : 'created'}, ` +
        `${SEED_CATEGORIES.length} categories and ${productCount} products ensured.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
