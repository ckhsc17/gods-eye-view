import assert from 'node:assert/strict';
import test from 'node:test';
import { isXREmulated, prepareXREmulation } from './emulation.js';

class NativeNavigator {}
Object.defineProperty(NativeNavigator.prototype, 'xr', { value: {} });

function scopeWith(nav) {
  return { navigator: nav, XRWebGLBinding: class XRWebGLBinding {} };
}

test('a native navigator.xr (on the prototype) is not treated as emulated', () => {
  const scope = scopeWith(new NativeNavigator());
  assert.equal(isXREmulated(scope.navigator), false);
  assert.equal(prepareXREmulation(scope), false);
  assert.equal(typeof scope.XRWebGLBinding, 'function');
});

test('IWER (own navigator.xr) hides the native XRWebGLBinding', () => {
  const nav = new NativeNavigator();
  Object.defineProperty(nav, 'xr', { value: {}, configurable: true });
  const scope = scopeWith(nav);
  assert.equal(isXREmulated(nav), true);
  assert.equal(prepareXREmulation(scope), true);
  assert.equal(scope.XRWebGLBinding, undefined);
  // three.js probes with `typeof XRWebGLBinding !== 'undefined'`.
  assert.equal(typeof scope.XRWebGLBinding, 'undefined');
});

test('no navigator or no binding is a no-op', () => {
  assert.equal(isXREmulated(undefined), false);
  const nav = new NativeNavigator();
  Object.defineProperty(nav, 'xr', { value: {} });
  assert.equal(prepareXREmulation({ navigator: nav }), false);
});
