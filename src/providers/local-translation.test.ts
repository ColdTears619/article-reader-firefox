import { describe, expect, it } from 'vitest';
import { buildModelRegistry, normalizeLanguage, type RemoteSettingsModelRecord } from './local-translation';

function record(fileType: RemoteSettingsModelRecord['fileType'], overrides: Partial<RemoteSettingsModelRecord> = {}): RemoteSettingsModelRecord {
  return {
    name: `${fileType}.enfa.bin`,
    version: '3.0',
    fileType,
    architecture: 'tiny',
    sourceLanguage: 'en',
    targetLanguage: 'fa',
    decompressedHash: 'decompressed',
    decompressedSize: 10,
    filter_expression: '',
    attachment: {
      hash: 'compressed',
      size: 5,
      filename: `${fileType}.zst`,
      location: `${fileType}.zst`,
      mimetype: 'application/zstd'
    },
    ...overrides
  };
}

describe('local translation language handling', () => {
  it('normalizes browser language tags for Mozilla models', () => {
    expect(normalizeLanguage('fa-IR')).toBe('fa');
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('nb-NO')).toBe('no');
  });

  it('groups a complete Firefox model and ignores incomplete variants', () => {
    const registry = buildModelRegistry([
      record('model'), record('lex'), record('vocab'),
      record('model', { version: '4.0', architecture: 'base' })
    ]);
    expect(registry).toHaveLength(1);
    expect(registry[0]).toMatchObject({ from: 'en', to: 'fa', version: '3.0' });
  });

  it('prefers the newest stable desktop model', () => {
    const older = [record('model'), record('lex'), record('vocab')];
    const newer = ['model', 'lex', 'vocab'].map(fileType => record(fileType as RemoteSettingsModelRecord['fileType'], {
      version: '3.1',
      architecture: 'base-memory'
    }));
    const android = ['model', 'lex', 'vocab'].map(fileType => record(fileType as RemoteSettingsModelRecord['fileType'], {
      version: '4.0',
      filter_expression: "env.appinfo.OS == 'Android'"
    }));
    expect(buildModelRegistry([...older, ...newer, ...android])[0]).toMatchObject({ version: '3.1', architecture: 'base-memory' });
  });
});
