import { copyFileSync } from 'node:fs';

// Keep one canonical license in source while shipping it with the standalone VSIX.
copyFileSync(
  new URL('../LICENSE', import.meta.url),
  new URL('../vscode-extension/LICENSE.txt', import.meta.url),
);
