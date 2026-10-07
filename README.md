# Mini Marketplace

A small online shop with an admin panel. Customers browse and search a product catalogue, fill a cart, check out with a (mock) payment and follow the order's status. Administrators manage products, stock, categories and orders, and read sales analytics with a chart and a CSV export.

NestJS and React on PostgreSQL and Redis. The whole stack starts with one command.

> The payment is simulated. No payment provider is involved.

## Run it

You need Docker with Compose v2.

```bash
git clone https://github.com/JuFios/mini-marketplace.git
cd mini-marketplace
docker compose up --build
```

The first build takes a few minutes. When the log goes quiet, open <http://localhost:8080>.

|                                | Address                               |
| ------------------------------ | ------------------------------------- |
| Shop and admin panel           | <http://localhost:8080>               |
| API documentation (Swagger UI) | <http://localhost:8080/api/docs>      |
| OpenAPI document (JSON)        | <http://localhost:8080/api/docs-json> |

Demo accounts, created by the seed:

| Role                            | Email                | Password       |
| ------------------------------- | -------------------- | -------------- |
| Administrator                   | `admin@example.com`  | `Admin12345`   |
| Customer, with an order history | `customer@example.com` | `Customer12345` |

You can also register a new customer. Registration always creates a customer; the administrator comes from the seed.

Things worth knowing:

- The seed adds 6 categories, 60 products and about a month of past orders, so the dashboard has something to show. It is idempotent: running it again adds nothing.
- Product pictures are linked from `picsum.photos`; without internet access the shop shows a placeholder instead.
- The mock payment provider declines about 10 % of the orders (`PAYMENT_MOCK_FAILURE_RATE`). A declined order is cancelled and its stock returns. `PAYMENT_MOCK_FAILURE_RATE=0 docker compose up` approves everything.
- `docker compose down` stops the stack. `docker compose down -v` also deletes the database, the Redis data and the uploaded pictures.
- The web port is bound to `127.0.0.1`, because the demo accounts have published passwords. Change the port with `WEB_PORT`. Serve the network with `WEB_HOST=0.0.0.0`, but only after replacing the published passwords and signing keys (see [Configuration](#configuration)).
- `node scripts/smoke.mjs` (Node 20 or newer, no packages) checks a running stack through port 8080: it logs in, buys a product, waits for the worker to process the order, checks the stock, then cancels the order and checks it again. CI runs it on every push.

### What starts

| Service            | Role                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web`              | nginx. Serves the React build and forwards `/api` and `/uploads` to the API, so the browser sees one origin: no CORS, plain cookies. Sets the CSP and other headers. The only published port. |
| `api`              | The NestJS HTTP API.                                                                                                                                                                         |
| `worker`           | The same image running `node dist/worker.js`: the BullMQ consumer that pays for orders, the sweeper for lost order jobs, and the cleanup of unused pictures and expired refresh tokens.      |
| `migrate`          | Runs once: applies the migrations and seeds. `api` and `worker` wait for it.                                                                                                                  |
| `postgres`, `redis` | The data stores. Their ports are not published unless `POSTGRES_PORT` / `REDIS_PORT` are set (see [Development](#development)).                                                              |

## How it works

```
Browser ──► web (nginx :8080) ── /api, /uploads ──► api (NestJS) ──► PostgreSQL
                │                                      │ enqueue          ▲
                └─ static React build                  ▼                  │
                                                     Redis ──► worker (BullMQ)
```

PostgreSQL is the single source of truth for stock, carts and orders. Redis holds only derived or short-lived data: the catalogue cache, the job queue and the rate-limit counters. Losing Redis never loses an order or corrupts stock.

### Backend

Modules: `auth`, `users`, `categories`, `products` (with the catalogue cache), `cart`, `orders` (checkout, lifecycle, queue), `payments`, `analytics`. Inside a module the flow is `controller → service → repository`: controllers do HTTP only (DTOs, status codes, guards), services hold the business rules and transactions, and repositories are the only code that talks to Prisma. A module never imports another module's repository.

- **Validation.** `class-validator` DTOs with `whitelist` and `forbidNonWhitelisted`. Responses are explicit DTOs built by mapper functions, so a Prisma entity (with a password hash, say) is never serialised by accident.
- **Errors.** Domain exceptions carry a stable code. One filter turns everything into the same envelope, including database errors (unique violation, `CHECK` violation, deadlock), and never leaks internals:

  ```json
  { "statusCode": 409, "code": "INSUFFICIENT_STOCK", "message": "Not enough stock for \"Wireless Mouse\"",
    "details": [{ "productId": "…", "requested": 3, "available": 1 }], "requestId": "…" }
  ```

- **Money** is `NUMERIC(12,2)` in the database, `Prisma.Decimal` in code and a decimal string in JSON. A JS `number` never holds an amount on the backend.
- **Sales figures.** The dashboard and the CSV report count the orders that are `PROCESSING`, `SHIPPED` or `COMPLETED` (paid and not cancelled), on the UTC day the order was *placed*, not the day it was paid, shipped or cancelled. An order cancelled later therefore drops out of its day, and a figure for a past period can go down.
- **Pictures** are uploaded to a volume under generated names and attached to a product by URL. Nothing deletes a file when a product's picture is replaced or cleared, or when an upload is never attached, so an hourly job in the worker does it: it deletes every uploaded picture that no product uses (archived products count as using theirs, they can be restored) and that is more than a day old. The day is the grace period for a product form that is still open. The worker therefore needs the volume the API writes to, which the compose file mounts into both.
- **Logging** is JSON with a request id. Domain events have a stable `event` field (`order.created`, `order.status_changed`, `stock.adjusted`, …). Credentials are redacted, and request headers are not logged at all.
- **Configuration** is read from the environment once, validated by a schema at boot, and reachable only through one typed service. An invalid value stops the process with the names of the variables and the reasons, never the values.

### Checkout and stock

The central requirement is that stock can never be sold twice, however requests interleave and however many API instances run. Reading the stock and then writing it back is not safe, even inside a transaction, because a plain `SELECT` takes no lock. Instead, every product is decremented by **one statement whose `WHERE` clause is the check**:

```sql
UPDATE products
SET    stock = stock - $qty, updated_at = now()
WHERE  id = $id AND deleted_at IS NULL AND stock >= $qty
RETURNING id, name, price;
```

The `UPDATE` locks the row. A concurrent buyer waits, and when the lock is released PostgreSQL re-evaluates `stock >= $qty` against the newly committed row. If the last unit is gone, no row comes back and the whole transaction rolls back, together with the decrements already made for other items of the same cart. A `CHECK (stock >= 0)` constraint stands behind this as a last line of defence.

The rest of the checkout transaction:

- The user's cart rows are locked first (`FOR UPDATE`), which serialises double clicks and two tabs of the same user.
- Products are always locked in ascending id order, here and when cancelling an order, so concurrent multi-item checkouts cannot deadlock. If PostgreSQL still reports a deadlock, the API answers `409 CONCURRENT_UPDATE`, and the client may retry safely.
- The price is read from the locked row, so an order always charges the price at the moment of purchase.
- The `Idempotency-Key` header is stored on the order under a unique `(user_id, idempotency_key)` index. A retry after a lost response returns the same order (`200`, `Idempotent-Replayed: true`) instead of creating a second one. The same key with a different shipping address is refused (`422 IDEMPOTENCY_KEY_REUSED`), not answered with an order the caller did not ask for.
- Only purchased cart rows are deleted; an item added from another tab during the checkout stays in the cart.
- Side effects (cache invalidation, enqueueing the payment job, the log line) run after the commit, so a rollback never leaves one behind.

After creation, stock changes again only in two ways: cancelling an order puts the units back (exactly once, even if cancels race with each other or with the worker), and an administrator changes stock by a **delta** (`stock + delta`, never an absolute value), so an admin edit cannot overwrite units sold in the meantime.

The test suite covers this directly: 20 users checking out the last 5 units in parallel produce exactly 5 orders and 15 refusals with final stock 0; overlapping carts in opposite order run in parallel without deadlock; five parallel requests with one idempotency key produce one order; and every concurrency test checks the invariant `initial stock = current stock + units in non-cancelled orders`.

### Orders and the queue

`NEW → PROCESSING → SHIPPED → COMPLETED`, with `CANCELLED` possible from `NEW` and `PROCESSING`. The rules are one table in one pure function that is tested exhaustively. Every transition is a conditional update (`UPDATE … WHERE id = $id AND status = $from`), so racing customers, administrators and the worker cannot both win; the loser gets `409 INVALID_ORDER_TRANSITION`.

Payment does not happen in the request. Checkout commits the order and then hands it to a BullMQ queue (`jobId = orderId`, so an order can be queued only once). The worker process is idempotent by construction: it does nothing unless the order is still `NEW`, the mock provider's reference and verdict are a function of the order id, a decline cancels the order and restocks it in one transaction, and infrastructure errors are retried with exponential backoff. If Redis is down when the order is placed, checkout still succeeds and the order waits in `NEW`; a sweeper in the worker (every minute) re-enqueues orders that have been `NEW` for more than two minutes.

### Catalogue cache

The public catalogue (list, product, categories) is cached in Redis with a **version number in the key**. Any change bumps the version after its transaction commits; old keys become unreachable at once and expire by their TTL. Readers read the version before the database and writers bump it after the commit, so stale data cannot be served once an invalidation has finished. There is no key scanning. If Redis fails, requests fall through to the database. Stock shown in the catalogue may be a moment old; checkout always reads locked rows.

### Authentication

Access token (JWT, 15 minutes) in the `Authorization` header, kept in memory by the SPA and never in web storage. Refresh token (JWT, 7 days, a different secret) in an `HttpOnly`, `SameSite=Strict` cookie scoped to the auth path, persisted server-side by id. Every refresh **rotates** the token, and presenting a used one is treated as theft: the whole token family is revoked. A daily job in the worker deletes the rows of expired tokens; a used token's row stays until the token expires, because that row is what recognises a replay. Passwords use argon2id, a wrong password and an unknown email give the same answer, and login is rate limited. Roles come only from the verified token, and a customer's queries always filter by the token's user id, so another customer's order is a `404`, not a `403`.

### Frontend

React with TypeScript, feature folders, and TanStack Query as the only server-state tool (no global client store).

- The catalogue and the order and admin tables keep their filters in the URL, so a view can be shared and the back button works.
- The cart is optimistic: changes show at once, a failure rolls back with the server's message, and mutations run one after another so out-of-order answers cannot overwrite newer state. Quantities are absolute, so retries are harmless.
- The refresh call is single-flight inside the tab and under a Web Lock across tabs, because two tabs presenting the same rotated cookie would trip the reuse detection and log the user out.
- Checkout generates one `Idempotency-Key` per purchase attempt (new only when the cart or the shipping address changes), then polls the order until the payment result arrives.
- Every data view handles loading, empty and error states. Forms use React Hook Form with Zod and show the API's field errors.
- Admin pages are lazy-loaded, so customers never download them; the chart library is only in the dashboard's chunk.
- Components that appear in Storybook are presentational: props in, callbacks out, no data fetching.

## Decisions and why

### PostgreSQL rather than MongoDB

The data is relational (orders, order lines, products, categories, carts) and the key requirement needs what PostgreSQL does best: multi-row ACID transactions, row locks, a `CHECK` constraint on stock, exact `NUMERIC` money, and aggregate queries for the analytics (`GROUP BY`, `generate_series` for days without sales). Search uses `ILIKE` with a trigram index.

Indexes follow the queries: a trigram GIN index on the product name; `(category_id, price)` and `(category_id, created_at DESC)` for filtering and sorting inside a category; `price` and `created_at` for the unfiltered sorts; `(user_id, created_at DESC)` for order history; `(status, created_at)` for admin filters, analytics and the sweeper; and unique `(user_id, idempotency_key)`. Query plans were checked on about 5,000 products (`npx prisma db seed -- --bulk 5000` creates them). The result is mixed, and worth stating: category and price filters use the B-tree indexes as designed, but for a common search term PostgreSQL prefers walking `created_at` or a sequential scan over the trigram index, which is the right call at this table size (a few milliseconds). The trigram index wins when the term is rare.

### Libraries

| Choice                                | Why                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NestJS 11                             | Modules, dependency injection, guards and pipes give the required layering. Kept on 11 (CommonJS) because 12 is ESM-only and would change the Jest-based test stack. |
| Prisma 7 with the `pg` adapter        | Type-safe queries and migrations. The statements where exact SQL matters (stock decrement, analytics) are raw tagged-template SQL, and the unsafe raw variants are banned by a lint rule. |
| BullMQ                                | A durable queue with retries, backoff and job schedulers on the Redis the project already runs.                                                              |
| `class-validator`, `zod`              | DTO validation as the brief asks; `zod` validates the environment at boot.                                                                                   |
| `argon2`                              | argon2id password hashing.                                                                                                                                   |
| `@nestjs/throttler` with Redis storage | Limits shared by all API instances; a small own storage that fails open, so a Redis outage does not stop logins and checkouts.                              |
| `helmet`, `nestjs-pino`, `@nestjs/swagger`, `@nestjs/terminus` | Security headers, structured logs with redaction, API documentation generated from the DTOs, the health endpoint.                    |
| Jest and Supertest                    | Unit tests, and end-to-end tests against real PostgreSQL and Redis.                                                                                          |
| Vite, React 19, React Router 8        | The SPA, with lazy routes for the admin area.                                                                                                                |
| TanStack Query                        | Server state, caching, and optimistic updates with a serial mutation scope.                                                                                  |
| React Hook Form and Zod               | Forms with schema validation; server errors are mapped onto fields.                                                                                          |
| axios                                 | Interceptors for the single-flight token refresh.                                                                                                            |
| Tailwind CSS 4, Recharts, sonner      | Styling with a small own component kit, the sales chart, toasts.                                                                                             |
| Storybook 10                          | Key UI components in isolation, built separately from the app.                                                                                               |
| Vitest and Testing Library            | Frontend tests.                                                                                                                                              |

## Development

You need Node 22.22 or newer (`.nvmrc`) and Docker for the databases.

```bash
nvm use
npm install
cp .env.example .env
docker compose up -d postgres redis
(cd apps/api && npx prisma migrate deploy && npx prisma db seed)

npm run dev -w api          # API on :3000, Swagger UI at http://localhost:3000/api/docs
npm run dev:worker -w api   # the order worker; without it new orders stay NEW
npm run dev -w web          # SPA on :5173, forwards /api and /uploads to :3000
npm run storybook -w web    # component stories on :6006
```

- If another PostgreSQL already listens on 5432, set `POSTGRES_PORT=5433` in `.env` and put the same port in `DATABASE_URL` before `docker compose up -d postgres redis`. `REDIS_PORT` works the same way. With no `.env`, Docker picks free ports for the dependencies, so the full stack never collides with anything on your machine.
- A new migration: `cd apps/api && npx prisma migrate dev --name <name>`. After editing `schema.prisma`, run `npx prisma generate`. Migrations are append-only.
- `npx prisma db seed -- --bulk 5000` adds about 5,000 synthetic products for query-plan work.
- The dependencies and the full stack are one Compose project: running `docker compose up --build` while they are up reuses those two containers and their data.

## Testing

```bash
npm run lint && npm run format:check && npm run typecheck
npm test                                  # API unit tests (Jest) and web tests (Vitest)
docker compose up -d postgres redis
npm run test:e2e -w api                   # API end-to-end tests, real PostgreSQL and Redis
node scripts/smoke.mjs                    # a running docker compose stack
```

The end-to-end tests run serially against a dedicated database (`mini_marketplace_test`) and Redis database 1. They truncate every table and flush Redis, so they refuse to start unless the database name ends in `_test` and Redis selects a non-zero database. To point them at other ports, put `DATABASE_URL` and `REDIS_URL` in `apps/api/.env.test.local` (git-ignored). They include the critical flow (add to cart, check out, stock decreases, the worker moves the order to `PROCESSING`), the concurrency and idempotency tests described above, authentication flows (rotation, reuse detection, `401`/`403`/`429`), cache invalidation, order lifecycle and cancellation with restock, and analytics numbers computed by hand.

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request: lint, format check and typecheck; API unit tests; web tests, the production build and the Storybook build; API end-to-end tests against PostgreSQL and Redis service containers (the seed runs twice to prove it is idempotent); and finally the Docker images are built, the stack is started from a clean checkout and the smoke test runs against it.

## API

Swagger UI at `/api/docs` describes every endpoint and is usable as is: log in with `POST /api/v1/auth/login` and paste the access token into **Authorize**. Overview:

| Area      | Endpoints                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth      | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`; `GET /users/me`                                                     |
| Catalogue | `GET /products` (search, category, price range, sort, pagination), `GET /products/:id`, `GET /categories`                                  |
| Cart      | `GET /cart`, `POST /cart/items`, `PATCH` and `DELETE /cart/items/:productId`, `DELETE /cart`                                               |
| Orders    | `POST /orders` (header `Idempotency-Key`), `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`                                     |
| Admin     | `/admin/products` (CRUD, stock adjustments, archive and restore, image upload), `/admin/categories`, `/admin/orders` (list, status change) |
| Analytics | `GET /admin/analytics/summary`, `/sales-by-day`, `/sales-report.csv` (streamed, formula-injection safe)                                     |

All paths are under `/api/v1`. Lists are paginated (`page` and `limit`, both capped). Anything under `/admin` needs the administrator role.

## Configuration

Docker needs no `.env`: every variable has a default in `docker-compose.yml`. Create a `.env` to change one; `.env.example` documents all of them.

| Variable                                    | Default                  | Meaning                                                                                       |
| ------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `REDIS_URL`                 | local services           | Connection URLs (for processes on the host; inside Compose they are set for you).             |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`   | published placeholders   | HS256 keys, at least 32 characters and different. **Replace before sharing the stack.**       |
| `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS` | `900`, `604800`  | Token lifetimes.                                                                              |
| `COOKIE_SECURE`                             | `false`                  | Set `true` wherever the API is served over HTTPS.                                             |
| `TRUST_PROXY`                               | `0` (Compose: `1`)       | Reverse proxies in front of the API. Only then is `X-Forwarded-For` believed (rate limits).   |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`             | `admin@example.com`, `Admin12345` | The seeded administrator.                                                            |
| `DEMO_CUSTOMER_PASSWORD`                    | `Customer12345`          | Password of the seeded demo customer.                                                         |
| `UPLOAD_DIR`, `UPLOAD_MAX_BYTES`            | `./uploads`, `2097152`   | Where product pictures are stored (a volume in Compose) and the size limit.                   |
| `CATALOG_CACHE_TTL_SECONDS`                 | `120`                    | Upper bound for serving a cached catalogue response.                                          |
| `PAYMENT_MOCK_FAILURE_RATE`, `PAYMENT_MOCK_DELAY_MS` | `0.1`, `1000`   | Share of orders the mock provider declines, and how long a charge takes.                      |
| `SWAGGER_ENABLED`, `LOG_LEVEL`              | `true`, `info`           | Swagger UI on or off; log verbosity.                                                          |
| `WEB_HOST`, `WEB_PORT`                      | `127.0.0.1`, `8080`      | Where the web app is published.                                                               |
| `POSTGRES_*`, `REDIS_PORT`                  | see `.env.example`       | Credentials of the database container and host ports for the dependencies.                    |

## Security

- **Passwords and sessions:** argon2id; the access token only in memory, the refresh token in an `HttpOnly`, `SameSite=Strict`, path-scoped cookie with rotation and reuse detection; separate signing keys.
- **Access control:** a global authentication guard (public routes are opt-in), a roles guard for `/admin`, and ownership taken only from the token. Role and ownership never come from a request body or parameter.
- **Input:** whitelisted DTOs on every route, bounded pagination, money as strings. Raw SQL is only through tagged templates (the unsafe variants are banned by a lint rule). Uploads are checked for size and for the file's leading bytes, stored under server-generated names and served with `nosniff`. External image URLs are stored but never fetched by the server, so there is no SSRF path. The CSV export neutralises spreadsheet formulas.
- **Rate limits** (Redis, shared by all instances, fail-open): 100 requests a minute per client for everything; login 5 a minute per client and email and 20 a minute per client; registration 10 an hour; refresh 30 a minute. The client address comes from nginx's `X-Forwarded-For`, which nginx overwrites, so a forged header cannot buy a new budget (checked against the running stack).
- **Headers:** helmet on the API. nginx adds a Content-Security-Policy to the app (`script-src 'self'`, no framing, no plugins), `nosniff`, `Referrer-Policy`, `Permissions-Policy` and `X-Frame-Options`, and hides its version. The CSP allows inline styles (React style attributes, the toast library) and `https:` images (product pictures linked from elsewhere). HSTS is not sent because the stack serves plain HTTP; send it from whatever terminates TLS.
- **Logs:** no request headers, and authorization, cookies, passwords and tokens are redacted. After a full smoke run the container logs contain none of the test credentials or tokens.
- **Containers:** the API and the worker run as a non-root user from a production-only dependency set; the web image is the unprivileged nginx. No secret is baked into an image (`.env` files are excluded from the build context), and the published ports are on loopback.
- **Dependencies:** `npm audit` is not clean, and the reasons are specific. Production dependencies of the API image (`npm audit --omit=dev --omit=optional`) show one moderate advisory: `js-yaml` inside `@nestjs/swagger` 11, about CPU use when *parsing* YAML with merge keys. The API only serialises its own OpenAPI document with it. The fix is `@nestjs/swagger` 12, which needs Nest 12 and ESM, a migration postponed on purpose. Without `--omit=optional`, `npm audit` also flags the Prisma CLI's own dependencies (`mysql2`, `deepmerge-ts`), because the client lists the CLI as an optional peer. They are not installed in the API image, the CLI only runs in the one-shot `migrate` container against this repository's schema, and the suggested fix is a downgrade to Prisma 6. The remaining findings are in development tooling that is not shipped.

Before exposing the stack to anyone else: replace the JWT secrets and `ADMIN_PASSWORD`, delete or re-password the demo customer, terminate TLS in front of it (and set `COOKIE_SECURE=true`), consider `SWAGGER_ENABLED=false`, and keep Redis for the queue apart from the cache.

## What is not done, and what I would do differently

- **Payments are a mock**, and so is the "order confirmation sent" email: both are only log events. A real integration needs provider webhooks and reconciliation.
- **One Redis** serves the cache, the queue and the rate-limit counters, with `noeviction` because BullMQ needs it. In production the cache would be a separate instance that is allowed to evict.
- **Search is `ILIKE` with a trigram index.** It is fine for this catalogue and measured honestly above, but real search wants full-text search or a search engine. Every list also runs a `count`, which the cache hides.
- **Every checkout and cancellation invalidates the whole catalogue cache**, which lowers the hit rate when many people are buying. The alternative is to cache products without stock and read stock live.
- **Prices:** the cart always shows current prices and the order takes the price at checkout, but there is no "the total changed, confirm?" step.
- **Scope of the shop:** one currency, no taxes, shipping costs or discounts, no stock reservation at add-to-cart (the cart only warns; checkout is the authority), no guest checkout.
- **Pictures** live on a local volume. Object storage with resizing is the next step; the storage sits behind an interface for that reason. Unused pictures are found by listing the directory once an hour, so one stays for up to a day and an hour after it stops being used; with object storage this would be a lifecycle rule, or a delete at the moment of replacement.
- **Admin:** no user management and no audit trail beyond the logs.
- **Frontend:** no browser end-to-end tests (the flows are covered by component and integration tests and were walked through by hand), no i18n, and Storybook covers the key components only.
- **Operations:** no metrics or tracing, no readiness check for the worker, no Kubernetes manifests, and CI builds the images without publishing them. TLS termination is not part of the stack.

## Repository layout

```
apps/
  api/        NestJS API and worker: prisma/ (schema, migrations, seed), src/, test/ (end-to-end tests)
  web/        React SPA (Vite), Storybook, nginx.conf and Dockerfile
docker/       PostgreSQL init script (creates the end-to-end test database)
scripts/      smoke.mjs, the smoke test for a running stack
docker-compose.yml, .env.example, .github/workflows/ci.yml
```
