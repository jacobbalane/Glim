// What every page of the site shares: the links in the top corners and the footer. `root` leads
// from the page showing them back to the site's root: '' on the landing page, '../' below it.
import { Download, Github } from 'lucide-react';
import { Glim3D } from './Glim3D';

export const REPO = 'https://github.com/jacobbalane/Glim';
export const DOWNLOAD = `${REPO}/releases/latest`;

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
      <a className="site-button site-button-small" href={DOWNLOAD} target="_blank" rel="noreferrer">
        <Download size={16} strokeWidth={2.4} aria-hidden="true" />
        <span>Download</span>
      </a>
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
          <a href={DOWNLOAD} target="_blank" rel="noreferrer">
            Download
          </a>
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
