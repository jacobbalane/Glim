// Glim in 3D. One WebGL renderer draws every mascot on the page, each into its own 2D canvas,
// so a mascot keeps its place (and its stacking) in the layout, and the page needs a single
// WebGL context however many mascots there are. The body is the logo's pod, extruded with soft
// bevels; the eyes are the logo's capsules, swapped for arcs, crosses or lines by mood.
import {
  AmbientLight,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Shape,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type Tone = 'brand' | 'active' | 'attention' | 'success' | 'error' | 'done' | 'calm' | 'off';
export type Mood = 'open' | 'scan' | 'wide' | 'happy' | 'cross' | 'half' | 'closed';
export interface Options {
  tone: Tone;
  mood: Mood;
  // Turns toward the pointer.
  follow: boolean;
  // Each new value makes it hop once.
  hop: number;
  animate?: boolean;
  active?: boolean;
  fps?: number;
  onReady?: () => void;
  onError?: () => void;
}
export interface Handle {
  update(next: Partial<Options>): void;
  dispose(): void;
}

const COLORS: Record<Tone, string> = {
  brand: '#6366f1',
  active: '#5cc8ff',
  attention: '#ffc53d',
  success: '#36d4c4',
  error: '#ff6a5f',
  done: '#3ddc84',
  calm: '#a3a3b2',
  off: '#6b6b78',
};
// Half the distance between the eyes.
const EYE_X = 0.205;
const clamp = (n: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, n));
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const still = () => motionPreference.matches;

// The logo's pod at width 1, centered: flat top with round corners, straight sides, round bottom.
function podShape() {
  const w = 1;
  const h = 0.75;
  const r = 0.15 * w;
  const top = h / 2;
  const bottom = -h / 2;
  const left = -w / 2;
  const right = w / 2;
  const bend = top - (h - 0.375 * w);
  const shape = new Shape();
  shape.moveTo(left + r, top);
  shape.lineTo(right - r, top);
  shape.absarc(right - r, top - r, r, Math.PI / 2, 0, true);
  shape.lineTo(right, bend);
  shape.bezierCurveTo(right, bend - 0.235 * w, 0.2875 * w, bottom, 0, bottom);
  shape.bezierCurveTo(-0.2875 * w, bottom, left, bend - 0.235 * w, left, bend);
  shape.lineTo(left, top - r);
  shape.absarc(left + r, top - r, r, Math.PI, Math.PI / 2, true);
  return shape;
}

function buildStage() {
  const canvas = document.createElement('canvas');
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    // A retired context may be evicted after a newer stage has taken its place.
    if (stage?.renderer !== renderer) return;
    stage = null;
    cancelAnimationFrame(frame);
    frame = 0;
    for (const item of instances) item.onError?.();
  });
  renderer.setPixelRatio(1);
  // The shaders are three.js's own; skipping the info log check spares a driver round trip.
  renderer.debug.checkShaderErrors = false;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  // The room only fills in; the island above is the light (see `draw`).
  scene.environmentIntensity = 0.5;
  const key = new DirectionalLight('#ffffff', 2.4);
  const rim = new DirectionalLight('#ffffff', 1.2);
  scene.add(key, rim, new AmbientLight('#ffffff', 0.2));

  const camera = new PerspectiveCamera(24, 1, 0.1, 20);
  camera.position.set(0, 0, 3.5);

  const root = new Group();
  root.rotation.order = 'YXZ';
  scene.add(root);
  const bodyMaterial = new MeshPhysicalMaterial({
    color: COLORS.brand,
    // Satin, not glass: a soft sheen and a faint coat, so reflections do not compete with the eyes.
    roughness: 0.62,
    clearcoat: 0.2,
    clearcoatRoughness: 0.55,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: new Color('#ffffff'),
  });
  const geometry = new ExtrudeGeometry(podShape(), {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.095,
    bevelSegments: 14,
    curveSegments: 56,
  });
  geometry.center();
  const body = new Mesh(geometry, bodyMaterial);
  root.add(body);

  // The front face: half the depth plus the bevel.
  const front = 0.08 + 0.15;
  const eyeY = 0.02;
  const eyeX = [-EYE_X, EYE_X];
  const eyeMaterial = new MeshPhysicalMaterial({
    color: '#0b0b10',
    roughness: 0.45,
    clearcoat: 0.3,
    clearcoatRoughness: 0.35,
  });
  const face = new Group();
  root.add(face);
  const add = (geo: CapsuleGeometry | TorusGeometry, x: number) => {
    const mesh = new Mesh(geo, eyeMaterial);
    mesh.position.set(x, eyeY, front);
    face.add(mesh);
    return mesh;
  };
  const capsule = new CapsuleGeometry(0.125, 0.15, 10, 24);
  const eyes = eyeX.map((x) => add(capsule, x));
  const arc = new TorusGeometry(0.118, 0.04, 12, 40, Math.PI);
  const happy = eyeX.map((x) => add(arc, x));
  const bar = new CapsuleGeometry(0.04, 0.2, 6, 16);
  const cross = eyeX.flatMap((x) => [add(bar, x), add(bar, x)]);
  const closed = eyeX.map((x) => add(bar, x));
  return {
    renderer,
    scene,
    camera,
    key,
    rim,
    root,
    bodyMaterial,
    eyeMaterial,
    face,
    eyes,
    happy,
    cross,
    closed,
    front,
    eyeY,
    dispose() {
      for (const geo of [geometry, capsule, arc, bar]) geo.dispose();
      bodyMaterial.dispose();
      eyeMaterial.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
type Stage = ReturnType<typeof buildStage>;

interface Instance extends Options {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  pixels: number;
  visible: boolean;
  yaw: number;
  pitch: number;
  phase: number;
  nextBlink: number;
  hopAt: number;
  dirty: boolean;
  painted: boolean;
  lastDraw: number;
}

let stage: Stage | null | undefined;
const instances = new Set<Instance>();
const pointer = { x: innerWidth / 2, y: innerHeight * 0.3 };
let frame = 0;
let last = 0;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
const visibility = new IntersectionObserver(
  (entries) => {
    for (const entry of entries)
      for (const item of instances)
        if (item.canvas === entry.target) {
          item.visible = entry.isIntersecting;
          item.dirty = true;
        }
    loop();
  },
  { rootMargin: '120px' },
);
window.addEventListener('pointermove', (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});

// The island's light: mostly white, tinted with the island's color.
const glow = new Color('#ffffff');
export function setLight(color: string) {
  glow.set('#ffffff').lerp(new Color(color), 0.45);
  for (const item of instances) item.dirty = true;
  loop();
}

function getStage() {
  if (stage === undefined) {
    try {
      stage = buildStage();
    } catch {
      stage = null;
    }
  }
  return stage;
}

function pose(s: Stage, item: Instance, rect: DOMRect, t: number, dt: number) {
  const calm = still() || item.animate === false;
  const asleep = item.mood === 'closed';
  let yawTarget = 0;
  let pitchTarget = asleep ? 0.12 : 0;
  if (item.follow && !asleep && !calm) {
    yawTarget = clamp((pointer.x - (rect.left + rect.width / 2)) / 520) * 0.62;
    pitchTarget = clamp((pointer.y - (rect.top + rect.height / 2)) / 520) * 0.38;
  }
  const ease = calm ? 1 : 1 - Math.exp(-dt * 5);
  item.yaw += (yawTarget - item.yaw) * ease;
  item.pitch += (pitchTarget - item.pitch) * ease;
  const p = item.phase;
  const idle = calm ? 0 : 1;
  let roll = -item.yaw * 0.32 + Math.sin(t * 0.9 + p) * 0.05 * idle;
  let lift = Math.sin(t * 1.6 + p) * 0.025 * idle;
  let breathe = 1;
  if (asleep) {
    roll = 0.14 + Math.sin(t * 0.5 + p) * 0.03 * idle;
    breathe = 1 + Math.sin(t * 1.25 + p) * 0.022 * idle;
    lift = 0;
  }
  if (item.mood === 'wide') lift = Math.abs(Math.sin(t * 3.4 + p)) * 0.035 * idle;
  if (item.mood === 'happy' && idle) {
    const beat = (t + p) % 3;
    if (beat < 0.9)
      lift = Math.abs(Math.sin((beat / 0.9) * Math.PI * 2)) * (beat < 0.45 ? 0.07 : 0.035);
  }
  if (item.mood === 'cross' && idle) {
    const beat = (t + p) % 3.2;
    if (beat < 0.55) roll += Math.sin(beat * 46) * 0.08 * (1 - beat / 0.55);
  }
  const hop = t - item.hopAt;
  if (!calm && hop >= 0 && hop < 0.6) lift += Math.sin((hop / 0.6) * Math.PI) * 0.2;
  s.root.rotation.set(item.pitch, item.yaw, roll);
  s.root.position.y = lift;
  s.root.scale.set(1 / breathe ** 0.5, breathe, 1);

  // Eyes, by mood, drifting a little toward the pointer.
  const blinking = !calm && !asleep && t > item.nextBlink && t < item.nextBlink + 0.14;
  if (!calm && t > item.nextBlink + 0.14) item.nextBlink = t + 2.4 + Math.random() * 4;
  const capsules = ['open', 'scan', 'wide', 'half'].includes(item.mood);
  const drift = item.mood === 'scan' && idle ? Math.sin(t * 1.9 + p) * 0.035 : 0;
  const gx = item.yaw * 0.03 + drift;
  const gy = -item.pitch * 0.03;
  s.eyes.forEach((eye, i) => {
    eye.visible = capsules;
    let sx = 1;
    let sy = 1;
    let y = s.eyeY;
    if (item.mood === 'wide') [sx, sy] = [1.12, 1.16];
    if (item.mood === 'half') [sx, sy, y] = [1.18, 0.52, s.eyeY - 0.056];
    if (blinking) sy *= 0.12;
    eye.scale.set(sx, sy, 0.42);
    eye.position.set((i ? EYE_X : -EYE_X) + gx, y + gy, s.front - 0.035);
  });
  s.happy.forEach((arc, i) => {
    arc.visible = item.mood === 'happy';
    arc.position.set((i ? EYE_X : -EYE_X) + gx, s.eyeY - 0.075 + gy, s.front);
    arc.scale.set(1, 1.35, 0.6);
  });
  s.cross.forEach((bar, i) => {
    bar.visible = item.mood === 'cross';
    bar.position.set((i < 2 ? -EYE_X : EYE_X) + gx, s.eyeY + gy, s.front);
    bar.rotation.z = i % 2 ? -Math.PI / 4 : Math.PI / 4;
    bar.scale.set(1, 1, 0.6);
  });
  s.closed.forEach((bar, i) => {
    bar.visible = asleep;
    bar.position.set(i ? EYE_X : -EYE_X, s.eyeY - 0.03, s.front);
    bar.rotation.z = Math.PI / 2;
    bar.scale.set(1, 1, 0.6);
  });
  s.bodyMaterial.color.set(COLORS[item.tone]);
  s.eyeMaterial.color.set(item.tone === 'brand' ? '#ffffff' : '#0b0b10');
}

function draw(s: Stage, item: Instance, t: number, dt: number) {
  const size = item.pixels;
  const gl = s.renderer.domElement;
  if (gl.width < size || gl.height < size) {
    const edge = Math.max(size, gl.width);
    s.renderer.setSize(edge, edge, false);
  }
  const rect = item.canvas.getBoundingClientRect();
  pose(s, item, rect, t, dt);
  // The light comes from the island, at the top middle of the window: down onto each Glim from
  // wherever the island sits relative to it, a little from the front, and around its back.
  const x = innerWidth / 2 - (rect.left + rect.width / 2);
  const y = rect.top + rect.height / 2;
  const d = Math.hypot(x, y) || 1;
  s.key.position.set(x / d, y / d, 0.55);
  s.rim.position.set(x / d, y / d, -0.8);
  s.key.color.copy(glow);
  s.rim.color.copy(glow);
  s.renderer.setViewport(0, 0, size, size);
  s.renderer.setScissor(0, 0, size, size);
  s.renderer.render(s.scene, s.camera);
  item.context.clearRect(0, 0, size, size);
  item.context.drawImage(gl, 0, gl.height - size, size, size, 0, 0, size, size);
  item.dirty = false;
  if (!item.painted) {
    item.painted = true;
    item.onReady?.();
  }
}

function tick(now: number) {
  frame = 0;
  if (document.hidden || !instances.size) return;
  const s = getStage();
  if (!s) return;
  const t = now / 1000;
  const dt = Math.min(0.05, last ? t - last : 0.016);
  last = t;
  let live = false;
  for (const item of instances) {
    if (!item.visible || item.active === false) continue;
    const calm = still() || item.animate === false;
    if (calm && !item.dirty) continue;
    if (!calm) live = true;
    if (!item.dirty && now - item.lastDraw < 1000 / (item.fps ?? 60) - 1) continue;
    const elapsed = item.lastDraw ? Math.min(0.1, (now - item.lastDraw) / 1000) : dt;
    try {
      draw(s, item, t, elapsed);
      item.lastDraw = now;
    } catch {
      item.active = false;
      item.onError?.();
    }
  }
  if (live) loop();
}
function loop() {
  if (!frame && !document.hidden && instances.size) frame = requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange', () => {
  last = 0;
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
    return;
  }
  for (const item of instances) item.dirty = true;
  loop();
});
motionPreference.addEventListener('change', () => {
  for (const item of instances) item.dirty = true;
  loop();
});
window.addEventListener('resize', () => {
  for (const item of instances) item.dirty = true;
  loop();
});

/**
 * Draws a 3D Glim into `canvas` (its CSS size in pixels is `size`), at most `ratio` device pixels
 * per CSS pixel. Null when WebGL is missing.
 */
export function mount(
  canvas: HTMLCanvasElement,
  size: number,
  options: Options,
  ratio = 2,
): Handle | null {
  clearTimeout(releaseTimer);
  if (!getStage()) return null;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const pixels = Math.round(size * Math.min(ratio, window.devicePixelRatio || 1));
  canvas.width = pixels;
  canvas.height = pixels;
  const item: Instance = {
    ...options,
    canvas,
    context,
    pixels,
    visible: false,
    yaw: 0,
    pitch: 0,
    phase: Math.random() * 10,
    nextBlink: 1 + Math.random() * 3,
    hopAt: -10,
    dirty: true,
    painted: false,
    lastDraw: 0,
  };
  instances.add(item);
  visibility.observe(canvas);
  return {
    update(next) {
      if (next.hop !== undefined && next.hop !== item.hop) item.hopAt = performance.now() / 1000;
      Object.assign(item, next);
      item.dirty = true;
      loop();
    },
    dispose() {
      instances.delete(item);
      visibility.unobserve(canvas);
      if (!instances.size) {
        cancelAnimationFrame(frame);
        frame = 0;
        // Retain the stage across a notch morph, release it when no view needs Glim.
        releaseTimer = setTimeout(() => {
          if (instances.size) return;
          stage?.dispose();
          stage = undefined;
        }, 1000);
      }
    },
  };
}
