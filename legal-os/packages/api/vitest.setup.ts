// Polyfill Vitest 1.x vite-node SSR globals missing in some pool configurations.
// These are normally injected by the SSR module runner; define them as no-ops
// so pure-utility tests can load their local imports without crashing.
if (typeof (globalThis as Record<string, unknown>)['__vite_ssr_exportName__'] === 'undefined') {
  (globalThis as Record<string, unknown>)['__vite_ssr_exportName__'] = () => {};
}
if (typeof (globalThis as Record<string, unknown>)['__vite_ssr_exports__'] === 'undefined') {
  (globalThis as Record<string, unknown>)['__vite_ssr_exports__'] = {};
}
