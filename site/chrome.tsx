// What every page of the site shares: the links in the top corners and the footer. `root` leads
// from the page showing them back to the site's root: '' on the landing page, '../' below it.
import { useEffect, useState, type ReactNode } from 'react';
import { Download, Github } from 'lucide-react';
import { Glim3D } from './Glim3D';

export const REPO = 'https://github.com/jacobbalane/Glim';
export const DOWNLOAD = `${REPO}/releases/latest`;

export type System = 'macOS' | 'Windows';
// The visitor's system picks the download. Phones and tablets get their maker's computer.
export const SYSTEM: System = /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'macOS' : 'Windows';
export const OTHER: System = SYSTEM === 'macOS' ? 'Windows' : 'macOS';
export const NEEDS: Record<System, string> = {
  macOS: 'macOS 13 or later',
  Windows: 'Windows 11, 64-bit',
};
const FILES: Record<System, RegExp> = { macOS: /_universal\.dmg$/, Windows: /_x64-setup\.exe$/ };
let latest: Promise<{ name: string; browser_download_url: string }[]> | undefined;

// The latest release's installer for a system, so Download starts the download. Until GitHub
// answers, or if it can't, the link opens the release page.
export function useDownload(system: System) {
  const [href, setHref] = useState(DOWNLOAD);
  useEffect(() => {
    let live = true;
    latest ??= fetch('https://api.github.com/repos/jacobbalane/Glim/releases/latest')
      .then((response) => response.json())
      .then((release) => release.assets ?? []);
    latest.then(
      (assets) => {
        const file = assets.find((asset) => FILES[system].test(asset.name));
        if (live && file) setHref(file.browser_download_url);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [system]);
  return href;
}

// A link to a system's installer. The release page opens in a new tab; a file just downloads.
export function DownloadLink({
  system = SYSTEM,
  className,
  children,
}: {
  system?: System;
  className?: string;
  children: ReactNode;
}) {
  const href = useDownload(system);
  const page = href === DOWNLOAD ? { target: '_blank', rel: 'noreferrer' } : {};
  return (
    <a className={className} href={href} {...page}>
      {children}
    </a>
  );
}

// Picks the system a page shows its island or its steps for.
export function SystemSwitch({
  value,
  onChange,
  label,
}: {
  value: System;
  onChange: (system: System) => void;
  label: string;
}) {
  return (
    <div className="pseg site-system" role="group" aria-label={label}>
      {(['macOS', 'Windows'] as const).map((system) => (
        <button
          key={system}
          type="button"
          aria-pressed={value === system}
          onClick={() => onChange(system)}
        >
          {system}
        </button>
      ))}
    </div>
  );
}

export function Brand({ root, className = '' }: { root: string; className?: string }) {
  return (
    <a className={`site-brand ${className}`} href={root || '#top'}>
      <Glim3D tone="brand" mood="open" size={36} label="Glim" />
      <span aria-hidden="true">Glim</span>
    </a>
  );
}

// Docs and Changelog, beside the brand.
export function PageLinks({ root, current }: { root: string; current?: 'docs' | 'changelog' }) {
  return (
    <>
      <a
        className="site-link site-page-link"
        href={`${root}docs/`}
        aria-current={current === 'docs' ? 'page' : undefined}
      >
        Docs
      </a>
      <a
        className="site-link site-page-link"
        href={`${root}changelog/`}
        aria-current={current === 'changelog' ? 'page' : undefined}
      >
        Changelog
      </a>
    </>
  );
}

export function GetLinks() {
  return (
    <>
      <a className="site-link" href={REPO} target="_blank" rel="noreferrer" aria-label="GitHub">
        <Github size={18} aria-hidden="true" />
        <span>GitHub</span>
      </a>
      <DownloadLink className="site-button site-button-small">
        <Download size={16} strokeWidth={2.4} aria-hidden="true" />
        <span>Download</span>
      </DownloadLink>
    </>
  );
}

export function SiteFoot({ root }: { root: string }) {
  return (
    <footer className="site-foot">
      <div className="site-wrap site-foot-grid">
        <div className="site-foot-brand">
          <a className="site-brand" href={root || '#top'}>
            <Glim3D tone="brand" mood="open" size={34} label="Glim" />
            <span aria-hidden="true">Glim</span>
          </a>
          <p>A glimpse at your agents. Then back to your flow.</p>
        </div>
        <nav aria-label="Product">
          <b>Product</b>
          <DownloadLink system="macOS">Download for macOS</DownloadLink>
          <DownloadLink system="Windows">Download for Windows</DownloadLink>
          <a href={`${root}docs/`}>Docs</a>
          <a href={`${root}changelog/`}>Changelog</a>
          <a href={`${root}docs/#compatibility`}>Compatibility</a>
        </nav>
        <nav aria-label="Project">
          <b>Project</b>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={`${root}docs/#privacy`}>Privacy</a>
          <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
            License
          </a>
        </nav>
      </div>
      <p className="site-wrap site-foot-note">
        Glim is an independent open-source project. Claude Code is made by Anthropic and Codex by
        OpenAI; neither is affiliated with Glim.
      </p>
    </footer>
  );
}
