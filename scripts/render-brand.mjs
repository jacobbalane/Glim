// Render native icons from the same 3D Glim used by the live app: a night tile with Glim leaning
// in from its lower right, looking up at the open corner. Run against npm run dev. Outputs are
// committed so installation needs no browser or GPU.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

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
  const { encoded, macIcons } = await page.evaluate(async (sizes) => {
    // Centering the canvas also centers the website's overhead light.
    document.body.replaceChildren();
    const { mount } = await import('/src/mascot-renderer.ts');
    // Glim once, large, then cut to each size, so every size shows the same picture.
    const glim = await new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      Object.assign(canvas.style, {
        position: 'fixed',
        width: '1280px',
        height: '1280px',
        top: '0',
        left: 'calc(50% - 640px)',
      });
      document.body.append(canvas);
      const timeout = setTimeout(() => reject(new Error('3D icon did not render')), 20000);
      const handle = mount(
        canvas,
        1280,
        {
          tone: 'brand',
          mood: 'open',
          pose: { turn: -0.35, look: -0.14 },
          follow: false,
          hop: 0,
          animate: false,
          onReady: () => {
            clearTimeout(timeout);
            const copy = document.createElement('canvas');
            copy.width = canvas.width;
            copy.height = canvas.height;
            copy.getContext('2d').drawImage(canvas, 0, 0);
            handle.dispose();
            canvas.remove();
            resolve(copy);
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
    // Glim's outline within its render, from its opaque pixels.
    const pixels = glim.getContext('2d').getImageData(0, 0, glim.width, glim.height).data;
    let [x0, y0, x1] = [glim.width, glim.height, 0];
    for (let y = 0; y < glim.height; y++)
      for (let x = 0; x < glim.width; x++)
        if (pixels[(y * glim.width + x) * 4 + 3] > 24) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
        }
    // The tile at 1024 pixels, inset by `margin` on each side: a rounded square of night, Glim a
    // little wider than it, running off its bottom and right edges.
    const tile = (margin, shadow) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1024;
      const g = canvas.getContext('2d');
      const side = 1024 - margin * 2;
      const shape = () => {
        g.beginPath();
        g.roundRect(margin, margin, side, side, side * 0.2237);
      };
      if (shadow) {
        g.save();
        g.shadowColor = 'rgba(0, 0, 0, 0.3)';
        g.shadowBlur = 20;
        g.shadowOffsetY = 10;
        shape();
        g.fillStyle = '#1d1d2e';
        g.fill();
        g.restore();
      }
      shape();
      g.fillStyle = '#1d1d2e';
      g.fill();
      g.save();
      g.clip();
      const k = (side * 1.02) / (x1 - x0);
      const left = margin + side + (1.02 - 0.89) * side - (x1 - x0) * k;
      const top = margin + side * 0.27;
      g.drawImage(glim, left - x0 * k, top - y0 * k, glim.width * k, glim.height * k);
      g.restore();
      return canvas;
    };
    // Down to each size in halving steps, which keeps small sizes sharp.
    const shrink = (source, size) => {
      let current = source;
      while (current.width / 2 >= size) {
        const half = document.createElement('canvas');
        half.width = half.height = current.width / 2;
        const g = half.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(current, 0, 0, half.width, half.height);
        current = half;
      }
      const out = document.createElement('canvas');
      out.width = out.height = size;
      const g = out.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(current, 0, 0, size, size);
      return out.toDataURL('image/png').split(',')[1];
    };
    // Windows and the favicon fill their square; macOS icons keep Apple's margin and shadow, so
    // Glim sits the same size as the apps beside it in the Dock.
    const full = tile(0, false);
    const apple = tile(100, true);
    const encoded = {};
    const mac = {};
    for (const size of sizes) {
      encoded[size] = shrink(full, size);
      mac[size] = shrink(apple, size);
    }
    return { encoded, macIcons: mac };
  }, sizes);
  const png = (size) => Buffer.from(encoded[size], 'base64');
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
  // macOS ICNS: each size as PNG, under the type code Finder reads for it (the @2x codes reuse
  // the larger renders).
  const mac = [
    ['icp4', 16],
    ['icp5', 32],
    ['ic11', 32],
    ['icp6', 64],
    ['ic12', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic13', 256],
    ['ic09', 512],
    ['ic14', 512],
    ['ic10', 1024],
  ].map(([type, size]) => {
    const bytes = Buffer.from(macIcons[size], 'base64');
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(bytes.length + 8, 4);
    return Buffer.concat([head, bytes]);
  });
  const icnsHead = Buffer.alloc(8);
  icnsHead.write('icns', 0, 'ascii');
  icnsHead.writeUInt32BE(8 + mac.reduce((n, entry) => n + entry.length, 0), 4);
  await writeFile('src-tauri/icons/icon.icns', Buffer.concat([icnsHead, ...mac]));
  console.log('Rendered the favicon, Windows PNG icons, seven-size ICO and macOS ICNS.');
} finally {
  await browser.close();
}
