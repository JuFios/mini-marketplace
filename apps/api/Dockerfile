# The API and its worker (one image, two commands), plus a one-shot `migrate` target that applies
# the migrations and seeds the database.
#
# The build context is the repository root, because the npm workspaces share one lockfile:
#   docker build -f apps/api/Dockerfile --target api .

# ---- build: compile with every dependency (TypeScript, Nest CLI, Prisma CLI)
FROM node:22.22-bookworm-slim AS build
# Prisma's schema engine (used by `migrate deploy`) detects the OpenSSL version through the
# `openssl` command, which the slim image lacks. Only this stage and `migrate` need it: the
# running API uses Prisma's WebAssembly query compiler and a JavaScript PostgreSQL driver.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Manifests first, so the dependency layer is rebuilt only when they change. The Prisma schema
# comes along because the package's `postinstall` generates the client.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN npm ci -w api --include-workspace-root

COPY tsconfig.base.json ./
COPY apps/api apps/api
WORKDIR /app/apps/api
# Not left to `postinstall` alone: the build must not depend on install scripts having run.
RUN npx prisma generate && npm run build

# ---- migrate: applies the migrations, then seeds. Needs the Prisma CLI and tsx, so it keeps the
# build stage's complete node_modules; it runs once and exits.
FROM build AS migrate
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

# ---- production dependencies only
FROM node:22.22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# `--omit=optional` also drops the Prisma CLI: it is an optional peer of the client, which npm
# treats as needed by production, and it brings a MySQL driver and other tooling that the API
# never loads. The native pieces left out are speed-ups with JavaScript fallbacks (msgpackr).
# Install scripts are skipped: argon2 ships prebuilt binaries, and the client was generated above.
RUN npm ci -w api --omit=dev --omit=optional --ignore-scripts

# ---- api: what actually runs
FROM node:22.22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app ./
COPY --from=build /app/apps/api/dist apps/api/dist
# Product images live on a volume mounted here; created now so the volume inherits the owner.
RUN mkdir -p /data/uploads && chown node:node /data/uploads
WORKDIR /app/apps/api
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
