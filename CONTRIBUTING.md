# Contributing to Glim

Keep Glim small, calm, and local. Changes should preserve existing provider settings, avoid controlling agents, and make unavailable measurements explicit.

Before proposing a change, run the relevant frontend and backend checks listed in [development.md](docs/development.md). For provider parser changes, include a sanitized fixture that demonstrates the behavior and a regression test for accounting or lifecycle state.

Use synthetic prompts and identifiers in fixtures. Do not commit personal transcripts, provider tokens, machine-specific configuration, or generated installers.

Motion should have a clear interaction purpose, remain interruptible, and support reduced motion. Background updates must not steal focus or expand the island.

The original notch logo is editable SVG in `public/brand/`; [Inkscape](https://inkscape.org/) is an open source vector editor. Keep the static mark, `src/components.tsx`, and the animated variant in `src/Mascot.tsx` consistent. Regenerate Windows icons with `npx tauri icon public/glim.svg` after updating the application icon.
