import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom has no native modal implementation. Browser E2E checks focus trapping and Escape.
globalThis.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
};
globalThis.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
};
