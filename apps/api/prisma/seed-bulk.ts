import type { PrismaClient } from '../src/generated/prisma/client';

const ADJECTIVES = [
  'Premium',
  'Compact',
  'Classic',
  'Ultra',
  'Smart',
  'Eco',
  'Pro',
  'Mini',
  'Deluxe',
  'Essential',
];
const MATERIALS = [
  'Wireless',
  'Bamboo',
  'Steel',
  'Leather',
  'Cotton',
  'Glass',
  'Ceramic',
  'Carbon',
  'Wooden',
  'Silicone',
];
const NOUNS = [
  'Mouse',
  'Lamp',
  'Backpack',
  'Bottle',
  'Speaker',
  'Notebook',
  'Chair',
  'Kettle',
  'Jacket',
  'Puzzle',
  'Monitor',
  'Blender',
  'Camera',
  'Wallet',
  'Watch',
];

const BATCH_SIZE = 1_000;
const BASE_TIME = Date.UTC(2026, 0, 1);

/** Small deterministic PRNG: the same index always yields the same product. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(items: readonly T[], next: () => number): T =>
  items[Math.floor(next() * items.length)];

/**
 * Adds `count` synthetic products so index usage can be inspected with EXPLAIN ANALYZE on a
 * realistically sized table. Ids are fixed per index, so re-running adds nothing.
 */
export async function seedBulkProducts(
  prisma: PrismaClient,
  categoryIds: string[],
  count: number,
  idFor: (key: string) => string,
): Promise<number> {
  let inserted = 0;
  for (let start = 0; start < count; start += BATCH_SIZE) {
    const rows = [];
    for (let i = start; i < Math.min(start + BATCH_SIZE, count); i++) {
      const next = random(i + 1);
      const cents = Math.floor(100 + next() ** 2 * 99_900);
      rows.push({
        id: idFor(`bulk:${i}`),
        name: `${pick(ADJECTIVES, next)} ${pick(MATERIALS, next)} ${pick(NOUNS, next)} ${100 + i}`,
        description: 'Synthetic product used to exercise the catalog queries.',
        price: (cents / 100).toFixed(2),
        stock: next() < 0.2 ? 0 : 1 + Math.floor(next() * 200),
        categoryId: categoryIds[i % categoryIds.length],
        // About 2% archived, so the live filter has something to exclude.
        deletedAt: next() < 0.02 ? new Date(BASE_TIME) : null,
        createdAt: new Date(BASE_TIME + i * 60_000),
      });
    }
    inserted += (await prisma.product.createMany({ data: rows, skipDuplicates: true })).count;
  }
  return inserted;
}
