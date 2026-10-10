import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Download } from 'lucide-react';
import { GlimMark } from './components';
import { PREVIEW_GROUPS, PREVIEW_SCENES, type PreviewScene } from './design-preview';
import './preview-page.css';

interface Capture {
  id: string;
  width: number;
  height: number;
}
interface Captures {
  capturedAt: string;
  scenes: Capture[];
}
type Mode = 'live' | 'screenshots';

function FlowPreview() {
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const send = (value: object) =>
    frame.current?.contentWindow?.postMessage({ type: 'glim:preview', ...value }, location.origin);
  useEffect(() => {
    // Pointer events inside the iframe are handled by the actual island.
    // The surrounding preview handles clicks beyond that browsing context.
    const outside = (event: PointerEvent) => {
      if (!controls.current?.contains(event.target as Node)) send({ view: 'compact' });
    };
    const resize = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'glim:preview:ready') {
        setReady(true);
        return;
      }
      if (event.data?.type !== 'glim:preview:size') return;
      if (
        Number.isFinite(event.data.height) &&
        event.data.height >= 34 &&
        event.data.height <= 640 &&
        stage.current
      )
        stage.current.style.height = `${event.data.height + 28}px`;
    };
    window.addEventListener('message', resize);
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('message', resize);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  return (
    <section className="flow-preview" aria-label="Interactive notch preview">
      <div className="flow-preview-heading" ref={controls}>
        <h2>Try the notch</h2>
        <div>
          <select
            aria-label="Agent activity"
            disabled={!ready}
            defaultValue="working"
            onChange={(event) => send({ status: event.target.value })}
          >
            <option value="working">Working</option>
            <option value="waiting">Approval</option>
            <option value="finished">Done</option>
          </select>
          <button disabled={!ready} onClick={() => send({ view: 'compact' })}>
            Collapse
          </button>
          <button disabled={!ready} onClick={() => send({ view: 'glance' })}>
            Expand
          </button>
          <button disabled={!ready} onClick={() => send({ view: 'settings' })}>
            Settings
          </button>
          <button disabled={!ready} onClick={() => send({ view: 'setup' })}>
            Setup
          </button>
        </div>
      </div>
      <div className="flow-preview-stage" ref={stage}>
        <iframe ref={frame} title="Interactive notch" src="/?scene=working&motion=1&flow=1" />
      </div>
    </section>
  );
}

export default function PreviewPage() {
  const [mode, setMode] = useState<Mode>('live');
  const [group, setGroup] = useState<'All' | PreviewScene['group']>('All');
  const [motion, setMotion] = useState(false);
  const [captures, setCaptures] = useState<Captures | null>(null);
  useEffect(() => {
    document.title = 'Glim · Preview';
    let disposed = false;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch('/__preview_shots/manifest.json', { cache: 'no-store' });
        if (!response.ok) return;
        const next = (await response.json()) as Captures;
        if (!disposed && Array.isArray(next.scenes)) {
          setCaptures((previous) => (previous?.capturedAt === next.capturedAt ? previous : next));
        }
      } catch {
        // A fresh checkout can display every live view before screenshots are generated.
      }
    };
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  const groups = group === 'All' ? PREVIEW_GROUPS : [group];
  return (
    <main className="design-preview">
      <header className="design-preview-header">
        <div>
          <a className="preview-home" href="/" aria-label="Open Glim">
            <GlimMark size={26} />
          </a>
          <h1>Preview</h1>
          <span>{PREVIEW_SCENES.length} views</span>
        </div>
        <div className="design-preview-tools">
          <div className="preview-mode" aria-label="Preview mode">
            <button aria-pressed={mode === 'live'} onClick={() => setMode('live')}>
              Live
            </button>
            <button aria-pressed={mode === 'screenshots'} onClick={() => setMode('screenshots')}>
              Screenshots
            </button>
          </div>
          {mode === 'live' && (
            <label className="preview-motion">
              <input
                type="checkbox"
                checked={motion}
                onChange={(e) => setMotion(e.target.checked)}
              />{' '}
              Motion
            </label>
          )}
        </div>
      </header>

      <nav className="preview-groups" aria-label="View groups">
        {(['All', ...PREVIEW_GROUPS] as const).map((name) => (
          <button key={name} aria-pressed={group === name} onClick={() => setGroup(name)}>
            {name}
          </button>
        ))}
      </nav>
      <p className="preview-instruction">
        {mode === 'live'
          ? 'Actual app components. Changes update here as you edit.'
          : captures
            ? `Captured ${new Date(captures.capturedAt).toLocaleString()}. Refresh with npm run preview:capture.`
            : 'Run npm run preview:capture to save every view. Live views are shown until then.'}
      </p>

      <FlowPreview />

      {groups.map((name) => (
        <section className="preview-section" key={name} aria-labelledby={`preview-${name}`}>
          <h2 id={`preview-${name}`}>{name}</h2>
          <div className="preview-gallery">
            {PREVIEW_SCENES.filter((scene) => scene.group === name).map((scene) => (
              <PreviewCard
                key={scene.id}
                scene={scene}
                mode={mode}
                motion={motion}
                capture={captures?.scenes.find((s) => s.id === scene.id)}
                capturedAt={captures?.capturedAt}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function PreviewCard({
  scene,
  mode,
  motion,
  capture,
  capturedAt,
}: {
  scene: PreviewScene;
  mode: Mode;
  motion: boolean;
  capture?: Capture;
  capturedAt?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [liveHeight, setLiveHeight] = useState(scene.height);
  const [scale, setScale] = useState(1);
  const [failed, setFailed] = useState(false);
  const source = `/?scene=${scene.id}&motion=${motion ? '1' : '0'}`;
  const screenshot = `/__preview_shots/${scene.id}.png?v=${encodeURIComponent(capturedAt ?? '')}`;
  const showScreenshot = mode === 'screenshots' && !!capture && !failed;
  const height = showScreenshot ? capture.height : liveHeight;
  const width = showScreenshot ? capture.width : scene.width;
  useEffect(() => {
    const resize = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== 'glim:preview:size'
      )
        return;
      if (Number.isFinite(event.data.height) && event.data.height >= 34 && event.data.height <= 640)
        setLiveHeight(event.data.height + 28);
    };
    window.addEventListener('message', resize);
    return () => window.removeEventListener('message', resize);
  }, []);
  useEffect(() => {
    setFailed(false);
  }, [capturedAt]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / width));
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [width]);

  return (
    <figure className="preview-card" data-scene={scene.id}>
      <div
        className="preview-viewport"
        ref={viewport}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {showScreenshot ? (
          <img
            src={screenshot}
            alt={`${scene.title} screenshot`}
            loading="lazy"
            width={width}
            height={height}
            onError={() => setFailed(true)}
          />
        ) : (
          <iframe
            ref={frame}
            key={`${scene.id}-${motion}`}
            src={source}
            title={scene.title}
            loading="lazy"
            style={{ width, height: scene.brand ? height : 640, transform: `scale(${scale})` }}
          />
        )}
      </div>
      <figcaption>
        <span>{scene.title}</span>
        <span className="preview-card-actions">
          {capture && (
            <a
              href={screenshot}
              download={`glim-${scene.id}.png`}
              aria-label={`Download ${scene.title} screenshot`}
            >
              <Download size={14} />
            </a>
          )}
          <a href={source} target="_blank" rel="noreferrer" aria-label={`Open ${scene.title}`}>
            <ArrowUpRight size={15} />
          </a>
        </span>
      </figcaption>
    </figure>
  );
}
