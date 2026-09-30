/**
 * Compatibility between the IWER emulator and desktop Chrome.
 *
 * IWER replaces `navigator.xr` and the XR* classes it emulates, but not
 * `XRWebGLBinding`. Current desktop Chrome ships a native `XRWebGLBinding`
 * with `createProjectionLayer`, so three.js chooses the WebXR Layers path and
 * constructs the native binding with IWER's session object, which throws
 * ("parameter 1 is not of type 'XRSession'") and aborts Enter VR.
 *
 * While the emulator is installed, hiding the native binding makes three.js
 * fall back to `XRWebGLLayer`, which IWER does emulate. This must run before
 * the renderer is created, because three.js checks for the binding once in
 * the WebXRManager constructor. Real headsets are untouched: IWER is not
 * injected there, so `navigator.xr` stays native.
 */

/**
 * IWER installs `xr` as an own property of the navigator instance; the
 * browser's native one lives on `Navigator.prototype`.
 */
export function isXREmulated(nav = globalThis.navigator) {
  return Boolean(nav && Object.prototype.hasOwnProperty.call(nav, 'xr'));
}

export function prepareXREmulation(scope = globalThis) {
  if (!isXREmulated(scope.navigator) || !('XRWebGLBinding' in scope))
    return false;
  Object.defineProperty(scope, 'XRWebGLBinding', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  return true;
}
