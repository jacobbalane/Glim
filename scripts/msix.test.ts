import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-expect-error Packaging helpers are also runnable without a TS runtime.
import { renderManifest, validateIdentity } from './package-msix.mjs';

const identity = {
  identityName: 'Example.Glim',
  publisher: 'CN=12345678-1234-1234-1234-123456789012',
  publisherDisplayName: 'Example & Co',
  displayName: 'Glim',
  packageVersion: '1.0.0.0',
};

test('Store packaging rejects placeholders and versions the Store cannot accept', () => {
  const example = JSON.parse(
    readFileSync(new URL('../packaging/msix/identity.example.json', import.meta.url), 'utf8'),
  );
  assert.throws(() => validateIdentity(example), /placeholders/);
  for (const packageVersion of ['0.1.0.0', '1.0.0.1', '1.0.65536.0', '1.0.0', '1.0.01.0']) {
    assert.throws(() => validateIdentity({ ...identity, packageVersion }), /packageVersion/);
  }
  assert.throws(() => validateIdentity({ ...identity, publisher: 'Example' }), /CN=/);
  assert.throws(
    () => validateIdentity({ ...identity, displayName: 'Glim\nInjected' }),
    /characters/,
  );
});

test('manifest retains literal publisher text and directs the stable alias to the bundled relay', () => {
  const template = readFileSync(
    new URL('../packaging/msix/AppxManifest.xml', import.meta.url),
    'utf8',
  );
  const manifest = renderManifest(template, { ...identity, displayName: 'Glim "Test" <Preview>' });
  assert.ok(manifest.includes('<PublisherDisplayName>Example &amp; Co</PublisherDisplayName>'));
  assert.ok(manifest.includes('DisplayName="Glim &quot;Test&quot; &lt;Preview&gt;"'));
  assert.ok(manifest.includes('Executable="integrations\\glim-relay.exe"'));
  assert.ok(manifest.includes('Alias="glim-relay.exe"'));
  assert.ok(!manifest.includes('{{'));
  assert.ok(renderManifest(template, identity, true).includes('Alias="glim-validation-relay.exe"'));
  assert.throws(() => renderManifest('{{unknown}}', identity), /Unknown manifest field/);
});
