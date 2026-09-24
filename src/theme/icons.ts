/** Mimar line icons: 24px grid, 1.75px stroke, round caps and joins, drawn in currentColor. */
export const ICONS = {
  select: "<path d='M6 3.5v16l4.3-4.1 2.9 5.6 2.6-1.3-2.8-5.6H19z'/>",
  pan: "<path d='M8 13.5V6.6a1.6 1.6 0 0 1 3.2 0V12'/><path d='M11.2 11.6V5.1a1.6 1.6 0 0 1 3.2 0v6.5'/><path d='M14.4 11.6V7a1.6 1.6 0 0 1 3.2 0v7c0 4.1-2.6 6.8-6.3 6.8-2.6 0-4.3-1.2-5.6-3.3L3.9 14a1.5 1.5 0 0 1 2.5-1.6L8 14.3'/>",
  wall: "<path d='M5.5 18.5 18.5 5.5'/><rect x='3' y='16' width='5' height='5' rx='1'/><rect x='16' y='3' width='5' height='5' rx='1'/>",
  rectangle:
    "<rect x='4' y='6' width='16' height='12' rx='0.5'/><circle cx='4' cy='6' r='1.6' fill='currentColor' stroke='none'/><circle cx='20' cy='18' r='1.6' fill='currentColor' stroke='none'/>",
  room: "<rect x='4' y='4' width='16' height='16' rx='0.5'/><path d='M4 11.5 11.5 4M4 18 18 4M9.5 20 20 9.5M16 20l4-4'/>",
  door: "<path d='M3 20h5M16 20h5M8 20V8'/><path d='M8 8a12 12 0 0 1 12 12' stroke-dasharray='2 2.2'/>",
  window: "<path d='M2.5 12H6M18 12h3.5'/><rect x='6' y='8.5' width='12' height='7' rx='0.5'/><path d='M6 12h12'/>",
  furniture:
    "<path d='M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3'/><path d='M3 18.5v-5a2 2 0 0 1 4 0v1.5h10v-1.5a2 2 0 0 1 4 0v5z'/><path d='M5.5 18.5v2M18.5 18.5v2'/>",
  paint:
    "<path d='M18.5 11 11 3.5 3.4 11.1a1.6 1.6 0 0 0 0 2.3l5.2 5.2a1.6 1.6 0 0 0 2.3 0z'/><path d='M3.4 12.5h14M6 2l4 4'/><path d='M21.5 19.5a1.8 1.8 0 1 1-3.6 0c0-1.3 1.5-2.2 1.8-3.8.3 1.6 1.8 2.5 1.8 3.8z'/>",
  brush:
    "<path d='M20.5 3.5 12 12'/><path d='M11 13c-2.7-.4-5 1.3-5 4 0 1.5-1 2.5-2.5 2.7 1.3 1.1 3 1.8 4.8 1.8 3 0 5.2-2.4 4.7-5.5z'/>",
  mask: "<path d='M5 7.5 12 4l7 4-1.5 9-8.5 2.5z' stroke-dasharray='2.2 2'/>",
  erase:
    "<path d='M8 20.5h12'/><path d='m5.4 16.4 9.3-9.3a2 2 0 0 1 2.8 0l2.1 2.1a2 2 0 0 1 0 2.8L11.1 20.5H8.3a2 2 0 0 1-1.4-.6l-1.5-1.5a2 2 0 0 1 0-2z'/><path d='m9.5 12.3 4.9 4.9'/>",
  tape: "<path d='m3 16.5 13.5-13.5 4.5 4.5L7.5 21z'/><path d='m7.5 12 2 2M10.5 9l2 2M13.5 6l2 2M9 10.5l1 1M12 7.5l1 1'/>",
  move: "<path d='M12 3v18M3 12h18'/><path d='m9 5.5 3-2.5 3 2.5M9 18.5l3 2.5 3-2.5M5.5 9 3 12l2.5 3M18.5 9l2.5 3-2.5 3'/>",
  rotate: "<path d='M19.5 13a7.5 7.5 0 1 1-2.2-6.3'/><path d='M19.8 4v4.4h-4.4'/>",
  zoom: "<circle cx='10.5' cy='10.5' r='6.5'/><path d='m15.3 15.3 5.2 5.2M10.5 7.8v5.4M7.8 10.5h5.4'/>",
  'zoom-extents':
    "<path d='M3.5 8.5v-5h5M20.5 8.5v-5h-5M3.5 15.5v5h5M20.5 15.5v5h-5'/><rect x='8.5' y='8.5' width='7' height='7' rx='0.5'/>",
  orbit:
    "<circle cx='12' cy='12' r='3'/><path d='M20.8 10.5C21.6 13 17.6 16 12 16S2.4 13.5 3.2 11c.7-2.2 4.4-3.8 8.8-3.8'/><path d='m9.8 5 2.4 2.2L9.9 9.5'/>",
  'view-3d': "<path d='m12 3 8 4.5v9L12 21l-8-4.5v-9z'/><path d='m4 7.5 8 4.5 8-4.5M12 12v9'/>",
  'view-2d': "<rect x='3.5' y='3.5' width='17' height='17' rx='0.5'/><path d='M3.5 12H11v8.5M15 3.5V9'/>",
  undo: "<path d='M9 14 4 9l5-5'/><path d='M4 9h10.5a5.5 5.5 0 0 1 0 11H11'/>",
  redo: "<path d='m15 14 5-5-5-5'/><path d='M20 9H9.5a5.5 5.5 0 0 0 0 11H13'/>",
  new: "<path d='M14 3H6.5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V7.5z'/><path d='M14 3v4.5h4.5M12 11v6M9 14h6'/>",
  open: "<path d='M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/>",
  save: "<path d='M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z'/><path d='M8 4v4.5h7V4M8 20v-6h8v6'/>",
  export: "<path d='M12 15V3.5M7.5 8 12 3.5 16.5 8'/><path d='M4.5 14v5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-5'/>",
  layers: "<path d='m12 3.5 8.5 4.5-8.5 4.5L3.5 8z'/><path d='m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5l8.5 4.5 8.5-4.5'/>",
  settings: "<path d='M4 7h9M17 7h3M4 17h3M11 17h9'/><circle cx='15' cy='7' r='2'/><circle cx='9' cy='17' r='2'/>",
  keyboard:
    "<rect x='2.5' y='6' width='19' height='12' rx='2'/><path d='M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8'/>",
  search: "<circle cx='11' cy='11' r='6.5'/><path d='m16 16 4.5 4.5'/>",
  check: "<path d='m5 12.5 4.5 4.5L19 7.5'/>",
  close: "<path d='M6 6l12 12M18 6 6 18'/>",
  menu: "<path d='M4 7h16M4 12h16M4 17h16'/>",
  pen: "<path d='M4 20.5l1.1-4.4L16.2 5a2.1 2.1 0 0 1 3 3L8.1 19.1z'/><path d='m14 7.2 3 3'/>",
  snap: "<path d='M6 3.5v8a6 6 0 0 0 12 0v-8'/><path d='M6 7.5h4M14 7.5h4'/>",
  theme:
    "<circle cx='12' cy='12' r='8.5'/><path d='M12 3.5v17a8.5 8.5 0 0 0 0-17z' fill='currentColor' stroke='none'/>",
  offset: "<path d='M4 7.5h16M4 16.5h16'/><path d='M12 9.5v5M10 12.5l2 2 2-2'/>",
  mirror: "<path d='M12 3v18' stroke-dasharray='2 2'/><path d='M9 7 4 17h5zM15 7l5 10h-5z'/>",
  trim: "<path d='M3 12h7M12 4v16'/><path d='M14 12h7' stroke-dasharray='2 2.2'/>",
  extend: "<path d='M3 12h9M20 5v14'/><path d='M12 12h5' stroke-dasharray='2 2'/><path d='m15 9 3 3-3 3'/>",
  break: "<path d='M3 12h6M15 12h6M9 8.5v7M15 8.5v7'/>",
  join: "<path d='M3 12h7M14 12h7M7 9l3 3-3 3M17 9l-3 3 3 3'/>",
  fillet: "<path d='M4 20v-8a8 8 0 0 1 8-8h8'/>",
  chamfer: "<path d='M4 20v-9l7-7h9'/>",
  stretch: "<path d='M12 6H4v12h8'/><path d='M12 6v12' stroke-dasharray='2 2'/><path d='M14 12h7M18 9l3 3-3 3'/>",
  scale: "<rect x='3.5' y='10.5' width='10' height='10' rx='0.5'/><path d='M13.5 10.5l6.5-6.5M15 4h5v5'/>",
  column:
    "<rect x='8' y='8' width='8' height='8' fill='currentColor' stroke='none'/><path d='M4 4h16v16H4z' stroke-dasharray='2 2'/>",
  beam: "<path d='M3 9h18M3 15h18' stroke-dasharray='3 2'/><rect x='2.5' y='7' width='3' height='10' fill='currentColor' stroke='none'/><rect x='18.5' y='7' width='3' height='10' fill='currentColor' stroke='none'/>",
  slab: "<path d='M3 9 12 4l9 5-9 5z'/><path d='M3 9v3l9 5 9-5V9'/>",
  levels: "<path d='M4 20h16M4 14h16M4 8h16'/><path d='M8 20v-6M16 14V8'/>",
} as const;

export type IconName = keyof typeof ICONS;
