import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { planPathFromArgs } = require('../../open-file.cjs') as {
  planPathFromArgs: (args: unknown, cwd?: string) => string | null;
};

describe('planPathFromArgs', () => {
  it('finds the plan among the switches a double-click starts the app with', () => {
    expect(planPathFromArgs(['--allow-file-access', '/plans/My house.mimar'], '/')).toBe(
      resolve('/plans/My house.mimar'),
    );
    expect(planPathFromArgs(['.', 'House.MIMAR'], '/home/me')).toBe(resolve('/home/me/House.MIMAR'));
  });

  it('is null when the app was started plain, or with some other file', () => {
    expect(planPathFromArgs([], '/')).toBeNull();
    expect(planPathFromArgs(['.', '--inspect', 'notes.txt', '--file=x.mimar'], '/')).toBeNull();
    expect(planPathFromArgs(undefined, '/')).toBeNull();
  });
});
