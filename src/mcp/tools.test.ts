import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parsePlanFile } from '../lib/files';
import { handle } from './protocol';
import { TOOLS } from './tools';

const dir = mkdtempSync(join(tmpdir(), 'mimar-mcp-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

interface Reply {
  result?: { content: { text: string }[]; isError?: boolean; tools?: { name: string }[]; serverInfo?: unknown };
  error?: { code: number };
}
const send = (method: string, params?: unknown) =>
  handle(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })) as Reply;
/** Call a tool through the protocol; its JSON answer, or its error text. */
const call = (name: string, args: Record<string, unknown>) => {
  const r = send('tools/call', { name, arguments: args }).result!;
  return r.isError ? { error: r.content[0].text } : JSON.parse(r.content[0].text);
};
const FT = 304.8;

describe('the MIMAR connector', () => {
  it('speaks the protocol: initialize, tools/list, notifications, unknown methods', () => {
    const init = send('initialize', { protocolVersion: '2025-03-26' }).result as unknown as {
      protocolVersion: string;
      serverInfo: { name: string };
    };
    expect(init.protocolVersion).toBe('2025-03-26');
    expect(init.serverInfo.name).toBe('mimar');
    expect(send('tools/list').result!.tools!.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect(handle(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }))).toBeNull();
    expect(send('nope').error!.code).toBe(-32601);
    expect((handle('{oops') as Reply).error!.code).toBe(-32700);
  });

  it('draws a house in a new plan, checks it, generates its structure and exports it', () => {
    const path = join(dir, 'house.mimar');
    const made = call('mimar_new_plan', { path, plotWidthMm: 35 * FT, plotDepthMm: 65 * FT, authority: 'cda' });
    expect(made.plots).toHaveLength(1);
    expect(made.plots[0].authority).toBe('cda');
    expect(call('mimar_new_plan', { path }).error).toMatch(/already/);

    const x0 = 6 * FT;
    const y0 = 20 * FT;
    const walls = call('mimar_add_walls', {
      path,
      closed: true,
      points: [
        { x: x0, y: y0 },
        { x: x0 + 20 * FT, y: y0 },
        { x: x0 + 20 * FT, y: y0 + 15 * FT },
        { x: x0, y: y0 + 15 * FT },
      ],
    });
    expect(walls.wallIds).toHaveLength(4);
    expect(walls.roomsMade).toBe(1);
    expect(walls.saved).toBe(true);

    const door = call('mimar_add_opening', { path, type: 'door', at: { x: x0 + 5 * FT, y: y0 } });
    expect(door.ids).toHaveLength(1);
    const bed = call('mimar_add_furniture', { path, kind: 'bed-double', at: { x: x0 + 10 * FT, y: y0 + 8 * FT } });
    expect(bed.ids).toHaveLength(1);
    expect(call('mimar_add_furniture', { path, kind: 'nope', at: { x: 0, y: 0 } }).error).toMatch(/Unknown kind/);

    const rooms = call('mimar_get_items', { path, type: 'room' });
    expect(rooms.total).toBe(1);
    const renamed = call('mimar_update_item', { path, id: rooms.items[0].id, patch: { name: 'Bedroom' } });
    expect(renamed.item.name).toBe('Bedroom');
    expect(call('mimar_update_item', { path, id: rooms.items[0].id, patch: { id: 'x' } }).error).toMatch(/id or type/);

    const about = call('mimar_describe_plan', { path });
    const ground = about.floors.find((f: { items: { wall?: number } }) => f.items.wall);
    expect(ground.rooms[0]).toMatchObject({ name: 'Bedroom', areaSqFt: expect.any(Number) });
    expect(ground.items.furniture).toBe(1);

    const check = call('mimar_check', { path });
    expect(check.rows.length).toBeGreaterThan(3);
    expect(check.tally.ok + check.tally.fail + check.tally.check).toBeGreaterThan(0);

    const frame = call('mimar_generate_structure', { path });
    expect(frame.counts).toBeTruthy();
    expect(call('mimar_get_items', { path, type: 'column' }).total).toBeGreaterThan(3);
    expect(call('mimar_quantities', { path })).toBeTruthy();

    for (const format of ['dxf', 'ifc', 'structure-csv']) {
      const out = call('mimar_export', { path, format });
      expect(out.bytes).toBeGreaterThan(100);
      expect(readFileSync(out.written, 'utf8').length).toBeGreaterThan(100);
    }
    expect(call('mimar_export', { path, format: 'dxf', out: path }).error).toMatch(/\.dxf/);

    const gone = call('mimar_delete_items', { path, ids: bed.ids });
    expect(gone.deleted).toEqual(bed.ids);
    // The file is still a plan the app opens.
    expect(parsePlanFile(readFileSync(path, 'utf8')).elements.some((el) => el.type === 'furniture')).toBe(false);
  });

  it('plans a floor from a room list on the plot', () => {
    const path = join(dir, 'layout.mimar');
    call('mimar_new_plan', { path, plotWidthMm: 35 * FT, plotDepthMm: 65 * FT });
    const r = call('mimar_generate_layout', { path, program: { bedrooms: 2, attachedBaths: 1 } });
    expect(r.placed).toBe(1);
    expect(r.saved).toBe(true);
    const about = call('mimar_describe_plan', { path });
    expect(about.floors.flatMap((f: { rooms: unknown[] }) => f.rooms).length).toBeGreaterThan(4);
  });

  it('refuses files that are not plans, and says so plainly', () => {
    expect(call('mimar_describe_plan', { path: join(dir, 'notes.txt') }).error).toMatch(/\.mimar/);
    expect(call('mimar_describe_plan', { path: join(dir, 'missing.mimar') }).error).toMatch(/no plan/);
    expect(call('mimar_reference', { topic: 'furniture' }).length).toBeGreaterThan(50);
  });
});

describe('Help > Connect AI agents', () => {
  it('gives the lines an MCP client needs', async () => {
    const { agentConfig } = await import('../lib/agents');
    const text = agentConfig({ command: 'C:\\MIMAR\\MIMAR.exe', args: ['x.mjs'], env: { ELECTRON_RUN_AS_NODE: '1' } });
    expect(JSON.parse(text).mcpServers.mimar).toEqual({
      command: 'C:\\MIMAR\\MIMAR.exe',
      args: ['x.mjs'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    });
  });
});
