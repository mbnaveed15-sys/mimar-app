import type { IconName } from '../theme/icons';
import type { Tool } from '../types';

/** Name, icon and SketchUp-style shortcut for each tool. */
export const TOOL_INFO: Record<Tool, { label: string; icon: IconName; key: string }> = {
  select: { label: 'Select', icon: 'select', key: 'Space' },
  pan: { label: 'Pan', icon: 'pan', key: 'H' },
  zoom: { label: 'Zoom', icon: 'zoom', key: 'Z' },
  orbit: { label: 'Orbit', icon: 'orbit', key: 'O' },
  wall: { label: 'Wall', icon: 'wall', key: 'L' },
  rectangle: { label: 'Rectangle', icon: 'rectangle', key: 'R' },
  room: { label: 'Room', icon: 'room', key: 'A' },
  column: { label: 'Column', icon: 'column', key: 'C' },
  beam: { label: 'Beam', icon: 'beam', key: 'N' },
  slab: { label: 'Slab', icon: 'slab', key: 'Shift+A' },
  plot: { label: 'Plot', icon: 'plot', key: 'P' },
  stairs: { label: 'Stairs', icon: 'stairs', key: 'U' },
  door: { label: 'Door', icon: 'door', key: 'D' },
  window: { label: 'Window', icon: 'window', key: 'W' },
  furniture: { label: 'Furniture', icon: 'furniture', key: 'K' },
  move: { label: 'Move', icon: 'move', key: 'M' },
  rotate: { label: 'Rotate', icon: 'rotate', key: 'Q' },
  tape: { label: 'Tape measure', icon: 'tape', key: 'T' },
  paint: { label: 'Paint', icon: 'paint', key: 'B' },
  erase: { label: 'Eraser', icon: 'erase', key: 'E' },
  brush: { label: 'Brush', icon: 'brush', key: 'Shift+B' },
  mask: { label: 'Mask', icon: 'mask', key: 'Shift+M' },
  offset: { label: 'Offset', icon: 'offset', key: 'F' },
  mirror: { label: 'Mirror', icon: 'mirror', key: 'I' },
  trim: { label: 'Trim', icon: 'trim', key: 'X' },
  extend: { label: 'Extend', icon: 'extend', key: 'Shift+X' },
  breakWall: { label: 'Break', icon: 'break', key: 'Shift+J' },
  join: { label: 'Join', icon: 'join', key: 'J' },
  fillet: { label: 'Fillet', icon: 'fillet', key: 'Shift+F' },
  chamfer: { label: 'Chamfer', icon: 'chamfer', key: 'Shift+C' },
  stretch: { label: 'Stretch', icon: 'stretch', key: 'Shift+S' },
  scale: { label: 'Scale', icon: 'scale', key: 'S' },
};

/** Which menu each tool is listed in: drawing tools under Draw, the rest under Tools. */
export const DRAW_TOOLS: Tool[] = [
  'wall',
  'rectangle',
  'room',
  'column',
  'beam',
  'slab',
  'plot',
  'stairs',
  'door',
  'window',
  'furniture',
  'mask',
];
