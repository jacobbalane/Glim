import type { Page } from '@playwright/test';

/**
 * Whether WebGL runs on a GPU. Without one (as on CI runners) Glim is flat by design, see
 * `buildStage`. WebGL 1 here leaves the app's WebGL 2 context to the tests that wrap it.
 */
export function hasGpu(page: Page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const gpu = gl?.getExtension('WEBGL_debug_renderer_info');
    return (
      !!gl &&
      !(
        gpu &&
        /SwiftShader|llvmpipe|Basic Render/i.test(gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL))
      )
    );
  });
}
