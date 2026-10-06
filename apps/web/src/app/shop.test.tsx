import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cartApi from '@/features/cart/api';
import * as catalogApi from '@/features/catalog/api';
import { ApiError } from '@/shared/api/errors';
import type { Cart } from '@/shared/api/types';
import { ADMIN, CUSTOMER, deferred } from '@/test/fake-api';
import { ACCESSORIES, cart, cartItem, EMPTY_CART, KEYBOARD, MOUSE, page } from '@/test/fixtures';
import { renderApp } from '@/test/render-app';

vi.mock('@/features/catalog/api');
vi.mock('@/features/cart/api');
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const fetchProducts = vi.mocked(catalogApi.fetchProducts);
const fetchProduct = vi.mocked(catalogApi.fetchProduct);
const fetchCart = vi.mocked(cartApi.fetchCart);

const lastProductsQuery = () => fetchProducts.mock.lastCall?.[0];

beforeEach(() => {
  vi.resetAllMocks();
  fetchProducts.mockResolvedValue(page([MOUSE, KEYBOARD]));
  vi.mocked(catalogApi.fetchCategories).mockResolvedValue([ACCESSORIES]);
  fetchCart.mockResolvedValue(EMPTY_CART);
});

describe('catalog', () => {
  it('lists the products with price and availability', async () => {
    renderApp('/');

    expect(await screen.findByRole('link', { name: 'Wireless Mouse' })).toBeInTheDocument();
    expect(screen.getByText('$89.50')).toBeInTheDocument();
    expect(screen.getByText('Only 3 left')).toBeInTheDocument();
    expect(screen.getByText('2 products')).toBeInTheDocument();
  });

  it('reads the filters from the URL', async () => {
    renderApp('/?q=mouse&sort=price_asc&page=2&minPrice=5');

    await screen.findByRole('link', { name: 'Wireless Mouse' });

    expect(lastProductsQuery()).toMatchObject({
      search: 'mouse',
      sort: 'price_asc',
      page: 2,
      minPrice: '5',
    });
    expect(screen.getByLabelText('Search')).toHaveValue('mouse');
    expect(screen.getByLabelText('Sort by')).toHaveValue('price_asc');
  });

  it('writes the search to the URL after typing pauses, starting over from page 1', async () => {
    const { router } = renderApp('/?page=3');
    await screen.findByRole('link', { name: 'Wireless Mouse' });

    await userEvent.type(screen.getByLabelText('Search'), 'mouse');

    await waitFor(() => expect(router.state.location.search).toBe('?q=mouse'));
    await waitFor(() => expect(lastProductsQuery()).toMatchObject({ search: 'mouse', page: 1 }));
  });

  it('applies the category at once', async () => {
    const { router } = renderApp('/');
    await screen.findByRole('link', { name: 'Wireless Mouse' });

    await userEvent.selectOptions(await screen.findByLabelText('Category'), 'Accessories');

    await waitFor(() => expect(lastProductsQuery()).toMatchObject({ categoryId: ACCESSORIES.id }));
    expect(router.state.location.search).toBe(`?category=${ACCESSORIES.id}`);
  });

  it('pages through the results, and the back button returns to the previous page', async () => {
    fetchProducts.mockResolvedValue(page([MOUSE], { total: 30, totalPages: 3 }));
    const { router } = renderApp('/');
    await screen.findByRole('link', { name: 'Wireless Mouse' });

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    await waitFor(() => expect(lastProductsQuery()).toMatchObject({ page: 2 }));
    expect(router.state.location.search).toBe('?page=2');

    await act(() => router.navigate(-1));
    await waitFor(() => expect(lastProductsQuery()).toMatchObject({ page: 1 }));
  });

  it('refills the search box when the person navigates to another URL', async () => {
    const { router } = renderApp('/?q=mouse');
    await screen.findByRole('link', { name: 'Wireless Mouse' });

    await act(() => router.navigate('/?q=keyboard'));

    expect(screen.getByLabelText('Search')).toHaveValue('keyboard');
  });

  it('shows an empty state with a way back to everything', async () => {
    fetchProducts.mockResolvedValue(page([]));
    const { router } = renderApp('/?q=nothing');

    expect(await screen.findByText('No products found')).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('main')).getAllByRole('button', { name: 'Reset filters' })[1],
    );

    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('shows the error with a retry', async () => {
    fetchProducts.mockRejectedValueOnce(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'boom', requestId: 'req-5' }),
    );
    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByText('Reference: req-5')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: 'Wireless Mouse' })).toBeInTheDocument();
  });
});

describe('adding to the cart', () => {
  it('sends a visitor to the login and back to the same catalog view', async () => {
    const { router } = renderApp('/?q=mouse');
    await screen.findByRole('link', { name: 'Wireless Mouse' });

    await userEvent.click(screen.getAllByRole('button', { name: 'Add to cart' })[0]);

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?returnTo=%2F%3Fq%3Dmouse');
    expect(cartApi.addCartItem).not.toHaveBeenCalled();
  });

  it('updates the header badge at once and keeps it when the server agrees', async () => {
    const reply = deferred<Cart>();
    vi.mocked(cartApi.addCartItem).mockReturnValue(reply.promise);
    renderApp('/', CUSTOMER);
    await screen.findByRole('link', { name: 'Wireless Mouse' });
    expect(await screen.findByRole('link', { name: 'Cart' })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Add to cart' })[0]);

    // The request has not been answered yet.
    expect(await screen.findByRole('link', { name: 'Cart, 1 item' })).toBeInTheDocument();
    expect(cartApi.addCartItem).toHaveBeenCalledWith(MOUSE.id, 1);

    reply.resolve(cart([cartItem(MOUSE, 1)], { subtotal: '19.99' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Cart, 1 item' })).toBeInTheDocument();
  });

  it('takes the badge back and says why when the stock ran out', async () => {
    const reply = deferred<Cart>();
    vi.mocked(cartApi.addCartItem).mockReturnValue(reply.promise);
    renderApp('/', CUSTOMER);
    await screen.findByRole('link', { name: 'Wireless Mouse' });
    await screen.findByRole('link', { name: 'Cart' });

    await userEvent.click(screen.getAllByRole('button', { name: 'Add to cart' })[0]);
    expect(await screen.findByRole('link', { name: 'Cart, 1 item' })).toBeInTheDocument();

    reply.reject(
      new ApiError({
        status: 409,
        code: 'INSUFFICIENT_STOCK',
        message: 'Not enough stock for "Wireless Mouse"',
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Not enough stock for "Wireless Mouse"'),
    );
    expect(await screen.findByRole('link', { name: 'Cart' })).toBeInTheDocument();
    // The cart is fetched again to reconcile with the server.
    await waitFor(() => expect(fetchCart.mock.calls.length).toBeGreaterThan(1));
  });

  it('offers no purchase to an administrator', async () => {
    renderApp('/', ADMIN);

    await screen.findByRole('link', { name: 'Wireless Mouse' });

    expect(screen.queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Cart/ })).not.toBeInTheDocument();
    expect(fetchCart).not.toHaveBeenCalled();
  });
});

describe('product page', () => {
  it('shows the product and adds the chosen quantity', async () => {
    fetchProduct.mockResolvedValue(MOUSE);
    vi.mocked(cartApi.addCartItem).mockResolvedValue(
      cart([cartItem(MOUSE, 2)], { subtotal: '39.98' }),
    );
    renderApp(`/products/${MOUSE.id}`, CUSTOMER);

    expect(await screen.findByRole('heading', { name: 'Wireless Mouse' })).toBeInTheDocument();
    expect(screen.getByText('$19.99')).toBeInTheDocument();
    expect(screen.getByText('In stock')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    await waitFor(() => expect(cartApi.addCartItem).toHaveBeenCalledWith(MOUSE.id, 2));
  });

  it('cannot add a product that is out of stock', async () => {
    fetchProduct.mockResolvedValue({ ...MOUSE, stock: 0, inStock: false });
    renderApp(`/products/${MOUSE.id}`, CUSTOMER);

    expect(await screen.findByRole('button', { name: 'Out of stock' })).toBeDisabled();
  });

  it('limits the quantity to the stock', async () => {
    fetchProduct.mockResolvedValue(KEYBOARD);
    renderApp(`/products/${KEYBOARD.id}`, CUSTOMER);
    await screen.findByRole('heading', { name: 'Mechanical Keyboard' });

    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));

    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('3');
  });

  it('says so when there is no such product', async () => {
    fetchProduct.mockRejectedValue(
      new ApiError({ status: 404, code: 'PRODUCT_NOT_FOUND', message: 'Product not found' }),
    );
    renderApp(`/products/${MOUSE.id}`);

    expect(await screen.findByRole('heading', { name: 'Product not found' })).toBeInTheDocument();
  });
});

describe('cart page', () => {
  const twoLines = cart([cartItem(MOUSE, 2), cartItem(KEYBOARD, 1)], { subtotal: '129.48' });

  it('lists the lines with the subtotal', async () => {
    fetchCart.mockResolvedValue(twoLines);
    renderApp('/cart', CUSTOMER);

    expect(await screen.findByRole('link', { name: 'Wireless Mouse' })).toBeInTheDocument();
    expect(screen.getByText('$129.48')).toBeInTheDocument();
    expect(screen.queryByText(/Update or remove them/)).not.toBeInTheDocument();
  });

  it('shows the empty cart with a way to the catalog', async () => {
    renderApp('/cart', CUSTOMER);

    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse products' })).toHaveAttribute('href', '/');
  });

  it('warns about lines that checkout would refuse', async () => {
    fetchCart.mockResolvedValue(
      cart([cartItem(MOUSE, 1, { isAvailable: false }), cartItem(KEYBOARD, 5)], {
        subtotal: '467.49',
      }),
    );
    renderApp('/cart', CUSTOMER);

    expect(await screen.findByText(/Update or remove them/)).toBeInTheDocument();
    expect(screen.getByText(/no longer available/)).toBeInTheDocument();
    expect(screen.getByText('Only 3 in stock. Reduce the quantity.')).toBeInTheDocument();
  });

  it('changes a quantity on screen at once and asks the server for the absolute value', async () => {
    fetchCart.mockResolvedValue(twoLines);
    const reply = deferred<Cart>();
    vi.mocked(cartApi.setCartItemQuantity).mockReturnValue(reply.promise);
    renderApp('/cart', CUSTOMER);
    await screen.findByRole('link', { name: 'Wireless Mouse' });

    await userEvent.click(screen.getAllByRole('button', { name: 'Increase quantity' })[0]);

    // 3 × 19.99 + 89.50 = 149.47, shown before the answer.
    expect(await screen.findByText('$149.47')).toBeInTheDocument();
    expect(cartApi.setCartItemQuantity).toHaveBeenCalledWith(MOUSE.id, 3);
    reply.resolve(cart([cartItem(MOUSE, 3), cartItem(KEYBOARD, 1)], { subtotal: '149.47' }));
  });

  it('removes a line', async () => {
    fetchCart.mockResolvedValue(twoLines);
    vi.mocked(cartApi.removeCartItem).mockResolvedValue(
      cart([cartItem(KEYBOARD, 1)], { subtotal: '89.50' }),
    );
    renderApp('/cart', CUSTOMER);

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Wireless Mouse' }));

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Wireless Mouse' })).not.toBeInTheDocument(),
    );
    expect(cartApi.removeCartItem).toHaveBeenCalledWith(MOUSE.id);
  });

  it('clears the cart only after confirmation', async () => {
    fetchCart.mockResolvedValue(twoLines);
    vi.mocked(cartApi.clearCart).mockResolvedValue(EMPTY_CART);
    renderApp('/cart', CUSTOMER);
    await screen.findByRole('link', { name: 'Wireless Mouse' });

    await userEvent.click(screen.getByRole('button', { name: 'Clear cart' }));
    expect(cartApi.clearCart).not.toHaveBeenCalled();

    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear cart' }),
    );

    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
    expect(cartApi.clearCart).toHaveBeenCalledTimes(1);
  });
});
