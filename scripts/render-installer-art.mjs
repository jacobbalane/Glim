// Render the installer's art from the 3D Glim: the welcome sidebar, the finish page (happy) and the
// page header, as the 24-bit BMPs NSIS needs. Run against npm run dev. The outputs are committed.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const baseURL = process.env.GLIM_PREVIEW_URL ?? 'http://127.0.0.1:1420';
// Each image: its size, its background, and where the character sits (its width and top, centered
// on x), as in the brief's art table.
const ART = {
  'sidebar.bmp': { width: 164, height: 314, desk: true, mood: 'open', x: 82, top: 128, glim: 84 },
  'finish.bmp': { width: 164, height: 314, desk: true, mood: 'happy', x: 82, top: 128, glim: 84 },
  'header.bmp': { width: 150, height: 57, desk: false, mood: 'open', x: 110, top: 13, glim: 40 },
};

const browser = await chromium.launch({
  channel: process.env.GLIM_TEST_BROWSER === 'chromium' ? undefined : 'chrome',
});
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    reducedMotion: 'reduce',
  });
  await page.goto(baseURL);
  for (const [name, art] of Object.entries(ART)) {
    const pixels = await page.evaluate(async (art) => {
      document.body.replaceChildren();
      const { mount } = await import('/src/mascot-renderer.ts');
      // Render large, then cut the character out by its alpha, so it can be placed exactly.
      const size = 512;
      const canvas = document.createElement('canvas');
      Object.assign(canvas.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: `${size}px`,
        height: `${size}px`,
      });
      document.body.append(canvas);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('3D art did not render')), 20000);
        const handle = mount(
          canvas,
          size,
          {
            tone: 'brand',
            mood: art.mood,
            follow: false,
            hop: 0,
            animate: false,
            onReady: () => {
              clearTimeout(timeout);
              resolve();
            },
            onError: () => reject(new Error('3D renderer failed')),
          },
          1,
        );
        if (!handle) reject(new Error('WebGL is required to render the installer art'));
      });
      const read = canvas.getContext('2d').getImageData(0, 0, size, size).data;
      let x0 = size,
        y0 = size,
        x1 = 0,
        y1 = 0;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          if (read[(y * size + x) * 4 + 3] > 8) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
      const out = document.createElement('canvas');
      out.width = art.width;
      out.height = art.height;
      const g = out.getContext('2d');
      if (art.desk) {
        // The light desktop of the brief's art.
        const fill = g.createLinearGradient(0, 0, 0, art.height);
        fill.addColorStop(0, '#fdfdfe');
        fill.addColorStop(1, '#d6d9e1');
        g.fillStyle = fill;
        g.fillRect(0, 0, art.width, art.height);
        // A soft shadow under the character, as in the brief's art.
        g.shadowColor = 'rgba(9, 9, 11, 0.2)';
        g.shadowBlur = 8;
        g.shadowOffsetY = 6;
      } else {
        g.fillStyle = '#fff';
        g.fillRect(0, 0, art.width, art.height);
      }
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      const scale = art.glim / w;
      g.imageSmoothingQuality = 'high';
      g.drawImage(canvas, x0, y0, w, h, art.x - (w * scale) / 2, art.top, w * scale, h * scale);
      return Array.from(g.getImageData(0, 0, art.width, art.height).data);
    }, art);
    await writeFile(`src-tauri/installer/${name}`, bmp(art.width, art.height, pixels));
    console.log(`src-tauri/installer/${name}`);
  }
} finally {
  await browser.close();
}

// A 24-bit BMP: rows bottom to top, blue-green-red, each row padded to 4 bytes.
function bmp(width, height, rgba) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const data = Buffer.alloc(54 + row * height);
  data.write('BM', 0);
  data.writeUInt32LE(data.length, 2);
  data.writeUInt32LE(54, 10);
  data.writeUInt32LE(40, 14);
  data.writeInt32LE(width, 18);
  data.writeInt32LE(height, 22);
  data.writeUInt16LE(1, 26);
  data.writeUInt16LE(24, 28);
  data.writeUInt32LE(row * height, 34);
  data.writeInt32LE(2835, 38);
  data.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const from = ((height - 1 - y) * width + x) * 4;
      const to = 54 + y * row + x * 3;
      data[to] = rgba[from + 2];
      data[to + 1] = rgba[from + 1];
      data[to + 2] = rgba[from];
    }
  return data;
}
