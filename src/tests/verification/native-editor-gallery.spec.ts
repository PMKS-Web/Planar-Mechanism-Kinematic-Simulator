import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NATIVE_EDITOR_FIXTURES } from '../../test-utils/verification/native-editor-fixtures';
import {
  encodeBodyDocument,
  decodeBodyDocument,
} from '../../app/services/transcoding/body-document-codec';

it('publishes every native editor verification mechanism as a development URL', () => {
  let sequence = 0;
  const ids = vi
    .spyOn(crypto, 'randomUUID')
    .mockImplementation(
      () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`
    );
  try {
    const entries = NATIVE_EDITOR_FIXTURES.map((f) => {
      const encoded = encodeBodyDocument(f.create());
      expect(encoded.ok, f.name).toBe(true);
      if (!encoded.ok) throw new Error(f.name);
      expect(decodeBodyDocument(encoded.payload).ok).toBe(true);
      return { key: f.key, name: f.name, payload: encoded.payload };
    });
    const markdown =
      '# Native editor verification mechanisms\n\nDevelopment-only S5 route. Start the PR dev server on port 4307. The public editor stays unchanged until S6.\n\n' +
      entries
        .map(
          (e) =>
            `- [${e.name}](http://localhost:4307/?editor=native&document=${encodeURIComponent(e.payload)})`
        )
        .join('\n') +
      '\n';
    const docs = resolve(__dirname, '../../../docs/native-fixture-urls.md');
    const data = resolve(__dirname, '../../test-data/native-editor-fixtures.json');
    const json = JSON.stringify(entries, null, 2) + '\n';
    if (process.env['PMKS_WRITE_NATIVE_FIXTURES']) {
      writeFileSync(docs, markdown);
      writeFileSync(data, json);
    }
    expect(readFileSync(docs, 'utf8')).toBe(markdown);
    expect(readFileSync(data, 'utf8')).toBe(json);
  } finally {
    ids.mockRestore();
  }
});
