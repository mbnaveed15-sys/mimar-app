import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The release build writes each GitHub release's description with scripts/release-notes.mjs.
const notes = (version?: string) =>
  execFileSync(process.execPath, ['scripts/release-notes.mjs', ...(version ? [version] : [])], { encoding: 'utf8' });

describe('release notes', () => {
  it('has a note of what is new for the version being released', () => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    const text = notes();
    expect(text.startsWith(`# Mimar ${version}\n`)).toBe(true);
    expect(text).toContain(`## New in ${version}`);
    expect(text).toContain(`Mimar-Setup-${version}.exe`);
    expect(text).toContain('## What Mimar does');
    expect(text).not.toMatch(/\{\{|<!--/);
  });

  it('refuses a version with no note', () => {
    expect(() => notes('0.0.1')).toThrow();
  });
});
