import { describe, expect, it } from 'vitest';
import { parsePlanFile, PlanFileError, serialisePlan } from './files';
import { emptyDoc } from './storage';

describe('plan files', () => {
  it('round-trips a plan', () => {
    const doc = emptyDoc();
    doc.elements.push({ id: 'f', type: 'furniture', x: 1, y: 2, w: 3, h: 4, rotation: 90, label: 'Bed' });
    expect(parsePlanFile(serialisePlan(doc))).toEqual(doc);
  });

  it.each([
    ['not json', 'damaged'],
    ['{"hello": 1}', 'not a MIMAR plan'],
    ['{"format": "mimar-plan", "version": 99, "doc": {}}', 'newer version'],
  ])('rejects %s', (text, message) => {
    expect(() => parsePlanFile(text)).toThrow(PlanFileError);
    expect(() => parsePlanFile(text)).toThrow(message);
  });

  it('refuses a file with no plan in it, or with nothing readable', () => {
    expect(() => parsePlanFile('{"format":"mimar-plan","version":21}')).toThrow(PlanFileError);
    const junk = { format: 'mimar-plan', version: 21, doc: { elements: [{ type: 'wall', x1: 'a' }, null, 5] } };
    expect(() => parsePlanFile(JSON.stringify(junk))).toThrow(PlanFileError);
  });
});
