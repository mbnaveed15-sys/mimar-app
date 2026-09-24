import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { describeUpdate } from './updates';

const require = createRequire(import.meta.url);
const { compareVersions } = require('../../updater.cjs') as { compareVersions: (a: string, b: string) => number };

describe('updates', () => {
  it('compares versions numerically, with or without a leading v', () => {
    expect(compareVersions('v1.10.0', '1.9.2')).toBeGreaterThan(0);
    expect(compareVersions('1.7.0', 'v1.7.0')).toBe(0);
    expect(compareVersions('1.6.9', '1.7.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0-beta', '1.9.9')).toBeGreaterThan(0);
  });

  it('describes each state in plain words', () => {
    expect(describeUpdate({ state: 'unsupported' })).toBe('');
    expect(describeUpdate({ state: 'downloading', latest: '1.8.0', percent: 40 })).toBe(
      'Downloading Mimar 1.8.0 (40%)…',
    );
    expect(describeUpdate({ state: 'ready', latest: '1.8.0' })).toBe('Mimar 1.8.0 is ready to install.');
    expect(describeUpdate({ state: 'available-portable', latest: '1.8.0' })).toBe('Mimar 1.8.0 is available.');
    expect(describeUpdate({ state: 'error' })).toMatch(/internet connection/);
  });
});
