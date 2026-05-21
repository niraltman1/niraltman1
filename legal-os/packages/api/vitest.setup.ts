// Fix for vite-node 1.x: __vite_ssr_exportName__ is called from inside module wrappers
// to register named exports onto __vite_ssr_exports__, but it is NOT injected into the
// wrapper's parameter list — so it falls through to the global scope.
//
// The trick: patch vm.runInThisContext so we capture the current module's exports object
// (always the 3rd argument, index 2, of the wrapper call) just before the wrapper runs.
// Then __vite_ssr_exportName__ reads from that captured reference to do the defineProperty.
// This is safe because __vite_ssr_exportName__ calls are prepended before any awaits.

import vm from 'node:vm';

let _currentSsrExports: object | null = null;

const _origRunInThisContext = vm.runInThisContext.bind(vm);
// @ts-expect-error – patching built-in for test environment
vm.runInThisContext = (code: string, opts?: unknown) => {
  const fn = _origRunInThisContext(code, opts as Parameters<typeof vm.runInThisContext>[1]);
  if (typeof code !== 'string' || !code.includes('__vite_ssr_exports__')) return fn;
  return (...args: unknown[]) => {
    _currentSsrExports = args[2] as object ?? null;
    return (fn as (...a: unknown[]) => unknown)(...args);
  };
};

(globalThis as Record<string, unknown>)['__vite_ssr_exportName__'] = (
  name: string,
  getter: () => unknown,
) => {
  if (_currentSsrExports) {
    Object.defineProperty(_currentSsrExports, name, {
      enumerable: true,
      configurable: true,
      get: getter,
    });
  }
};
