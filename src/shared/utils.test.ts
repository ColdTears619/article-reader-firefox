import { describe, expect, it } from 'vitest';
import { isExtensionDisconnectedError, isRtlText } from './utils';

describe('text direction detection', () => {
  it('keeps English article text left to right', () => {
    expect(isRtlText('SAML authentication works across identity providers.')).toBe(false);
  });

  it('detects Persian text as right to left', () => {
    expect(isRtlText('این یک متن فارسی برای مطالعه است.')).toBe(true);
  });

  it('uses the dominant script for mixed text', () => {
    expect(isRtlText('OAuth در این متن فارسی توضیح داده می‌شود')).toBe(true);
  });
});

describe('extension connection errors', () => {
  it('recognizes a Reader page left open across an extension reload', () => {
    expect(isExtensionDisconnectedError(new Error('Could not establish connection. Receiving end does not exist.'))).toBe(true);
    expect(isExtensionDisconnectedError(new Error('Extension context invalidated.'))).toBe(true);
    expect(isExtensionDisconnectedError(new Error('Network request failed.'))).toBe(false);
  });
});
