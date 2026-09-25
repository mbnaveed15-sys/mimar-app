import { exportModel, exportPlanDxf, exportPlanPdf, exportPlanPng } from './lib/exportActions';
import { plannerStore, type PlannerState } from './store/plannerStore';
import { THEMES } from './theme/themes';
import { DRAW_TOOLS, TOOL_INFO } from './tools/toolInfo';
import { MODIFY_TOOLS, SIMPLE_TOOLS, TOOLS, type Tool } from './types';

export type MenuId = 'file' | 'edit' | 'view' | 'draw' | 'tools' | 'modify' | 'help';

export const MENUS: { id: MenuId; label: string }[] = [
  { id: 'file', label: 'File' },
  { id: 'edit', label: 'Edit' },
  { id: 'view', label: 'View' },
  { id: 'draw', label: 'Draw' },
  { id: 'tools', label: 'Tools' },
  { id: 'modify', label: 'Modify' },
  { id: 'help', label: 'Help' },
];

/** One thing the app can do, shown in a menu, in search and in the shortcut list. */
export interface Command {
  id: string;
  label: string;
  menu: MenuId;
  /** Commands with different groups in the same menu are split by a line. */
  group: number;
  /** Keyboard shortcuts, e.g. 'Ctrl+S' or 'Shift+Z'; the first is shown in menus. */
  keys?: string[];
  run: () => void;
  enabled?: (s: PlannerState) => boolean;
  /** Shown as a tick (check) or a dot (radio) when true. */
  checked?: (s: PlannerState) => boolean;
  kind?: 'check' | 'radio';
  /** Hidden from menus (still in search), e.g. Pro tools in Simple mode. */
  hidden?: (s: PlannerState) => boolean;
}

/** What the commands need from the app shell. */
export interface CommandContext {
  requestNew: () => void;
  requestOpen: () => void;
  save: (saveAs?: boolean) => void;
  openSearch: () => void;
  openShortcuts: () => void;
  /** Open and scroll to a section of the side panel, e.g. 'grid'. */
  showSection: (id: string) => void;
  checkForUpdates?: () => void;
}

const st = () => plannerStore.getState();
const hasSelection = (s: PlannerState) => s.selectedIds.length > 0;
const selectedElement = (s: PlannerState) =>
  s.selectedIds.length === 1 ? s.doc.elements.find((el) => el.id === s.selectedId) : undefined;
/** Something that can be copied or turned: anything but a lone door or window. */
const canTransform = (s: PlannerState) =>
  s.selectedIds.length > 1 || ['wall', 'furniture'].includes(selectedElement(s)?.type ?? '') || !!s.selectedGroup();

/** Switch to the floor above (1) or below (-1). */
function stepLevel(step: number) {
  const s = st();
  const i = s.doc.levels.findIndex((l) => l.id === s.activeLevel);
  const next = s.doc.levels[i + step];
  if (next) s.setActiveLevel(next.id);
}

function toolCommand(tool: Tool, menu: MenuId, group: number): Command {
  const info = TOOL_INFO[tool];
  return {
    id: `tool.${tool}`,
    label: info.label,
    menu,
    group,
    keys: [info.key],
    run: () => {
      const s = st();
      if (!SIMPLE_TOOLS.includes(tool) && s.mode === 'simple') s.setMode('pro');
      s.setTool(tool);
    },
    kind: 'radio',
    checked: (s) => s.tool === tool,
    // Pro drawing tools are hidden in Simple mode; the Modify menu always lists its tools.
    hidden: (s) => s.mode === 'simple' && !SIMPLE_TOOLS.includes(tool) && !MODIFY_TOOLS.includes(tool),
  };
}

export function buildCommands(ctx: CommandContext): Command[] {
  const layer = (id: string, label: string, key: 'showFurniture' | 'showRoomLabels' | 'showRoomFills'): Command => ({
    id,
    label,
    menu: 'view',
    group: 3,
    run: () => st().setLayer(key, !st()[key]),
    kind: 'check',
    checked: (s) => s[key],
  });

  return [
    // File
    { id: 'file.new', label: 'New', menu: 'file', group: 0, keys: ['Ctrl+N'], run: ctx.requestNew },
    { id: 'file.open', label: 'Open…', menu: 'file', group: 0, keys: ['Ctrl+O'], run: ctx.requestOpen },
    { id: 'file.save', label: 'Save', menu: 'file', group: 1, keys: ['Ctrl+S'], run: () => ctx.save() },
    { id: 'file.saveAs', label: 'Save as…', menu: 'file', group: 1, keys: ['Ctrl+Shift+S'], run: () => ctx.save(true) },
    { id: 'file.pdf', label: 'Export PDF', menu: 'file', group: 2, keys: ['Ctrl+P'], run: exportPlanPdf },
    { id: 'file.png', label: 'Export PNG', menu: 'file', group: 2, run: exportPlanPng },
    { id: 'file.dxf', label: 'Export DXF (AutoCAD)', menu: 'file', group: 2, run: exportPlanDxf },
    {
      id: 'file.glb',
      label: 'Export 3D: GLB (Twinmotion)',
      menu: 'file',
      group: 3,
      run: () => exportModel('glb'),
    },
    { id: 'file.dae', label: 'Export 3D: DAE (SketchUp)', menu: 'file', group: 3, run: () => exportModel('dae') },
    { id: 'file.obj', label: 'Export 3D: OBJ (other 3D apps)', menu: 'file', group: 3, run: () => exportModel('obj') },

    // Edit
    {
      id: 'edit.undo',
      label: 'Undo',
      menu: 'edit',
      group: 0,
      keys: ['Ctrl+Z'],
      run: () => st().undo(),
      enabled: (s) => s.past.length > 0 || s.batchBase !== null,
    },
    {
      id: 'edit.redo',
      label: 'Redo',
      menu: 'edit',
      group: 0,
      keys: ['Ctrl+Y', 'Ctrl+Shift+Z'],
      run: () => st().redo(),
      enabled: (s) => s.future.length > 0,
    },
    {
      id: 'edit.copy',
      label: 'Copy',
      menu: 'edit',
      group: 1,
      keys: ['Ctrl+C'],
      run: () => st().copySelected(),
      enabled: canTransform,
    },
    {
      id: 'edit.paste',
      label: 'Paste',
      menu: 'edit',
      group: 1,
      keys: ['Ctrl+V'],
      run: () => st().paste(),
      enabled: (s) => s.clipboard !== null,
    },
    {
      id: 'edit.duplicate',
      label: 'Duplicate',
      menu: 'edit',
      group: 1,
      keys: ['Ctrl+D'],
      run: () => st().duplicateSelected(),
      enabled: canTransform,
    },
    {
      id: 'edit.delete',
      label: 'Delete',
      menu: 'edit',
      group: 1,
      keys: ['Delete', 'Backspace'],
      run: () => st().deleteSelected(),
      enabled: hasSelection,
    },
    {
      id: 'edit.rotate90',
      label: 'Rotate 90°',
      menu: 'edit',
      group: 2,
      run: () => st().rotateSelected(90),
      enabled: canTransform,
    },
    {
      id: 'edit.flipSwing',
      label: 'Flip door swing',
      menu: 'edit',
      group: 2,
      run: () => {
        const id = st().selectedId;
        if (id) st().flipOpening(id, 'side');
      },
      enabled: (s) => selectedElement(s)?.type === 'door',
    },
    {
      id: 'edit.flipHinge',
      label: 'Flip door hinge',
      menu: 'edit',
      group: 2,
      run: () => {
        const id = st().selectedId;
        if (id) st().flipOpening(id, 'hinge');
      },
      enabled: (s) => selectedElement(s)?.type === 'door',
    },
    {
      id: 'edit.parapet',
      label: 'Parapet round roof',
      menu: 'edit',
      group: 2,
      run: () => {
        const id = st().selectedId;
        if (id) st().addParapetAround(id);
      },
      enabled: (s) => selectedElement(s)?.type === 'slab',
    },
    {
      id: 'edit.selectAll',
      label: 'Select all',
      menu: 'edit',
      group: 3,
      keys: ['Ctrl+A'],
      run: () => st().selectAll(),
    },
    {
      id: 'edit.deselect',
      label: 'Select none',
      menu: 'edit',
      group: 3,
      keys: ['Esc'],
      run: () => st().select(null),
      enabled: hasSelection,
    },

    {
      id: 'edit.group',
      label: 'Make group',
      menu: 'edit',
      group: 4,
      keys: ['Ctrl+G'],
      run: () => st().groupSelected(),
      enabled: (s) => s.selectedIds.length > 1 && !s.selectedGroup(),
    },
    {
      id: 'edit.component',
      label: 'Make component',
      menu: 'edit',
      group: 4,
      keys: ['G'],
      run: () => st().makeComponentFromSelection(),
      enabled: (s) => s.selectedIds.length > 0 && !s.selectedGroup()?.componentId,
    },
    {
      id: 'edit.ungroup',
      label: 'Ungroup / explode',
      menu: 'edit',
      group: 4,
      keys: ['Ctrl+Shift+G'],
      run: () => st().ungroupSelected(),
      enabled: (s) => !!s.selectedGroup(),
    },
    {
      id: 'edit.openGroup',
      label: 'Edit group or component',
      menu: 'edit',
      group: 4,
      run: () => {
        const g = st().selectedGroup();
        if (g) st().openGroup(g.id);
      },
      enabled: (s) => !!s.selectedGroup(),
    },
    {
      id: 'edit.closeGroup',
      label: 'Close group',
      menu: 'edit',
      group: 4,
      run: () => st().closeGroup(),
      enabled: (s) => s.openGroupId !== null,
    },
    {
      id: 'edit.unique',
      label: 'Make unique',
      menu: 'edit',
      group: 4,
      run: () => st().makeSelectedUnique(),
      enabled: (s) => !!s.selectedGroup()?.componentId,
    },

    // View
    {
      id: 'view.2d',
      label: '2D plan',
      menu: 'view',
      group: 0,
      keys: ['Ctrl+1'],
      run: () => st().setView3d(false),
      kind: 'radio',
      checked: (s) => !s.view3d,
    },
    {
      id: 'view.3d',
      label: '3D view',
      menu: 'view',
      group: 0,
      keys: ['Ctrl+2'],
      run: () => st().setView3d(true),
      kind: 'radio',
      checked: (s) => s.view3d,
    },
    {
      id: 'view.levelUp',
      label: 'Floor above',
      menu: 'view',
      group: 0,
      keys: ['PageUp'],
      run: () => stepLevel(1),
      enabled: (s) => s.doc.levels.findIndex((l) => l.id === s.activeLevel) < s.doc.levels.length - 1,
    },
    {
      id: 'view.levelDown',
      label: 'Floor below',
      menu: 'view',
      group: 0,
      keys: ['PageDown'],
      run: () => stepLevel(-1),
      enabled: (s) => s.doc.levels.findIndex((l) => l.id === s.activeLevel) > 0,
    },
    { id: 'view.addLevel', label: 'Add floor above', menu: 'view', group: 0, run: () => st().addLevel() },
    { id: 'view.zoomIn', label: 'Zoom in', menu: 'view', group: 1, keys: ['+', '='], run: () => st().zoomBy(1.25) },
    { id: 'view.zoomOut', label: 'Zoom out', menu: 'view', group: 1, keys: ['-'], run: () => st().zoomBy(1 / 1.25) },
    {
      id: 'view.extents',
      label: 'Zoom extents',
      menu: 'view',
      group: 1,
      keys: ['Shift+Z', '0'],
      run: () => st().fitToPlan(),
    },
    {
      id: 'view.grid',
      label: 'Show grid',
      menu: 'view',
      group: 2,
      keys: ["Ctrl+'"],
      run: () => st().setGrid({ show: !st().grid.show }),
      kind: 'check',
      checked: (s) => s.grid.show,
    },
    {
      id: 'view.snap',
      label: 'Snap to grid',
      menu: 'view',
      group: 2,
      run: () => st().setGrid({ snap: !st().grid.snap }),
      kind: 'check',
      checked: (s) => s.grid.snap,
    },
    { id: 'view.gridSettings', label: 'Grid settings…', menu: 'view', group: 2, run: () => ctx.showSection('grid') },
    {
      id: 'view.dimensions',
      label: 'Dimensions',
      menu: 'view',
      group: 3,
      run: () => st().setShowDimensions(!st().showDimensions),
      kind: 'check',
      checked: (s) => s.showDimensions,
    },
    layer('view.furniture', 'Furniture', 'showFurniture'),
    layer('view.roomLabels', 'Room names & areas', 'showRoomLabels'),
    layer('view.roomFills', 'Room colours', 'showRoomFills'),
    {
      id: 'view.simple',
      label: 'Simple mode',
      menu: 'view',
      group: 4,
      run: () => st().setMode('simple'),
      kind: 'radio',
      checked: (s) => s.mode === 'simple',
    },
    {
      id: 'view.pro',
      label: 'Pro mode',
      menu: 'view',
      group: 4,
      run: () => st().setMode('pro'),
      kind: 'radio',
      checked: (s) => s.mode === 'pro',
    },
    ...THEMES.map((t): Command => ({
      id: `view.theme.${t.id}`,
      label: `Theme: ${t.name}`,
      menu: 'view',
      group: 5,
      run: () => st().setTheme(t.id),
      kind: 'radio',
      checked: (s) => s.theme === t.id,
    })),

    // Draw and Tools
    ...TOOLS.filter((t) => DRAW_TOOLS.includes(t)).map((t) => toolCommand(t, 'draw', t === 'mask' ? 1 : 0)),
    ...MODIFY_TOOLS.map((t) => toolCommand(t, 'modify', ['offset', 'mirror', 'scale', 'stretch'].includes(t) ? 0 : 1)),
    ...TOOLS.filter((t) => !DRAW_TOOLS.includes(t) && !MODIFY_TOOLS.includes(t)).map((t) =>
      toolCommand(
        t,
        'tools',
        ['select', 'pan', 'zoom', 'orbit'].includes(t) ? 0 : ['move', 'rotate', 'tape'].includes(t) ? 1 : 2,
      ),
    ),

    // Help
    { id: 'help.shortcuts', label: 'Keyboard shortcuts', menu: 'help', group: 0, keys: ['?'], run: ctx.openShortcuts },
    { id: 'help.search', label: 'Search actions…', menu: 'help', group: 0, keys: ['Ctrl+K'], run: ctx.openSearch },
    ...(ctx.checkForUpdates
      ? [
          {
            id: 'help.updates',
            label: 'Check for updates',
            menu: 'help' as const,
            group: 1,
            run: ctx.checkForUpdates,
          },
        ]
      : []),
  ];
}

/** A shortcut split into its parts, e.g. Ctrl+Shift+S. */
function parseKeys(combo: string) {
  const parts = combo.split('+');
  // "+" on its own (zoom in) is a key, not a separator.
  const key = combo === '+' ? '+' : parts[parts.length - 1];
  const mods = combo === '+' ? [] : parts.slice(0, -1);
  return { key, ctrl: mods.includes('Ctrl'), shift: mods.includes('Shift'), alt: mods.includes('Alt') };
}

/** Whether a key press is this shortcut. */
export function matchesKeys(e: KeyboardEvent, combo: string): boolean {
  const { key, ctrl, shift, alt } = parseKeys(combo);
  if ((e.ctrlKey || e.metaKey) !== ctrl || e.altKey !== alt) return false;
  // Symbols like ? and + need Shift on most keyboards, so Shift only counts for letters and named keys.
  const symbol = key.length === 1 && !/[a-z0-9]/i.test(key);
  if (!symbol && e.shiftKey !== shift) return false;
  if (key === 'Space') return e.code === 'Space';
  if (key === 'Esc') return e.key === 'Escape';
  if (key === "'") return e.code === 'Quote';
  if (/^[0-9]$/.test(key) && ctrl) return e.code === `Digit${key}` || e.key === key;
  return e.key.toLowerCase() === key.toLowerCase();
}

/** Shortcut as shown on screen: Ctrl becomes ⌘ on a Mac. */
export function showKeys(combo: string): string {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return mac ? combo.replace(/Ctrl\+/g, '⌘') : combo;
}
