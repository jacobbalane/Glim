// Render the installer's art from the 3D Glim, as the 24-bit BMPs NSIS needs: a banner for each
// full-window page and the art at the right of the page header. Everything is drawn at twice the
// size it shows at 100% scaling; the installer scales it down smoothly to the screen's DPI.
// Run against npm run dev. The outputs are committed.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const baseURL = process.env.GLIM_PREVIEW_URL ?? 'http://127.0.0.1:1420';
// The installer window's background, the top of the website's hero.
const BG = '#0a0b12';
// The full-window pages: install and finish wear the website's crowd of Glims; uninstalling, the
// night sky of its Pause card, where Glim falls asleep. x and top are the character's center and top; w is its width.
const crowd = (mood) => [
  { tone: 'done', mood, x: 150, top: 214, w: 124, tilt: -14 },
  { tone: 'calm', mood, x: 292, top: 180, w: 152, tilt: -7 },
  { tone: 'attention', mood, x: 702, top: 180, w: 152, tilt: 7 },
  { tone: 'active', mood, x: 844, top: 214, w: 124, tilt: 13 },
  { tone: 'brand', mood, x: 497, top: 124, w: 232, tilt: 0 },
];
const ART = {
  'install.bmp': { width: 994, height: 300, scene: 'crowd', glims: crowd('open') },
  'finish.bmp': { width: 994, height: 300, scene: 'crowd', glims: crowd('happy') },
  'uninstall.bmp': {
    width: 994,
    height: 300,
    scene: 'night',
    zs: 0,
    glims: [{ tone: 'calm', mood: 'open', x: 497, top: 118, w: 300, tilt: -4 }],
  },
  'goodbye.bmp': {
    width: 994,
    height: 300,
    scene: 'night',
    zs: 3,
    glims: [{ tone: 'calm', mood: 'closed', x: 497, top: 128, w: 300, tilt: 3 }],
  },
  'header.bmp': {
    width: 300,
    height: 114,
    scene: 'header',
    glims: [{ tone: 'brand', mood: 'open', x: 214, top: 22, w: 92, tilt: 0 }],
  },
  'header-uninstall.bmp': {
    width: 300,
    height: 114,
    scene: 'header',
    glims: [{ tone: 'calm', mood: 'open', x: 214, top: 24, w: 92, tilt: -4 }],
  },
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
    const pixels = await page.evaluate(
      async ({ art, BG }) => {
        document.body.replaceChildren();
        const { mount, setLight } = await import('/src/mascot-renderer.ts');
        // Each Glim drawn large, lit from straight above, then cut out by its alpha.
        async function render(tone, mood) {
          setLight(tone === 'calm' ? '#7c7fd0' : '#6366f1');
          const size = 512;
          const canvas = document.createElement('canvas');
          Object.assign(canvas.style, {
            position: 'fixed',
            top: '256px',
            left: '256px',
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
                tone,
                mood,
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
          const cut = document.createElement('canvas');
          cut.width = x1 - x0 + 1;
          cut.height = y1 - y0 + 1;
          cut.getContext('2d').drawImage(canvas, -x0, -y0);
          canvas.remove();
          return cut;
        }
        // A fixed pseudo-random sequence, so the stars and dots are the same on every render.
        let seed = 7;
        const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

        const { width, height } = art;
        const out = document.createElement('canvas');
        out.width = width;
        out.height = height;
        const g = out.getContext('2d');
        g.fillStyle = BG;
        g.fillRect(0, 0, width, height);
        if (art.scene === 'crowd') {
          // The hero's faint terminal dots at the sides, and indigo light rising behind the crowd.
          for (let y = 6; y < height; y += 14)
            for (let x = 6; x < width; x += 14) {
              const side = Math.abs(x - width / 2) / (width / 2);
              const a = Math.max(0, side - 0.35) * (1 - y / height) * 0.22 * random();
              if (a > 0.02) {
                g.fillStyle = `rgba(160, 166, 220, ${a})`;
                g.fillRect(x, y, 6, 6);
              }
            }
          const light = g.createRadialGradient(width / 2, height, 0, width / 2, height, 470);
          light.addColorStop(0, 'rgba(99, 102, 241, 0.42)');
          light.addColorStop(0.55, 'rgba(99, 102, 241, 0.12)');
          light.addColorStop(1, 'rgba(99, 102, 241, 0)');
          g.fillStyle = light;
          g.fillRect(0, 0, width, height);
        } else if (art.scene === 'night') {
          // The Pause card's sky: deep indigo, stars, and big quiet Zs.
          const sky = g.createRadialGradient(
            width / 2,
            height * 1.1,
            0,
            width / 2,
            height * 1.1,
            560,
          );
          sky.addColorStop(0, 'rgba(46, 40, 120, 0.95)');
          sky.addColorStop(0.6, 'rgba(26, 22, 70, 0.6)');
          sky.addColorStop(1, 'rgba(26, 22, 70, 0)');
          g.fillStyle = sky;
          g.fillRect(0, 0, width, height);
          for (let i = 0; i < 70; i++) {
            const x = random() * width;
            const y = random() * height * 0.8;
            if (Math.abs(x - width / 2) < 170 && y > 90) continue;
            const r = 0.8 + random() * 1.6;
            g.fillStyle = `rgba(255, 255, 255, ${0.25 + random() * 0.6})`;
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = 'rgba(122, 124, 196, 0.32)';
          g.textBaseline = 'alphabetic';
          const zs = [
            { size: 118, x: 690, y: 150 },
            { size: 82, x: 772, y: 86 },
            { size: 56, x: 832, y: 44 },
          ].slice(0, art.zs);
          for (const z of zs) {
            g.font = `900 ${z.size}px 'Segoe UI Black', 'Segoe UI', sans-serif`;
            g.fillText('Z', z.x, z.y);
          }
        } else {
          const light = g.createRadialGradient(214, height, 0, 214, height, 150);
          light.addColorStop(0, 'rgba(99, 102, 241, 0.32)');
          light.addColorStop(1, 'rgba(99, 102, 241, 0)');
          g.fillStyle = light;
          g.fillRect(0, 0, width, height);
        }
        for (const glim of art.glims) {
          const cut = await render(glim.tone, glim.mood);
          const scale = glim.w / cut.width;
          g.save();
          g.translate(glim.x, glim.top + (cut.height * scale) / 2);
          g.rotate((glim.tilt * Math.PI) / 180);
          g.imageSmoothingQuality = 'high';
          g.drawImage(cut, -glim.w / 2, (-cut.height * scale) / 2, glim.w, cut.height * scale);
          g.restore();
        }
        if (art.scene !== 'header') {
          // The banner melts into the page below it: the Glims rise out of the dark.
          const fade = g.createLinearGradient(0, height - 70, 0, height);
          fade.addColorStop(0, `${BG}00`);
          fade.addColorStop(1, BG);
          g.fillStyle = fade;
          g.fillRect(0, height - 70, width, 70);
        }
        return Array.from(g.getImageData(0, 0, width, height).data);
      },
      { art, BG },
    );
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
