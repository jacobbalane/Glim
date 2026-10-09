// Claude's installer proposal. These are faithful mocks of the NSIS Modern UI wizard that
// Tauri builds, so everything shown is reachable with bitmaps, strings and a template.
import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { AppIcon, HeaderArt, SidebarArt } from './brand';

function Button({
  children,
  primary = false,
  disabled = false,
}: {
  children: ReactNode;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <span className={`wbtn${primary ? ' primary' : ''}${disabled ? ' disabled' : ''}`}>
      {children}
    </span>
  );
}
function Box({ checked = false, children }: { checked?: boolean; children: ReactNode }) {
  return (
    <span className="wcheck">
      <i className={checked ? 'on' : ''}>{checked && <Check size={10} strokeWidth={3.4} />}</i>
      {children}
    </span>
  );
}

function Window({
  title,
  buttons,
  children,
}: {
  title: string;
  buttons: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="win" aria-hidden="true">
      <div className="win-title">
        <AppIcon size={16} />
        <span>{title}</span>
        <span className="win-close">
          <X size={15} strokeWidth={1.3} />
        </span>
      </div>
      <div className="win-body">{children}</div>
      <div className="win-foot">
        <span className="win-brand">Glim 0.1.0</span>
        <div className="win-buttons">{buttons}</div>
      </div>
    </div>
  );
}
function Inner({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <>
      <div className="nsis-head">
        <div>
          <b>{title}</b>
          <span>{sub}</span>
        </div>
        <HeaderArt />
      </div>
      <div className="nsis-inner">{children}</div>
    </>
  );
}

export function WelcomeScreen() {
  return (
    <Window
      title="Glim Setup"
      buttons={
        <>
          <Button primary>Install</Button>
          <Button>Cancel</Button>
        </>
      }
    >
      <div className="nsis-side">
        <SidebarArt />
        <div className="nsis-copy">
          <h3>Install Glim</h3>
          <p>
            Glim sits at the top of your screen and shows what Claude Code and Codex are doing, so
            you can stay in your own work.
          </p>
          <p>
            It installs for your Windows account only. No administrator rights, no account, no
            telemetry.
          </p>
          <p className="nsis-muted">Installs to %LOCALAPPDATA%\Glim</p>
        </div>
      </div>
    </Window>
  );
}

export function InstallingScreen() {
  return (
    <Window
      title="Glim Setup"
      buttons={
        <>
          <Button disabled>&lt; Back</Button>
          <Button disabled>Next &gt;</Button>
          <Button disabled>Cancel</Button>
        </>
      }
    >
      <Inner title="Installing Glim" sub="This takes a few seconds.">
        <p>Extract: glim-bridge.exe</p>
        <div className="wprogress">
          <i />
        </div>
        <Button>Show details</Button>
      </Inner>
    </Window>
  );
}

export function FinishScreen() {
  return (
    <Window
      title="Glim Setup"
      buttons={
        <>
          <Button primary>Finish</Button>
          <Button disabled>Cancel</Button>
        </>
      }
    >
      <div className="nsis-side">
        <SidebarArt happy />
        <div className="nsis-copy">
          <h3>Glim is ready</h3>
          <p>
            It lives at the top of your screen. When it opens, connect Claude Code, Codex, or both.
            Glim shows every change before it makes it.
          </p>
          <div className="nsis-options">
            <Box checked>Open Glim now</Box>
            <Box>Add a desktop shortcut</Box>
          </div>
        </div>
      </div>
    </Window>
  );
}

export function UpdateScreen() {
  return (
    <Window
      title="Glim Setup"
      buttons={
        <>
          <Button primary>Update</Button>
          <Button>Cancel</Button>
        </>
      }
    >
      <Inner title="Update Glim" sub="Glim 0.1.0 is installed.">
        <p>
          Setup replaces it with this version. Your connections, settings and usage history stay as
          they are.
        </p>
      </Inner>
    </Window>
  );
}

export function UninstallScreen() {
  return (
    <Window
      title="Glim Uninstall"
      buttons={
        <>
          <Button primary>Uninstall</Button>
          <Button>Cancel</Button>
        </>
      }
    >
      <Inner title="Uninstall Glim" sub="Remove Glim from this computer.">
        <p>
          Glim removes its hooks from Claude Code and Codex and its startup entry. Your other agent
          settings stay as they are.
        </p>
        <span className="wfield">
          <span>Uninstalling from:</span>
          <span className="wedit">C:\Users\you\AppData\Local\Glim</span>
        </span>
        <Box>Also delete my usage history</Box>
      </Inner>
    </Window>
  );
}
