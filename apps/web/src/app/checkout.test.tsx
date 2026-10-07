import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cartApi from '@/features/cart/api';
import * as catalogApi from '@/features/catalog/api';
import * as checkoutApi from '@/features/checkout/api';
import * as ordersApi from '@/features/orders/api';
import { ApiError } from '@/shared/api/errors';
import type { Order } from '@/shared/api/types';
import { CUSTOMER, deferred } from '@/test/fake-api';
import {
  cart,
  cartItem,
  EMPTY_CART,
  MOUSE,
  KEYBOARD,
  ORDER_ID,
  ORDER_NUMBER,
  order,
} from '@/test/fixtures';
import { renderApp } from '@/test/render-app';

vi.mock('@/features/cart/api');
vi.mock('@/features/catalog/api');
vi.mock('@/features/checkout/api');
vi.mock('@/features/orders/api');
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const fetchCart = vi.mocked(cartApi.fetchCart);
const placeOrder = vi.mocked(checkoutApi.placeOrder);

// 2 × 19.99 = 39.98
const twoMice = cart([cartItem(MOUSE, 2)], { subtotal: '39.98' });
// 1 × 19.99 = 19.99
const oneMouse = cart([cartItem(MOUSE, 1)], { subtotal: '19.99' });

const ADDRESS = '12 Main Street, Springfield 12345';
const NEW_ADDRESS = '99 Other Road, Shelbyville 54321';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function apiError(status: number, code: string, message = `${code} message`, details?: unknown) {
  return new ApiError({ status, code, message, details, requestId: 'req-7' });
}

const lostResponse = () => new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' });

async function fillAddressAndPay(address = ADDRESS) {
  await userEvent.type(await screen.findByLabelText(/Shipping address/), address);
  await userEvent.click(screen.getByRole('button', { name: 'Pay (mock)' }));
}

/** The key each `placeOrder` call carried, oldest first. */
const keysSent = () => placeOrder.mock.calls.map(([, key]) => key);

beforeEach(() => {
  vi.resetAllMocks();
  fetchCart.mockResolvedValue(twoMice);
  vi.mocked(catalogApi.fetchProducts).mockResolvedValue({
    items: [],
    meta: { page: 1, limit: 12, total: 0, totalPages: 0 },
  });
  vi.mocked(catalogApi.fetchCategories).mockResolvedValue([]);
  vi.mocked(ordersApi.fetchOrder).mockResolvedValue(order());
});

describe('the checkout page', () => {
  it('summarises the cart with its total next to the address form', async () => {
    renderApp('/checkout', CUSTOMER);

    const summary = await screen.findByRole('region', { name: 'Order summary' });

    expect(within(summary).getByText('Wireless Mouse')).toBeInTheDocument();
    expect(within(summary).getByText(/2 ×/)).toBeInTheDocument();
    expect(within(summary).getByText('$39.98', { selector: 'dd *, dd' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay (mock)' })).toBeEnabled();
  });

  it('shows an empty cart as a dead end with a way out', async () => {
    fetchCart.mockResolvedValue(EMPTY_CART);
    renderApp('/checkout', CUSTOMER);

    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse products' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Pay (mock)' })).not.toBeInTheDocument();
  });

  it('is reached from the cart page', async () => {
    const { router } = renderApp('/cart', CUSTOMER);

    await userEvent.click(await screen.findByRole('link', { name: 'Proceed to checkout' }));

    expect(router.state.location.pathname).toBe('/checkout');
    expect(await screen.findByRole('button', { name: 'Pay (mock)' })).toBeInTheDocument();
  });

  it('cannot be reached from a cart that checkout would refuse', async () => {
    fetchCart.mockResolvedValue(
      cart([cartItem(MOUSE, 1, { isAvailable: false })], { subtotal: '19.99' }),
    );
    renderApp('/cart', CUSTOMER);

    expect(await screen.findByRole('button', { name: 'Proceed to checkout' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Proceed to checkout' })).not.toBeInTheDocument();
  });
});

describe('paying', () => {
  it('sends the address with an Idempotency-Key and opens the new order', async () => {
    placeOrder.mockResolvedValue(order());
    const { router } = renderApp('/checkout', CUSTOMER);

    await fillAddressAndPay();

    expect(
      await screen.findByRole('heading', { name: `Order ${ORDER_NUMBER}` }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/orders/${ORDER_ID}`);
    expect(placeOrder).toHaveBeenCalledTimes(1);
    expect(placeOrder).toHaveBeenCalledWith(ADDRESS, expect.stringMatching(UUID));
    // The order is still waiting for its payment.
    expect(screen.getByText('Confirming your payment…')).toBeInTheDocument();
  });

  it('asks the server for the cart again once the order is placed', async () => {
    placeOrder.mockResolvedValue(order());
    fetchCart.mockResolvedValueOnce(twoMice).mockResolvedValue(EMPTY_CART);
    renderApp('/checkout', CUSTOMER);

    await fillAddressAndPay();

    await screen.findByRole('heading', { name: `Order ${ORDER_NUMBER}` });
    await waitFor(() => expect(fetchCart).toHaveBeenCalledTimes(2));
    // The header badge follows the server's (now empty) cart.
    expect(await screen.findByRole('link', { name: 'Cart' })).toBeInTheDocument();
  });

  it('trims the address and refuses one that is too short, without calling the server', async () => {
    renderApp('/checkout', CUSTOMER);

    await fillAddressAndPay('  Home  ');

    expect(
      await screen.findByText('Shipping address must be at least 10 characters'),
    ).toBeInTheDocument();
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('asks for an address when there is none', async () => {
    renderApp('/checkout', CUSTOMER);

    await userEvent.click(await screen.findByRole('button', { name: 'Pay (mock)' }));

    expect(await screen.findByText('Shipping address is required')).toBeInTheDocument();
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('puts the API’s complaint about the address on the field', async () => {
    placeOrder.mockRejectedValue(
      apiError(400, 'VALIDATION_FAILED', 'Validation failed', [
        { field: 'shippingAddress', messages: ['shippingAddress must be shorter'] },
      ]),
    );
    renderApp('/checkout', CUSTOMER);

    await fillAddressAndPay();

    expect(await screen.findByText('shippingAddress must be shorter')).toBeInTheDocument();
  });

  it('is busy while the request is in flight, and a second click sends nothing', async () => {
    const reply = deferred<Order>();
    placeOrder.mockReturnValue(reply.promise);
    renderApp('/checkout', CUSTOMER);

    await fillAddressAndPay();
    const pay = screen.getByRole('button', { name: 'Pay (mock)' });
    await waitFor(() => expect(pay).toBeDisabled());
    await userEvent.click(pay);
    await userEvent.click(pay);

    expect(placeOrder).toHaveBeenCalledTimes(1);

    reply.resolve(order());
    expect(
      await screen.findByRole('heading', { name: `Order ${ORDER_NUMBER}` }),
    ).toBeInTheDocument();
  });
});

describe('when paying fails', () => {
  it('reuses the same Idempotency-Key when the customer retries after a lost response', async () => {
    placeOrder.mockRejectedValueOnce(lostResponse()).mockResolvedValue(order());
    renderApp('/checkout', CUSTOMER);

    await fillAddressAndPay();

    // The outcome is unknown, and the page says pressing Pay again is safe.
    expect(await screen.findByRole('alert')).toHaveTextContent('will not create a duplicate');
    await userEvent.click(screen.getByRole('button', { name: 'Pay (mock)' }));

    expect(
      await screen.findByRole('heading', { name: `Order ${ORDER_NUMBER}` }),
    ).toBeInTheDocument();
    expect(placeOrder).toHaveBeenCalledTimes(2);
    const [first, second] = keysSent();
    expect(first).toMatch(UUID);
    expect(second).toBe(first);
  });

  it('uses a new key when the address is changed before trying again, so the server cannot answer with the old address', async () => {
    placeOrder.mockRejectedValueOnce(lostResponse()).mockResolvedValue(order());
    renderApp('/checkout', CUSTOMER);
    await fillAddressAndPay();
    await screen.findByRole('alert');

    const field = screen.getByLabelText(/Shipping address/);
    await userEvent.clear(field);
    await userEvent.type(field, NEW_ADDRESS);
    await userEvent.click(screen.getByRole('button', { name: 'Pay (mock)' }));

    await screen.findByRole('heading', { name: `Order ${ORDER_NUMBER}` });
    expect(placeOrder).toHaveBeenLastCalledWith(NEW_ADDRESS, expect.stringMatching(UUID));
    const [first, second] = keysSent();
    expect(second).not.toBe(first);
  });

  it('keeps the key when only spaces around the address change', async () => {
    placeOrder.mockRejectedValueOnce(lostResponse()).mockResolvedValue(order());
    renderApp('/checkout', CUSTOMER);
    await fillAddressAndPay();
    await screen.findByRole('alert');

    await userEvent.type(screen.getByLabelText(/Shipping address/), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Pay (mock)' }));

    await screen.findByRole('heading', { name: `Order ${ORDER_NUMBER}` });
    const [first, second] = keysSent();
    expect(second).toBe(first);
  });

  it('does not reload the cart after a lost response (the order may exist)', async () => {
    placeOrder.mockRejectedValue(lostResponse());
    renderApp('/checkout', CUSTOMER);

    await fillAddressAndPay();
    await screen.findByRole('alert');

    expect(fetchCart).toHaveBeenCalledTimes(1);
  });

  it('names the product that ran out, reloads the cart, and uses a new key once the cart has changed', async () => {
    placeOrder
      .mockRejectedValueOnce(
        apiError(409, 'INSUFFICIENT_STOCK', 'Not enough stock for "Wireless Mouse"', [
          { productId: MOUSE.id, requested: 2, available: 1 },
        ]),
      )
      .mockResolvedValue(order());
    // The customer's second mouse is gone from the shelf: the reloaded cart holds one.
    fetchCart.mockResolvedValueOnce(twoMice).mockResolvedValue(oneMouse);
    renderApp('/checkout', CUSTOMER);

    await fillAddressAndPay();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not enough stock for "Wireless Mouse". Review your cart and try again.',
    );
    const summary = screen.getByRole('region', { name: 'Order summary' });
    await waitFor(() => expect(within(summary).getByText(/1 ×/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Pay (mock)' }));

    expect(
      await screen.findByRole('heading', { name: `Order ${ORDER_NUMBER}` }),
    ).toBeInTheDocument();
    const [first, second] = keysSent();
    expect(second).toMatch(UUID);
    expect(second).not.toBe(first);
  });

  it('explains an archived product, marks the line, and blocks paying until the cart is fixed', async () => {
    placeOrder.mockRejectedValue(apiError(409, 'PRODUCT_UNAVAILABLE'));
    fetchCart
      .mockResolvedValueOnce(twoMice)
      .mockResolvedValue(cart([cartItem(MOUSE, 2, { isAvailable: false })], { subtotal: '39.98' }));
    renderApp('/checkout', CUSTOMER);

    await fillAddressAndPay();

    await waitFor(() =>
      expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain(
        'A product in your cart is no longer available. Remove it from your cart and try again.',
      ),
    );
    expect(await screen.findByText('No longer available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay (mock)' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Update your cart' })).toHaveAttribute('href', '/cart');
  });

  it('shows the empty cart when the server says it has nothing to buy', async () => {
    placeOrder.mockRejectedValue(apiError(409, 'CART_EMPTY'));
    fetchCart.mockResolvedValueOnce(twoMice).mockResolvedValue(EMPTY_CART);
    renderApp('/checkout', CUSTOMER);

    await fillAddressAndPay();

    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay (mock)' })).not.toBeInTheDocument();
  });

  it('keeps what was typed after a failure', async () => {
    placeOrder.mockRejectedValue(apiError(409, 'CONCURRENT_UPDATE'));
    renderApp('/checkout', CUSTOMER);

    await fillAddressAndPay();

    expect(await screen.findByRole('alert')).toHaveTextContent('The shop is busy right now');
    expect(screen.getByLabelText(/Shipping address/)).toHaveValue(ADDRESS);
  });

  it('refuses to pay for a cart with a line the server would refuse, before asking it', async () => {
    fetchCart.mockResolvedValue(cart([cartItem(KEYBOARD, 5)], { subtotal: '447.50' }));
    renderApp('/checkout', CUSTOMER);

    expect(await screen.findByText('Only 3 in stock')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay (mock)' })).toBeDisabled();
    expect(placeOrder).not.toHaveBeenCalled();
  });
});
