# Contributing to Glim

Keep Glim small, calm, and local. Changes should preserve existing provider settings, avoid controlling agents, and make unavailable measurements explicit.

Before proposing a change, run the relevant frontend and backend checks listed in [development.md](docs/development.md). For provider parser changes, include a sanitized fixture that demonstrates the behavior and a regression test for accounting or lifecycle state.

Use synthetic prompts and identifiers in fixtures. Do not commit personal transcripts, provider tokens, machine-specific configuration, or generated installers.

Motion should have a clear interaction purpose, remain interruptible, and support reduced motion. Background updates must not steal focus or expand the island.

The app and website share the 3D character in `src/mascot-renderer.ts`; `src/Character.tsx` fits it into the app's UI and provides the SVG fallback. Keep its proportions and state colors consistent. With `npm run dev` running, use `npm run brand:render` to regenerate the favicon and the app icons for macOS and Windows, then `npm run preview:capture` to refresh the gallery. Generated brand assets are committed; screenshots stay in `.cache/`. The original SVGs in `public/brand/` remain editable source artwork.
