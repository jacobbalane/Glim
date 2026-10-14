# Third-party notices

Glim's original application code is MIT licensed. Third-party components retain their own licenses.

## Three.js

The local 3D Glim renderer uses Three.js, copyright 2010–2026 three.js authors, under the MIT license. Its license is included in `public/licenses/three.txt` and ships in the Windows package under `licenses/three.txt`. The character geometry and animations are Glim's original artwork.

## Manrope

The interface uses the locally bundled [Manrope](https://github.com/sharanda/manrope) variable font by Mikhail Sharanda. The font is licensed under the SIL Open Font License 1.1. Its license is included in `public/fonts/Manrope-LICENSE.txt` and ships in the Windows package under `licenses/manrope.txt`.

## Google Material icon

The horizontal centring icon in `src/HorizontalCentreIcon.tsx` uses Google's unmodified [Align Horizontal Center](https://github.com/google/material-design-icons/blob/master/src/editor/align_horizontal_center/materialicons/24px.svg) artwork from Material Design Icons, under the Apache License 2.0. The license is included in `public/licenses/material-icons.txt` and ships under `licenses/material-icons.txt`.

## Tauri installer template

The Windows installer template `src-tauri/installer/installer.nsi` and its strings `src-tauri/installer/english.nsh` are adapted from the NSIS template and English strings in [tauri-bundler](https://github.com/tauri-apps/tauri/tree/tauri-cli-v2.12.1/crates/tauri-bundler/src/bundle/windows/nsis), copyright Tauri Apps Contributors, under the MIT license in `src-tauri/installer/LICENSE.tauri`. Glim's changes are marked `; Glim:` in the template.

## Website

The website in `site/` is not part of the Windows package. Its hero background (Faulty Terminal) and bottom blur (Gradual Blur) are adapted from [React Bits](https://reactbits.dev/), copyright © 2026 David Haz, under the MIT + Commons Clause license in `site/react-bits/LICENSE.react-bits`; it permits their use in the website and restricts redistributing the components themselves.

## Provider marks

The Claude Spark in `public/providers/claude.svg` is the unmodified Clay SVG from [Anthropic’s official press kit](https://anthropic.com/press-kit), member `Anthropic media resources/Anthropic logos/Claude logos/3 Claude Spark/SVG/Claude Spark - Clay.svg`.

The Codex icon in `public/providers/codex.png` is the unmodified icon published by OpenAI for [its official Codex extension](https://marketplace.visualstudio.com/items?itemName=openai.chatgpt), version `26.51002.51308`, [publisher asset](https://openai.gallerycdn.vsassets.io/extensions/openai/chatgpt/26.51002.51308/1791325973000/Microsoft.VisualStudio.Services.Icons.Default).

These marks identify the connected providers and remain their owners’ property; they are not covered by Glim’s MIT license and do not imply endorsement. Glim’s logo is separate original artwork.
