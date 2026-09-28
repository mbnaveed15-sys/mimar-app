/**
 * Project types: a house on a plot (Mimar's first kind of project), a free project for studio work,
 * or a non-residential building. What each shows by default, and a building's room types. Pure.
 */
import type { BuildingUse, PlanDoc, ProjectPanel, ProjectSettings, ProjectType, Units } from '../types';

export const HOUSE: ProjectSettings = { type: 'house' };

export const projectOf = (doc: Pick<PlanDoc, 'project'>): ProjectSettings => doc.project ?? HOUSE;

export const PROJECT_TYPES: { id: ProjectType; label: string; blurb: string }[] = [
  {
    id: 'house',
    label: 'House on a plot',
    blurb: 'A plot with setbacks and bylaws, marla, the room list, plan check and cost (as Mimar has always done).',
  },
  {
    id: 'free',
    label: 'Free project',
    blurb: 'A blank canvas for studio work, pavilions and massing: no bylaws or house rules, metric to start.',
  },
  {
    id: 'building',
    label: 'Building',
    blurb: 'Offices, schools, clinics, shops and mosques: room types for its use, metric to start.',
  },
];

export const BUILDING_USES: { id: BuildingUse; label: string }[] = [
  { id: 'office', label: 'Office' },
  { id: 'school', label: 'School' },
  { id: 'clinic', label: 'Clinic' },
  { id: 'shop', label: 'Shop' },
  { id: 'mosque', label: 'Mosque / prayer hall' },
  { id: 'other', label: 'Other' },
];

/** Sections each type shows unless the project says otherwise. */
const USUAL: Record<ProjectType, Record<ProjectPanel, boolean>> = {
  house: { bylaws: true, hints: true, roomList: true, cost: true },
  free: { bylaws: false, hints: true, roomList: false, cost: false },
  building: { bylaws: false, hints: true, roomList: false, cost: false },
};

export const PANEL_NAMES: Record<ProjectPanel, string> = {
  bylaws: 'Bylaws and plan check',
  hints: 'Plan hints',
  roomList: 'Room list (house layouts)',
  cost: 'Quantities & cost',
};

/** Whether a project shows a section. */
export function shows(doc: Pick<PlanDoc, 'project'>, panel: ProjectPanel): boolean {
  const p = projectOf(doc);
  return p.panels?.[panel] ?? USUAL[p.type][panel];
}

/** The units a new project of this type starts in. */
export const unitsFor = (type: ProjectType): Units => (type === 'house' ? 'imperial' : 'metric');

/** A room type of a building: its name, usual size (m) and whether it wants daylight. */
export interface RoomType {
  name: string;
  w: number;
  d: number;
  daylight?: boolean;
}

const TOILETS: RoomType[] = [
  { name: 'Toilets (men)', w: 3, d: 4 },
  { name: 'Toilets (women)', w: 3, d: 4 },
  { name: 'Accessible toilet', w: 2, d: 2.2 },
];

/** Each use's room types, the usual ones first. */
export const ROOM_TYPES: Record<BuildingUse, RoomType[]> = {
  office: [
    { name: 'Open office', w: 10, d: 8, daylight: true },
    { name: 'Meeting room', w: 5, d: 4, daylight: true },
    { name: 'Reception', w: 5, d: 4, daylight: true },
    { name: "Manager's office", w: 4, d: 3.5, daylight: true },
    { name: 'Pantry', w: 3, d: 2.5 },
    ...TOILETS,
    { name: 'Server room', w: 2.5, d: 2.5 },
    { name: 'Store', w: 2.5, d: 2 },
  ],
  school: [
    { name: 'Classroom', w: 8, d: 7, daylight: true },
    { name: 'Staff room', w: 6, d: 5, daylight: true },
    { name: 'Library', w: 10, d: 8, daylight: true },
    { name: 'Lab', w: 9, d: 7, daylight: true },
    { name: "Principal's office", w: 4, d: 4, daylight: true },
    ...TOILETS,
    { name: 'Store', w: 3, d: 3 },
  ],
  clinic: [
    { name: 'Waiting', w: 6, d: 5, daylight: true },
    { name: 'Consultation', w: 3.5, d: 3.5, daylight: true },
    { name: 'Treatment', w: 4, d: 3.5, daylight: true },
    { name: 'Pharmacy', w: 4, d: 3 },
    { name: 'Reception', w: 4, d: 3, daylight: true },
    ...TOILETS,
  ],
  shop: [
    { name: 'Sales floor', w: 8, d: 10, daylight: true },
    { name: 'Stock room', w: 4, d: 4 },
    { name: 'Office', w: 3, d: 3, daylight: true },
    { name: 'Toilet', w: 1.5, d: 2 },
  ],
  mosque: [
    { name: 'Prayer hall', w: 12, d: 10, daylight: true },
    { name: 'Wudu area', w: 5, d: 3 },
    { name: "Imam's room", w: 3.5, d: 3.5, daylight: true },
    ...TOILETS,
    { name: 'Store', w: 2.5, d: 2 },
  ],
  other: [...TOILETS, { name: 'Store', w: 2.5, d: 2 }],
};

/** Names of a project's rooms that want daylight (for the hints), or null for a house (its own rules). */
export function daylightRooms(doc: Pick<PlanDoc, 'project'>): RegExp | null {
  const p = projectOf(doc);
  if (p.type === 'house') return null;
  if (p.type === 'free') return /^$/;
  const names = ROOM_TYPES[p.use ?? 'other'].filter((r) => r.daylight).map((r) => r.name);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'s\b/, "'?s?"));
  return escaped.length ? new RegExp(`^(${escaped.join('|')})`, 'i') : /^$/;
}
