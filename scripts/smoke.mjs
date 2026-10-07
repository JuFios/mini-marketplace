#!/usr/bin/env node
// End-to-end smoke test of a running stack, through the same entry point a browser uses:
//
//   docker compose up -d --build --wait
//   node scripts/smoke.mjs [http://localhost:8080]
//
// It walks the main flow once (health, Swagger, administrator login, a new customer buying a
// product, the worker paying for the order, cancelling it, the administrator seeing it) and exits
// with a non-zero status at the first thing that is wrong. Needs Node 20 or newer and no packages.
//
// ADMIN_EMAIL and ADMIN_PASSWORD (default: the seeded administrator) name the account to log in
// with. With PAYMENT_MOCK_FAILURE_RATE=0 on the stack the order is always paid; otherwise the mock
// provider may decline it, which is also a valid outcome of "the worker processed the order".

const BASE = (process.argv[2] ?? process.env.BASE_URL ?? 'http://localhost:8080').replace(
  /\/$/,
  '',
);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin12345';
const PROCESSING_TIMEOUT_MS = 60_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function step(name, action) {
  const started = Date.now();
  try {
    const result = await action();
    console.log(`  ok   ${name} (${Date.now() - started} ms)`);
    return result;
  } catch (error) {
    console.error(
      `  FAIL ${name}\n       ${error instanceof Error ? error.message : String(error)}`,
    );
    // Later steps depend on earlier ones; carrying on would only bury the first cause.
    console.error('\nSmoke test failed.');
    process.exit(1);
  }
}

async function request(path, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { response, text, json, status: response.status };
}

/** Like `request`, but the status must be the expected one; the body is part of the message. */
async function expectStatus(expected, path, options) {
  const result = await request(path, options);
  assert(
    result.status === expected,
    `${options?.method ?? 'GET'} ${path}: expected ${expected}, got ${result.status} ${result.text.slice(0, 300)}`,
  );
  return result;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log(`Smoke test of ${BASE}\n`);

console.log('Front door');
const home = await step('the app shell is served, with a security policy', async () => {
  const { response, text } = await expectStatus(200, '/');
  assert(text.includes('<div id="root">'), 'the page has no <div id="root">');
  const csp = response.headers.get('content-security-policy') ?? '';
  assert(csp.includes("script-src 'self'"), `unexpected Content-Security-Policy: "${csp}"`);
  assert(
    response.headers.get('x-content-type-options') === 'nosniff',
    'X-Content-Type-Options is not nosniff',
  );
  assert(response.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options is not DENY');
  assert(response.headers.get('server')?.includes('/') !== true, 'the nginx version is disclosed');
  assert(response.headers.get('cache-control') === 'no-cache', 'the app shell may be cached');
  return text;
});

await step('built assets are cached for good', async () => {
  const asset = /src="(\/assets\/[^"]+\.js)"/.exec(home)?.[1];
  assert(asset, 'no script asset found in the app shell');
  const { response } = await expectStatus(200, asset);
  assert(
    (response.headers.get('cache-control') ?? '').includes('immutable'),
    `Cache-Control of ${asset} is "${response.headers.get('cache-control')}"`,
  );
});

await step('a deep link falls back to the app shell', async () => {
  const { text } = await expectStatus(200, '/orders/does-not-exist');
  assert(text.includes('<div id="root">'), 'the SPA fallback did not serve the app shell');
});

console.log('\nAPI behind the proxy');
await step('health reports PostgreSQL and Redis up', async () => {
  const { json } = await expectStatus(200, '/api/v1/health');
  assert(json?.status === 'ok', `unexpected health body: ${JSON.stringify(json)}`);
});

await step('an unknown API path is a JSON error, not the app shell', async () => {
  const { response, json } = await expectStatus(404, '/api/v1/nope');
  assert(response.headers.get('content-type')?.includes('application/json'), 'the 404 is not JSON');
  assert(typeof json?.code === 'string', 'the error has no code');
});

await step('Swagger UI and its OpenAPI document are served', async () => {
  const ui = await expectStatus(200, '/api/docs');
  assert(ui.text.toLowerCase().includes('swagger'), 'the Swagger UI page is not Swagger');
  const { json } = await expectStatus(200, '/api/docs-json');
  assert(json?.openapi, 'the OpenAPI document has no version');
  assert(json.paths?.['/api/v1/orders'], 'the OpenAPI document does not describe /api/v1/orders');
});

console.log('\nAdministrator');
const admin = await step('the seeded administrator logs in', async () => {
  const { json, response } = await expectStatus(200, '/api/v1/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assert(json?.user?.role === 'ADMIN', `logged in as ${json?.user?.role}, not ADMIN`);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('refresh_token='));
  assert(cookie, 'no refresh cookie was set');
  assert(
    /HttpOnly/i.test(cookie) && /SameSite=Strict/i.test(cookie),
    `weak refresh cookie: ${cookie}`,
  );
  return json.accessToken;
});

await step('the seeded history shows up in the analytics', async () => {
  const { json } = await expectStatus(200, '/api/v1/admin/analytics/summary', { token: admin });
  assert(json.ordersCount > 0, 'the analytics summary has no orders: was the database seeded?');
});

console.log('\nCustomer buys a product');
const email = `smoke-${Date.now()}@example.com`;
const customer = await step('a new customer registers', async () => {
  const { json } = await expectStatus(201, '/api/v1/auth/register', {
    method: 'POST',
    body: { email, name: 'Smoke Test', password: 'Smoke12345' },
  });
  return json.accessToken;
});

const product = await step('the catalog has a product in stock', async () => {
  const { json } = await expectStatus(200, '/api/v1/products?inStock=true&limit=50');
  const found = json.items.find((item) => item.stock >= 10);
  assert(found, 'no product with at least 10 units in stock');
  return found;
});

await step('the product goes into the cart', async () => {
  const { json } = await expectStatus(200, '/api/v1/cart/items', {
    method: 'POST',
    token: customer,
    body: { productId: product.id, quantity: 1 },
  });
  assert(json.totalQuantity === 1, `cart holds ${json.totalQuantity} units`);
});

const key = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const order = await step('checkout creates a NEW order', async () => {
  const { json, response } = await expectStatus(201, '/api/v1/orders', {
    method: 'POST',
    token: customer,
    headers: { 'Idempotency-Key': key },
    body: { shippingAddress: '221B Baker Street, London NW1 6XE' },
  });
  assert(json.status === 'NEW', `a new order is ${json.status}`);
  assert(json.items.length === 1, `the order has ${json.items.length} lines`);
  assert(response.headers.get('location')?.endsWith(`/orders/${json.id}`), 'no Location header');
  return json;
});

await step('repeating the request with the same key returns the same order', async () => {
  const { json, response } = await expectStatus(200, '/api/v1/orders', {
    method: 'POST',
    token: customer,
    headers: { 'Idempotency-Key': key },
    body: { shippingAddress: '221B Baker Street, London NW1 6XE' },
  });
  assert(json.id === order.id, 'a second order was created');
  assert(response.headers.get('idempotent-replayed') === 'true', 'the replay is not marked as one');
});

const settled = await step('the worker processes the order', async () => {
  const deadline = Date.now() + PROCESSING_TIMEOUT_MS;
  for (;;) {
    const { json } = await expectStatus(200, `/api/v1/orders/${order.id}`, { token: customer });
    if (json.status !== 'NEW') return json;
    assert(
      Date.now() < deadline,
      `still NEW after ${PROCESSING_TIMEOUT_MS / 1000} s: is the worker running?`,
    );
    await sleep(500);
  }
});
console.log(`       → ${settled.status} / ${settled.paymentStatus}`);

await step('stock went down for a paid order (and stayed for a declined one)', async () => {
  const paid = settled.status === 'PROCESSING';
  assert(paid || settled.cancelReason === 'PAYMENT_FAILED', `unexpected outcome ${settled.status}`);
  const { json } = await expectStatus(200, `/api/v1/products/${product.id}`);
  const expected = paid ? product.stock - 1 : product.stock;
  assert(json.stock === expected, `stock is ${json.stock}, expected ${expected}`);
});

await step('the administrator sees the order', async () => {
  const { json } = await expectStatus(
    200,
    `/api/v1/admin/orders?customerEmail=${encodeURIComponent(email)}`,
    { token: admin },
  );
  assert(
    json.items.length === 1 && json.items[0].id === order.id,
    'the order is not in the admin list',
  );
});

if (settled.status === 'PROCESSING') {
  await step('cancelling the paid order refunds it and restores the stock', async () => {
    const { json } = await expectStatus(200, `/api/v1/orders/${order.id}/cancel`, {
      method: 'POST',
      token: customer,
    });
    assert(
      json.status === 'CANCELLED' && json.paymentStatus === 'REFUNDED',
      `got ${json.status}/${json.paymentStatus}`,
    );
    const after = await expectStatus(200, `/api/v1/products/${product.id}`);
    assert(
      after.json.stock === product.stock,
      `stock is ${after.json.stock}, expected ${product.stock}`,
    );
  });
}

console.log('\nSmoke test passed.');
