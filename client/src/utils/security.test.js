import { describe, expect, it } from 'vitest';
import { neutralizeCsvFormula, csvEscape, normalizeHttpUrl } from './security.js';

describe('csvEscape', () => {
  it('neutralizes spreadsheet formula prefixes, including after spaces', () => {
    for (const prefix of ['=', '+', '-', '@', '\t', '\r', '\n']) {
      expect(neutralizeCsvFormula(`${prefix}danger`).startsWith("'")).toBe(true);
      expect(neutralizeCsvFormula(`   ${prefix}danger`).startsWith("'")).toBe(true);
    }
  });

  it('still performs normal CSV quoting', () => {
    expect(csvEscape('normal')).toBe('normal');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('a"b')).toBe('"a""b"');
  });
});

describe('normalizeHttpUrl', () => {
  it('accepts only HTTP(S) URLs', () => {
    expect(normalizeHttpUrl('https://example.org/path')).toBe('https://example.org/path');
    expect(normalizeHttpUrl('http://example.org')).toBe('http://example.org/');
    expect(normalizeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeHttpUrl('data:text/html,x')).toBeNull();
    expect(normalizeHttpUrl('file:///tmp/a')).toBeNull();
    expect(normalizeHttpUrl('not a url')).toBeNull();
  });
});
