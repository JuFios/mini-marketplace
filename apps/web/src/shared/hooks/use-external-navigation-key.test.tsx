import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it } from 'vitest';
import { useExternalNavigationKey } from './use-external-navigation-key';

function Probe() {
  return <p data-testid="key">{useExternalNavigationKey()}</p>;
}

function setup() {
  const router = createMemoryRouter([{ path: '*', element: <Probe /> }], {
    initialEntries: ['/?q=a'],
  });
  render(<RouterProvider router={router} />);
  return { router, key: () => screen.getByTestId('key').textContent };
}

describe('useExternalNavigationKey', () => {
  it('stays put while the page rewrites its own URL', async () => {
    const { router, key } = setup();
    const before = key();

    await act(() => router.navigate('/?q=ab', { replace: true }));
    await act(() => router.navigate('/?q=abc', { replace: true }));

    expect(key()).toBe(before);
  });

  it('changes when the person navigates', async () => {
    const { router, key } = setup();
    const before = key();

    await act(() => router.navigate('/?q=other'));

    expect(key()).not.toBe(before);
  });

  it('changes on back, and keeps the new key through later replaces', async () => {
    const { router, key } = setup();
    await act(() => router.navigate('/?q=other'));
    const pushed = key();

    await act(() => router.navigate(-1));
    const afterBack = key();
    await act(() => router.navigate('/?q=typed', { replace: true }));

    expect(afterBack).not.toBe(pushed);
    expect(key()).toBe(afterBack);
  });
});
