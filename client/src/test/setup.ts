import '@testing-library/jest-dom/vitest';
import {afterEach, vi} from 'vitest';

// Browser APIs Mantine uses that jsdom does not provide.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.HTMLElement.prototype.scrollIntoView = () => {};
// Textarea autosize listens for web fonts loading.
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: {addEventListener: () => {}, removeEventListener: () => {}},
});

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
