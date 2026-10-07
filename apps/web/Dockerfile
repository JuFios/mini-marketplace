# The storefront and admin panel: a static Vite build served by nginx, which also forwards /api
# and /uploads to the API so the browser talks to a single origin.
#
# The build context is the repository root (npm workspaces, one lockfile):
#   docker build -f apps/web/Dockerfile .

# ---- build
FROM node:22.22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# The root workspace carries TypeScript, which `tsc -b` in the build script needs.
RUN npm ci -w web --include-workspace-root
COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN npm run build -w web

# ---- serve: the unprivileged nginx image runs as a normal user and listens on 8080
FROM nginxinc/nginx-unprivileged:1.29-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
