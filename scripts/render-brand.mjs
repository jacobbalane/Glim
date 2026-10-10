// Render native icons from the same geometry used by the live app.
// Run against npm run dev. Outputs are committed so installation needs no browser or GPU.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.GLIM_PREVIEW_URL ?? 'http://127.0.0.1:1420';
const browser = await chromium.launch({
  channel: process.env.GLIM_TEST_BROWSER === 'chromium' ? undefined : 'chrome',
});
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    reducedMotion: 'reduce',
  });
  await page.goto(baseURL);
  const sizes = [16, 24, 30, 32, 44, 48, 64, 71, 89, 107, 128, 142, 150, 256, 284, 310, 512, 1024];
  const encoded = await page.evaluate(async (sizes) => {
    // Centering the canvas also centers the website's overhead light.
    document.body.replaceChildren();
    const { mount } = await import('/src/mascot-renderer.ts');
    const results = {};
    for (const size of sizes) {
      const canvas = document.createElement('canvas');
      Object.assign(canvas.style, {
        position: 'fixed',
        width: `${size}px`,
        height: `${size}px`,
        top: '0',
        left: `calc(50% - ${size / 2}px)`,
      });
      document.body.append(canvas);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('3D icon did not render')), 20000);
        const handle = mount(
          canvas,
          size,
          {
            tone: 'brand',
            mood: 'open',
            follow: false,
            hop: 0,
            animate: false,
            onReady: () => {
              results[size] = canvas.toDataURL('image/png').split(',')[1];
              clearTimeout(timeout);
              handle.dispose();
              resolve();
            },
            onError: () => reject(new Error('3D renderer failed')),
          },
          1,
        );
        if (!handle) {
          clearTimeout(timeout);
          reject(new Error('WebGL is required to generate brand assets'));
        }
      });
      canvas.remove();
    }
    return results;
  }, sizes);
  const png = (size) => Buffer.from(encoded[size], 'base64');
  await mkdir('public/brand', { recursive: true });
  await writeFile('public/brand/glim-3d.png', png(1024));
  await writeFile('public/glim.png', png(512));
  await writeFile('public/favicon.png', png(48));
  const windows = {
    '32x32': 32,
    '64x64': 64,
    '128x128': 128,
    '128x128@2x': 256,
    icon: 512,
    StoreLogo: 48,
  };
  for (const size of [30, 44, 71, 89, 107, 142, 150, 284, 310])
    windows[`Square${size}x${size}Logo`] = size;
  for (const [name, size] of Object.entries(windows))
    await writeFile(`src-tauri/icons/${name}.png`, png(size));
  // Windows ICO supports PNG-compressed entries, retaining the alpha at every size.
  const frames = [16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, bytes: png(size) }));
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(({ size, bytes }, i) => {
    const entry = 6 + i * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(bytes.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += bytes.length;
  });
  await writeFile(
    'src-tauri/icons/icon.ico',
    Buffer.concat([header, ...frames.map((frame) => frame.bytes)]),
  );
  console.log('Rendered 3D brand mark, favicon, Windows PNG icons and seven-size ICO.');
} finally {
  await browser.close();
}
