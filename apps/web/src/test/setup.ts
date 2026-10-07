import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// The first test that reaches a lazy-loaded route pays for importing it, and a loaded CI runner
// is slower than a laptop; the default of one second is too tight for that. Tests that pass
// do not wait any longer for this.
configure({ asyncUtilTimeout: 3000 });

// Vitest runs without globals, so RTL cannot register its automatic cleanup itself.
afterEach(cleanup);

// jsdom knows <dialog> but not showModal()/close(); this gives it the part the Modal relies on:
// the `open` attribute and the `close` event.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};
