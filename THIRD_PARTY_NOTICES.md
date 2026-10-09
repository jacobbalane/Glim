# Third-party notices

Glim's original application code is MIT licensed. Third-party components retain their own licenses.

## React Bits

The Crystalized Ball and Star Border runtime components in `src/react-bits/` are adapted from [React Bits](https://reactbits.dev/), copyright © 2026 David Haz. They were imported from [upstream commit 3329f3b](https://github.com/DavidHDev/react-bits/tree/3329f3bde763a37a2a89b24598e9f50fa0d4de3d).

Their [MIT + Commons Clause license](src/react-bits/LICENSE.react-bits) permits inclusion in an application and has separate restrictions on redistributing the components themselves. That license applies to these adapted files, and a copy ships in the Windows package under `licenses/react-bits.txt`.

Glim's adaptations add a WebGL fallback, a frame-rate limit, hidden-view suspension, a smaller particle budget, monochrome styling, and provider colors. Reduced-motion preferences keep the working indicator still. The components run locally as part of the app.

## Manrope

The interface uses the locally bundled [Manrope](https://github.com/sharanda/manrope) variable font by Mikhail Sharanda. The font is licensed under the SIL Open Font License 1.1. Its license is included in `public/fonts/Manrope-LICENSE.txt` and ships in the Windows package under `licenses/manrope.txt`.

## Provider marks

The Claude Spark in `public/providers/claude.svg` is the unmodified Clay SVG from [Anthropic’s official press kit](https://anthropic.com/press-kit), member `Anthropic media resources/Anthropic logos/Claude logos/3 Claude Spark/SVG/Claude Spark - Clay.svg`.

The Codex icon in `public/providers/codex.png` is the unmodified icon published by OpenAI for [its official Codex extension](https://marketplace.visualstudio.com/items?itemName=openai.chatgpt), version `26.51002.51308`, [publisher asset](https://openai.gallerycdn.vsassets.io/extensions/openai/chatgpt/26.51002.51308/1791325973000/Microsoft.VisualStudio.Services.Icons.Default).

These marks identify the connected providers and remain their owners’ property; they are not covered by Glim’s MIT license and do not imply endorsement. Glim’s logo is separate original artwork.
