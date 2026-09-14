import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NATIVE_SHELL_FIXTURES } from '../../test-utils/verification/native-shell-fixtures';
import { encodeBodyDocument } from '../../app/services/transcoding/body-document-codec';
import { buildSimulationSnapshot } from '../../app/model/body-system/build-simulation-snapshot';

it('publishes loaded, runnable counterparts for paired shell checks', () => {
  let sequence = 0;
  const ids = vi
    .spyOn(crypto, 'randomUUID')
    .mockImplementation(
      () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`
    );
  try {
    const entries = NATIVE_SHELL_FIXTURES.map((fixture) => {
      const document = fixture.create();
      const saved = encodeBodyDocument(document);
      expect(saved.ok, fixture.key).toBe(true);
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      const snapshot = buildSimulationSnapshot(document, 0, {
        mode: 'static',
        gravity: { x: 0, y: -9.81 },
      });
      expect(snapshot.ok, fixture.key).toBe(true);
      if (!snapshot.ok) throw new Error(JSON.stringify(snapshot));
      expect(
        [...snapshot.snapshot.partitions.values()].every((partition) => partition.ok),
        fixture.key
      ).toBe(true);
      const legacy = new StringTranscoder();
      legacy.decodeURL(fixture.legacy);
      return {
        legacyMaterials: legacy.getLinks().filter((link) => link.isRoot).length,
        key: fixture.key,
        legacy: fixture.legacy,
        native: saved.payload,
        materials: document.bodies.length - 1,
      };
    });
    const urls =
      '# Paired S0 fixture URLs\n\nSame authored mechanisms on the public and native routes. These explicit counterparts are fixtures, not an expansion of the supported import format.\n\n' +
      entries
        .map(
          (entry) =>
            `- **${entry.key}**: [Public](https://deploy-preview-13--pmksnew.netlify.app/?${entry.legacy}) · [Native](https://deploy-preview-13--pmksnew.netlify.app/?editor=native&document=${encodeURIComponent(entry.native)})`
        )
        .join('\n') +
      '\n';
    const urlPath = resolve(__dirname, '../../../docs/native-shell-fixture-urls.md');
    if (process.env['PMKS_WRITE_NATIVE_FIXTURES']) writeFileSync(urlPath, urls);
    expect(readFileSync(urlPath, 'utf8')).toBe(urls);
    const path = resolve(__dirname, '../../test-data/native-shell-fixtures.json');
    const text = JSON.stringify(entries, null, 2) + '\n';
    if (process.env['PMKS_WRITE_NATIVE_FIXTURES']) writeFileSync(path, text);
    expect(readFileSync(path, 'utf8')).toBe(text);
  } finally {
    ids.mockRestore();
  }
});
