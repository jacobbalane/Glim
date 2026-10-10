// Render the installer's art from the 3D Glim, as the BMPs NSIS needs, and art.nsh, which says where
// each piece goes. The full-window pages move: theme.nsh draws each banner from its background and
// its sprites (every Glim with its eyes open, closed and happy, the sleep Zs, the fade at the
// bottom), about 15 times a second. Everything is drawn at twice its size at 100% scaling; the
// installer scales each frame down smoothly to the screen's DPI. Run against npm run dev. The
// outputs are committed.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const baseURL = process.env.GLIM_PREVIEW_URL ?? 'http://127.0.0.1:1420';
// The installer window's background, the top of the website's hero.
const BG = '#0a0b12';
const BANNER = { width: 994, height: 300 };
// The fade at the bottom of a banner: the Glims rise out of the dark.
const FADE = 70;

// Install and finish: the website's crowd, one Glim in each state color. x and top are a Glim's
// center and top on the banner, w its width. Drawn back to front. The rest is choreography, in
// frames of 66ms: where its bob starts, how often it blinks and when, and its delay in the
// finish page's hop.
const CROWD = [
  { tone: 'error', x: 84, top: 228, w: 108, tilt: -17, phase: 31, blink: 83, at: 20, hop: 6 },
  { tone: 'success', x: 910, top: 228, w: 108, tilt: 16, phase: 7, blink: 97, at: 61, hop: 6 },
  { tone: 'done', x: 196, top: 204, w: 126, tilt: -11, phase: 19, blink: 71, at: 44, hop: 4 },
  { tone: 'active', x: 798, top: 204, w: 126, tilt: 11, phase: 43, blink: 89, at: 7, hop: 4 },
  { tone: 'calm', x: 322, top: 176, w: 148, tilt: -6, phase: 13, blink: 77, at: 52, hop: 2 },
  { tone: 'attention', x: 672, top: 176, w: 148, tilt: 6, phase: 37, blink: 101, at: 30, hop: 2 },
  { tone: 'brand', x: 497, top: 124, w: 232, tilt: 0, phase: 0, blink: 64, at: 0, hop: 0 },
];
// Uninstalling: the Pause card's night sky, with Glim awake, then asleep under rising Zs.
const SLEEPER = { tone: 'calm', x: 497, top: 122, w: 300, tilt: -3, blink: 90, at: 40 };
const ZS = [
  { size: 118, x: 690, y: 150 },
  { size: 82, x: 772, y: 86 },
  { size: 56, x: 832, y: 44 },
];

const browser = await chromium.launch({
  channel: process.env.GLIM_TEST_BROWSER === 'chromium' ? undefined : 'chrome',
});
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    reducedMotion: 'reduce',
  });
  await page.goto(baseURL);
  const art = await page.evaluate(
    async ({ BG, BANNER, FADE, CROWD, SLEEPER, ZS }) => {
      document.body.replaceChildren();
      const { mount, setLight } = await import('/src/mascot-renderer.ts');
      const canvas = (width, height) => {
        const c = document.createElement('canvas');
        c.width = Math.ceil(width);
        c.height = Math.ceil(height);
        return c;
      };
      const pixels = (c) =>
        Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);

      // A Glim drawn large, lit from straight above.
      async function render(tone, mood) {
        setLight(tone === 'calm' ? '#7c7fd0' : '#6366f1');
        const size = 512;
        const c = canvas(size, size);
        Object.assign(c.style, {
          position: 'fixed',
          top: '256px',
          left: '256px',
          width: `${size}px`,
          height: `${size}px`,
        });
        document.body.append(c);
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('3D art did not render')), 20000);
          const handle = mount(
            c,
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
        c.remove();
        return c;
      }
      // A Glim's sprites, one per mood, all cut to the same box so the eyes change in place: scaled
      // to its width, tilted, centered in a canvas just big enough.
      async function glim(spec, moods) {
        const raw = [];
        for (const mood of moods) raw.push(await render(spec.tone, mood));
        let x0 = 512,
          y0 = 512,
          x1 = 0,
          y1 = 0;
        for (const c of raw) {
          const data = c.getContext('2d').getImageData(0, 0, 512, 512).data;
          for (let y = 0; y < 512; y++)
            for (let x = 0; x < 512; x++)
              if (data[(y * 512 + x) * 4 + 3] > 8) {
                x0 = Math.min(x0, x);
                y0 = Math.min(y0, y);
                x1 = Math.max(x1, x);
                y1 = Math.max(y1, y);
              }
        }
        const scale = spec.w / (x1 - x0 + 1);
        const w = spec.w;
        const h = (y1 - y0 + 1) * scale;
        const turn = (spec.tilt * Math.PI) / 180;
        const box = {
          w: Math.ceil(Math.abs(w * Math.cos(turn)) + Math.abs(h * Math.sin(turn))) + 4,
          h: Math.ceil(Math.abs(w * Math.sin(turn)) + Math.abs(h * Math.cos(turn))) + 4,
        };
        const sprites = raw.map((c) => {
          const out = canvas(box.w, box.h);
          const g = out.getContext('2d');
          g.translate(box.w / 2, box.h / 2);
          g.rotate(turn);
          g.imageSmoothingQuality = 'high';
          g.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, -w / 2, -h / 2, w, h);
          return out;
        });
        // Where the box sits on the banner: centered where the still art put the Glim.
        const x = Math.round(spec.x - box.w / 2);
        const y = Math.round(spec.top + h / 2 - box.h / 2);
        return { sprites, x, y, w: box.w, h: box.h };
      }
      // A fixed pseudo-random sequence, so the stars and dots are the same on every render.
      let seed = 7;
      const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

      // The crowd's background: the hero's faint terminal dots at the sides, indigo light rising.
      const crowdBg = canvas(BANNER.width, BANNER.height);
      {
        const g = crowdBg.getContext('2d');
        const { width, height } = BANNER;
        g.fillStyle = BG;
        g.fillRect(0, 0, width, height);
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
      }
      // The night sky: deep indigo and stars.
      const skyBg = canvas(BANNER.width, BANNER.height);
      {
        const g = skyBg.getContext('2d');
        const { width, height } = BANNER;
        g.fillStyle = BG;
        g.fillRect(0, 0, width, height);
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
          g.fillStyle = `rgba(255, 255, 255, ${0.25 + random() * 0.6})`;
          g.beginPath();
          g.arc(x, y, 0.8 + random() * 1.6, 0, Math.PI * 2);
          g.fill();
        }
      }
      // The fade, as a sprite drawn over everything: one narrow strip, stretched across the banner.
      const fade = canvas(4, FADE);
      {
        const g = fade.getContext('2d');
        const ramp = g.createLinearGradient(0, 0, 0, FADE);
        ramp.addColorStop(0, `${BG}00`);
        ramp.addColorStop(1, BG);
        g.fillStyle = ramp;
        g.fillRect(0, 0, 4, FADE);
      }
      // The sleep Zs, opaque; the installer fades each one as it rises.
      const zs = ZS.map((z) => {
        const c = canvas(z.size * 0.8, z.size * 1.02);
        const g = c.getContext('2d');
        g.fillStyle = 'rgb(140, 142, 214)';
        g.font = `900 ${z.size}px 'Segoe UI Black', 'Segoe UI', sans-serif`;
        g.textBaseline = 'alphabetic';
        g.fillText('Z', 0, z.size * 0.86);
        return { sprite: c, x: z.x, y: Math.round(z.y - z.size * 0.86), w: c.width, h: c.height };
      });

      // An atlas: rows of sprites, packed left to right, and the fade under them.
      function atlas(rows, extra) {
        const width = Math.max(
          ...rows.map((row) => row.reduce((sum, s) => sum + s.w + 2, 0)),
          ...extra.map((s) => s.w),
        );
        const rowHeight = Math.max(...rows.flat().map((s) => s.h)) + 2;
        const height = rows.length * rowHeight + extra.reduce((sum, s) => sum + s.h + 2, 0);
        const out = canvas(width, height);
        const g = out.getContext('2d');
        rows.forEach((row, r) => {
          let x = 0;
          for (const s of row) {
            g.drawImage(s.sprite, x, r * rowHeight);
            s.ax = x;
            x += s.w + 2;
          }
        });
        let y = rows.length * rowHeight;
        for (const s of extra) {
          g.drawImage(s.sprite, 0, y);
          s.ax = 0;
          s.ay = y;
          y += s.h + 2;
        }
        return { out, rowHeight };
      }

      const crowd = [];
      for (const spec of CROWD)
        crowd.push({ spec, ...(await glim(spec, ['open', 'closed', 'happy'])) });
      const crowdFade = { sprite: fade, w: fade.width, h: fade.height };
      const crowdRows = [0, 1, 2].map((mood) =>
        crowd.map((c) => ({ sprite: c.sprites[mood], w: c.w, h: c.h })),
      );
      const crowdAtlas = atlas(crowdRows, [crowdFade]);
      crowd.forEach((c, i) => (c.ax = crowdRows[0][i].ax));

      const sleeper = await glim(SLEEPER, ['open', 'closed']);
      const skyFade = { sprite: fade, w: fade.width, h: fade.height };
      const sleeperRows = [0, 1].map((mood) => [
        { sprite: sleeper.sprites[mood], w: sleeper.w, h: sleeper.h },
      ]);
      const skyAtlas = atlas(sleeperRows, [...zs, skyFade]);

      // Headers: a small Glim at the right of the progress page's header.
      async function header(tone) {
        const out = canvas(300, 114);
        const g = out.getContext('2d');
        g.fillStyle = BG;
        g.fillRect(0, 0, 300, 114);
        const light = g.createRadialGradient(214, 114, 0, 214, 114, 150);
        light.addColorStop(0, 'rgba(99, 102, 241, 0.32)');
        light.addColorStop(1, 'rgba(99, 102, 241, 0)');
        g.fillStyle = light;
        g.fillRect(0, 0, 300, 114);
        const one = await glim({ tone, x: 214, top: 22, w: 92, tilt: tone === 'calm' ? -4 : 0 }, [
          'open',
        ]);
        g.drawImage(one.sprites[0], one.x, one.y);
        return out;
      }
      const headerInstall = await header('brand');
      const headerUninstall = await header('calm');

      return {
        files: {
          'crowd.bmp': { width: crowdBg.width, height: crowdBg.height, data: pixels(crowdBg) },
          'sky.bmp': { width: skyBg.width, height: skyBg.height, data: pixels(skyBg) },
          'header.bmp': { width: 300, height: 114, data: pixels(headerInstall) },
          'header-uninstall.bmp': { width: 300, height: 114, data: pixels(headerUninstall) },
          'crowd-sprites.bmp': {
            width: crowdAtlas.out.width,
            height: crowdAtlas.out.height,
            data: pixels(crowdAtlas.out),
            alpha: true,
          },
          'sky-sprites.bmp': {
            width: skyAtlas.out.width,
            height: skyAtlas.out.height,
            data: pixels(skyAtlas.out),
            alpha: true,
          },
        },
        crowd: crowd.map((c) => ({ ...c.spec, ax: c.ax, x: c.x, y: c.y, w: c.w, h: c.h })),
        crowdRow: crowdAtlas.rowHeight,
        crowdFade: { ay: crowdFade.ay },
        sleeper: { ...SLEEPER, ax: 0, x: sleeper.x, y: sleeper.y, w: sleeper.w, h: sleeper.h },
        skyRow: skyAtlas.rowHeight,
        zs: zs.map((z) => ({ ax: z.ax, ay: z.ay, x: z.x, y: z.y, w: z.w, h: z.h })),
        skyFade: { ay: skyFade.ay },
      };
    },
    { BG, BANNER, FADE, CROWD, SLEEPER, ZS },
  );

  for (const [name, image] of Object.entries(art.files)) {
    await writeFile(`src-tauri/installer/${name}`, bmp(image));
    console.log(`src-tauri/installer/${name}`);
  }
  await writeFile('src-tauri/installer/art.nsh', nsis(art));
  console.log('src-tauri/installer/art.nsh');
} finally {
  await browser.close();
}

// Where every sprite is in its atlas and where it goes on the banner, as macros theme.nsh inserts
// into its frame functions. GLIM_SPRITE and GLIM_Z are defined there.
function nsis(art) {
  const crowd = art.crowd
    .map(
      (c) =>
        `  !insertmacro GLIM_SPRITE "\${SCOPE}" ${c.x} ${c.y} ${c.w} ${c.h} ${c.ax} ${art.crowdRow} ${c.phase} ${c.blink} ${c.at} ${c.hop} ; ${c.tone}`,
    )
    .join('\n');
  const s = art.sleeper;
  const zs = art.zs
    .map((z, i) => `  !insertmacro GLIM_Z ${z.x} ${z.y} ${z.w} ${z.h} ${z.ax} ${z.ay} ${i * 24}`)
    .join('\n');
  return `; Generated by scripts/render-installer-art.mjs; do not edit. Where each sprite sits in its atlas
; (crowd-sprites.bmp, sky-sprites.bmp) and on the ${BANNER.width}x${BANNER.height} banner, and its moves.
; GLIM_SPRITE: x y width height atlas-x row-height bob-phase blink-every blink-at hop-delay.
; GLIM_Z: x y width height atlas-x atlas-y delay.

!define GLIM_BANNER_W ${BANNER.width}
!define GLIM_BANNER_H ${BANNER.height}
!define GLIM_FADE_H ${FADE}
!define GLIM_FADE_TOP ${BANNER.height - FADE}
!define GLIM_CROWD_FADE_Y ${art.crowdFade.ay}
!define GLIM_SKY_FADE_Y ${art.skyFade.ay}

!macro GLIM_DRAW_CROWD SCOPE
${crowd}
!macroend

!macro GLIM_DRAW_SKY SCOPE
  !insertmacro GLIM_SPRITE "\${SCOPE}" ${s.x} ${s.y} ${s.w} ${s.h} ${s.ax} ${art.skyRow} 0 ${s.blink} ${s.at} 0 ; ${s.tone}
!macroend

!macro GLIM_DRAW_ZS
${zs}
!macroend
`;
}

// A BMP, rows bottom to top: 24-bit blue-green-red, or 32-bit with premultiplied alpha for sprites.
function bmp({ width, height, data, alpha = false }) {
  const bytes = alpha ? 4 : 3;
  const row = Math.ceil((width * bytes) / 4) * 4;
  const out = Buffer.alloc(54 + row * height);
  out.write('BM', 0);
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(bytes * 8, 28);
  out.writeUInt32LE(row * height, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const from = ((height - 1 - y) * width + x) * 4;
      const to = 54 + y * row + x * bytes;
      const a = alpha ? data[from + 3] / 255 : 1;
      out[to] = Math.round(data[from + 2] * a);
      out[to + 1] = Math.round(data[from + 1] * a);
      out[to + 2] = Math.round(data[from] * a);
      if (alpha) out[to + 3] = data[from + 3];
    }
  return out;
}
