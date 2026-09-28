import { doorKindOf } from './openingKinds';
import { openingProfileMm } from './shapes';
import { impliedSlabList } from './drawings/views';
import { levelWallMm } from './levels';
import { isCurtain } from './curtain';
import { MM_PER_UNIT } from './scale';
import {
  buildModel,
  DOOR_HEAD_MM,
  levelBaseM,
  M_PER_UNIT,
  roofMesh,
  WINDOW_SILL_MM,
  type Finish,
  type Panel,
  type Slab3D,
  type Solid,
} from '../three/model';
import { thicknessOf } from '../walls';
import { levelOf, type Id, type Opening, type PlanDoc, type PlanElement, type Point, type Wall } from '../types';

/*
 * IFC (the open file format for building models that Revit, ArchiCAD, BlenderBIM and others read),
 * written as IFC4 text. The geometry is the 3D view's: each wall, slab, column, beam, stair, roof,
 * door and window is its own element, made of the same pieces, on its own storey. Rooms are spaces
 * with their names and floor areas; doors and windows fill openings cut in their walls.
 */

/** Scene metres (y up, z = plan y) to IFC's axes (z up, y = north, which is up the page). */
type V3 = [number, number, number];
const toIfc = (x: number, y: number, z: number): V3 => [x, -z, y];

/** A real number as STEP writes it: always with a decimal point. */
function real(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  if (Object.is(r, -0) || r === 0) return '0.';
  return r.toFixed(6).replace(/0+$/, '');
}

/** A string as STEP writes it: quotes doubled, anything past plain ASCII as \X2\ hex. */
export function stepString(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "'") out += "''";
    else if (ch === '\\') out += '\\\\';
    else if (code >= 32 && code < 127) out += ch;
    else if (code < 0x10000) out += `\\X2\\${code.toString(16).toUpperCase().padStart(4, '0')}\\X0\\`;
    else out += `\\X4\\${code.toString(16).toUpperCase().padStart(8, '0')}\\X0\\`;
  }
  return `'${out}'`;
}

const IFC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/**
 * An element's IFC GlobalId, the same every time it is exported (so an app that links the file can
 * follow each element across updates): 128 bits hashed from the key, in IFC's 22-character form.
 */
export function ifcGuid(key: string): string {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < key.length; i++) {
    const k = key.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  let n = 0n;
  for (const h of [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1]) n = (n << 32n) | BigInt(h >>> 0);
  let out = IFC_CHARS[Number(n >> 126n)];
  for (let i = 20; i >= 0; i--) out += IFC_CHARS[Number((n >> BigInt(i * 6)) & 63n)];
  return out;
}

/** The lines of a STEP file's data section, with repeated plain entities (points, directions) written once. */
class Step {
  lines: string[] = [];
  private seen = new Map<string, string>();
  add(entity: string, share = true): string {
    if (share) {
      const known = this.seen.get(entity);
      if (known) return known;
    }
    const id = `#${this.lines.length + 1}`;
    this.lines.push(`${id}=${entity};`);
    if (share) this.seen.set(entity, id);
    return id;
  }
  point(p: number[]): string {
    return this.add(`IFCCARTESIANPOINT((${p.map(real).join(',')}))`);
  }
  direction(d: number[]): string {
    const len = Math.hypot(...d) || 1;
    return this.add(`IFCDIRECTION((${d.map((v) => real(v / len)).join(',')}))`);
  }
  placement3d(at: V3, axis?: V3, ref?: V3): string {
    const a = axis ? this.direction(axis) : '$';
    const r = ref ? this.direction(ref) : '$';
    return this.add(`IFCAXIS2PLACEMENT3D(${this.point(at)},${a},${r})`);
  }
  /** A closed outline in 2D, the first point repeated at the end as IFC wants. */
  polyline(pts: [number, number][]): string {
    const ids = [...pts, pts[0]].map((p) => this.point(p));
    return this.add(`IFCPOLYLINE((${ids.join(',')}))`);
  }
}

const refs = (ids: string[]) => `(${ids.join(',')})`;
const opt = (s: string | undefined) => (s ? stepString(s) : '$');

/** Signed area of an outline (positive anticlockwise). */
function ringArea(pts: [number, number][]): number {
  let sum = 0;
  pts.forEach(([ax, ay], i) => {
    const [bx, by] = pts[(i + 1) % pts.length];
    sum += ax * by - bx * ay;
  });
  return sum / 2;
}

/** An outline without repeated corners (IFC's polylines mustn't double back on a point). */
function clean(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-5)
    out.pop();
  return out;
}

/** What an item becomes in IFC. */
type IfcClass =
  | 'IFCWALL'
  | 'IFCCURTAINWALL'
  | 'IFCSLAB'
  | 'IFCROOF'
  | 'IFCCOLUMN'
  | 'IFCBEAM'
  | 'IFCSTAIR'
  | 'IFCDOOR'
  | 'IFCWINDOW'
  | 'IFCBUILDINGELEMENTPROXY';

interface Item {
  key: string;
  cls: IfcClass;
  name: string;
  level: Id;
  predefined: string;
  /** Representation items (geometry) and their looks. */
  shapes: { id: string; look: string }[];
  material: string;
  /** Extra attributes after PredefinedType's place (doors and windows). */
  el?: PlanElement;
  kind: 'swept' | 'mesh';
}

export interface IfcOptions {
  wallHeightMm: number;
  /** The file's name (without .ifc), the project's and the building's name. */
  name: string;
  /** Written into the file's header. */
  app?: string;
  /** When the file was written (ISO time), for the header; now when missing. */
  time?: string;
}

const DEFAULT_MATERIAL: Record<IfcClass, string> = {
  IFCWALL: 'Masonry',
  IFCCURTAINWALL: 'Glass and aluminium',
  IFCSLAB: 'Concrete',
  IFCROOF: 'Roofing',
  IFCCOLUMN: 'Concrete',
  IFCBEAM: 'Concrete',
  IFCSTAIR: 'Concrete',
  IFCDOOR: 'Timber',
  IFCWINDOW: 'Glass',
  IFCBUILDINGELEMENTPROXY: 'Concrete',
};

const ROOF_TYPE = { hip: 'HIP_ROOF', gable: 'GABLE_ROOF', shed: 'SHED_ROOF', flat: 'FLAT_ROOF' } as const;

/** The whole building (every floor) as an IFC4 file. */
export function planToIfc(doc: PlanDoc, opts: IfcOptions): string {
  const step = new Step();
  // Items have their own random ids; the project, its storeys and the like are told apart from other
  // projects' by the plan's first item too.
  const anchor = doc.elements[0]?.id ?? '';
  const g = (key: string) => stepString(ifcGuid(`${opts.name}/${key}`));
  const gp = (key: string) => g(`${anchor}/${key}`);
  const levels = doc.levels.length ? doc.levels : [{ id: 'ground', name: 'Ground floor' }];
  const baseOf = (id: Id) => (doc.levels.length ? levelBaseM(doc, id, opts.wallHeightMm) : doc.plinthMm / 1000);
  const byId = new Map<Id, PlanElement>(doc.elements.map((el) => [el.id, el]));

  // Units, and the model's coordinate system.
  const units = [
    step.add(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`),
    step.add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`),
    step.add(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`),
    step.add(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`),
  ];
  const unitAssignment = step.add(`IFCUNITASSIGNMENT(${refs(units)})`);
  const origin = step.placement3d([0, 0, 0]);
  const north = step.add(`IFCDIRECTION((0.,1.))`);
  const context = step.add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${origin},${north})`);
  const body = step.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${context},$,.MODEL_VIEW.,$)`);
  const project = step.add(
    `IFCPROJECT(${gp('project')},$,${stepString(opts.name)},$,$,$,$,(${context}),${unitAssignment})`,
    false,
  );

  // The site, the building, and a storey for each floor.
  const sitePlace = step.add(`IFCLOCALPLACEMENT($,${origin})`);
  const site = step.add(`IFCSITE(${gp('site')},$,'Site',$,$,${sitePlace},$,$,.ELEMENT.,$,$,$,$,$)`, false);
  const buildingPlace = step.add(`IFCLOCALPLACEMENT(${sitePlace},${origin})`, false);
  const building = step.add(
    `IFCBUILDING(${gp('building')},$,${stepString(opts.name)},$,$,${buildingPlace},$,$,.ELEMENT.,$,$,$)`,
    false,
  );
  step.add(`IFCRELAGGREGATES(${gp('project-site')},$,$,$,${project},(${site}))`, false);
  step.add(`IFCRELAGGREGATES(${gp('site-building')},$,$,$,${site},(${building}))`, false);
  const storeys = new Map<Id, { id: string; place: string; elev: number }>();
  for (const level of levels) {
    const elev = baseOf(level.id);
    const place = step.add(`IFCLOCALPLACEMENT(${buildingPlace},${step.placement3d([0, 0, elev])})`, false);
    const id = step.add(
      `IFCBUILDINGSTOREY(${gp(`storey/${level.id}`)},$,${stepString(level.name)},$,$,${place},$,$,.ELEMENT.,${real(elev)})`,
      false,
    );
    storeys.set(level.id, { id, place, elev });
  }
  step.add(
    `IFCRELAGGREGATES(${gp('building-storeys')},$,$,$,${building},${refs([...storeys.values()].map((s) => s.id))})`,
    false,
  );
  const storeyOf = (level?: Id) => storeys.get(level ?? 'ground') ?? storeys.values().next().value!;

  // Looks: one surface style per colour.
  const styles = new Map<string, string>();
  const styleOf = (color: string, opacity = 1) => {
    const key = `${color}/${opacity}`;
    let id = styles.get(key);
    if (!id) {
      const hex = color.length === 4 ? color.replace(/[0-9a-f]/gi, (c) => c + c) : color;
      const [r, gg, b] = [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) || 0) / 255);
      const rgb = step.add(`IFCCOLOURRGB($,${real(r)},${real(gg)},${real(b)})`);
      const rendering = step.add(`IFCSURFACESTYLERENDERING(${rgb},${real(1 - opacity)},$,$,$,$,$,$,.NOTDEFINED.)`);
      id = step.add(`IFCSURFACESTYLE(${stepString(color)},.BOTH.,(${rendering}))`);
      styles.set(key, id);
    }
    return id;
  };

  // Geometry, in each storey's own heights.
  /** A box: its rectangle pushed up from its base. */
  const box = (s: Solid, elev: number): string | null => {
    if (s.w < 1e-4 || s.d < 1e-4 || s.h < 1e-4) return null;
    const [cos, sin] = [Math.cos(s.rotY), Math.sin(s.rotY)];
    const profile = step.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${real(s.w)},${real(s.d)})`);
    // The box's own x axis (x cos, z −sin in the scene) is (cos, sin) in IFC.
    const at = step.placement3d(toIfc(s.x, s.y0 - elev, s.z), [0, 0, 1], [cos, sin, 0]);
    return step.add(`IFCEXTRUDEDAREASOLID(${profile},${at},${step.direction([0, 0, 1])},${real(s.h)})`);
  };
  const profileOf = (outer: [number, number][], holes: [number, number][][] = []): string | null => {
    const o = clean(outer);
    if (o.length < 3 || Math.abs(ringArea(o)) < 1e-8) return null;
    const inner = holes.map(clean).filter((h) => h.length >= 3 && Math.abs(ringArea(h)) > 1e-8);
    return inner.length
      ? step.add(
          `IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,${step.polyline(o)},${refs(inner.map((h) => step.polyline(h)))})`,
        )
      : step.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${step.polyline(o)})`);
  };
  /** An upright outline pushed through its depth, centred on its line. */
  const panel = (p: Panel, elev: number): string | null => {
    const profile = profileOf(p.outline, p.holes);
    if (!profile || p.depth < 1e-5) return null;
    const [cos, sin] = [Math.cos(p.rotY), Math.sin(p.rotY)];
    // Its own z axis (the depth) is (sin, 0, cos) in the scene: (sin, −cos) in IFC.
    const axis: V3 = [sin, -cos, 0];
    const [x, y, z] = toIfc(p.x, p.y0 - elev, p.z);
    const at = step.placement3d([x - (axis[0] * p.depth) / 2, y - (axis[1] * p.depth) / 2, z], axis, [cos, sin, 0]);
    return step.add(`IFCEXTRUDEDAREASOLID(${profile},${at},${step.direction([0, 0, 1])},${real(p.depth)})`);
  };
  /** A flat outline (scene x, z) pushed up from its base. */
  const slab = (points: [number, number][], holes: [number, number][][] | undefined, y0: number, h: number) => {
    const flip = (pts: [number, number][]) => pts.map(([x, z]): [number, number] => [x, -z]);
    const profile = profileOf(flip(points), (holes ?? []).map(flip));
    if (!profile || h < 1e-5) return null;
    return step.add(
      `IFCEXTRUDEDAREASOLID(${profile},${step.placement3d([0, 0, y0])},${step.direction([0, 0, 1])},${real(h)})`,
    );
  };

  // Every part of the 3D model, gathered by the plan item it came from.
  const model = buildModel(doc, { wallHeightMm: opts.wallHeightMm, showFurniture: false, closedDoors: true });
  const items = new Map<string, Item>();
  const finishes = new Map<string, Finish>();
  const itemFor = (
    id: Id | undefined,
    level: Id | undefined,
    part: 'solid' | 'panel' | 'slab' | 'roof',
  ): Item | null => {
    const el = id ? byId.get(id) : undefined;
    if (!el) return null;
    let host: PlanElement = el;
    let cls: IfcClass;
    let name: string;
    let predefined = '.NOTDEFINED.';
    let key = el.id;
    switch (el.type) {
      case 'wall':
        cls = isCurtain(el) ? 'IFCCURTAINWALL' : 'IFCWALL';
        name = wallName(el);
        predefined = cls === 'IFCWALL' ? (el.kind === 'parapet' ? '.PARAPET.' : '.STANDARD.') : '.NOTDEFINED.';
        break;
      case 'door':
      case 'window':
        if (el.flat) {
          // A projection or a niche is part of its wall.
          const wall = byId.get(el.wallId);
          if (!wall || wall.type !== 'wall') return null;
          host = wall;
          key = wall.id;
          cls = isCurtain(wall) ? 'IFCCURTAINWALL' : 'IFCWALL';
          name = wallName(wall);
          predefined = cls === 'IFCWALL' ? (wall.kind === 'parapet' ? '.PARAPET.' : '.STANDARD.') : '.NOTDEFINED.';
          break;
        }
        cls = el.type === 'door' ? 'IFCDOOR' : 'IFCWINDOW';
        name = el.type === 'door' ? (el.gate ? 'Gate' : 'Door') : 'Window';
        predefined = el.type === 'door' ? (el.gate ? '.GATE.' : '.DOOR.') : '.WINDOW.';
        break;
      case 'column':
        [cls, name, predefined] = ['IFCCOLUMN', 'Column', '.COLUMN.'];
        break;
      case 'beam':
        [cls, name, predefined] = ['IFCBEAM', 'Beam', '.BEAM.'];
        break;
      case 'stair':
        [cls, name] = ['IFCSTAIR', 'Stair'];
        break;
      case 'slab':
        [cls, name, predefined] = ['IFCSLAB', 'Slab', '.FLOOR.'];
        break;
      case 'block':
        [cls, name] = ['IFCBUILDINGELEMENTPROXY', 'Block'];
        break;
      case 'roof':
        if (part === 'panel') {
          // The gable ends under a roof are walls.
          [cls, name, predefined, key] = ['IFCWALL', 'Gable wall', '.STANDARD.', `${el.id}/gables`];
        } else [cls, name, predefined] = ['IFCROOF', 'Roof', `.${ROOF_TYPE[el.shape]}.`];
        break;
      default:
        return null;
    }
    const lvl = level ?? levelOf(host);
    const k = `${key}@${lvl}`;
    let item = items.get(k);
    if (!item) {
      item = {
        key: k,
        cls,
        name,
        level: lvl,
        predefined,
        shapes: [],
        material: '',
        el: host,
        kind: part === 'roof' ? 'mesh' : 'swept',
      };
      items.set(k, item);
    }
    return item;
  };
  const addShape = (
    item: Item | null,
    shape: string | null,
    look: { color: string; opacity?: number; finish?: Finish },
  ) => {
    if (!item || !shape) return;
    item.shapes.push({ id: shape, look: styleOf(look.color, look.opacity ?? 1) });
    if (look.finish?.name && !finishes.has(item.key)) finishes.set(item.key, look.finish);
  };
  for (const s of model.solids) {
    if (s.role === 'furniture') continue;
    const item = itemFor(s.id, s.level, 'solid');
    if (item) addShape(item, box(s, storeyOf(item.level).elev), s);
  }
  for (const p of model.panels) {
    if (p.role === 'shape') continue;
    const item = itemFor(p.id, p.level, 'panel');
    if (item) addShape(item, panel(p, storeyOf(item.level).elev), p);
  }
  for (const b of [...model.slabs, ...model.blocks] as Slab3D[]) {
    if (b.role === 'shape') continue;
    const item = itemFor(b.id, b.level, 'slab');
    if (item) addShape(item, slab(b.points, b.holes, b.y0 - storeyOf(item.level).elev, b.h), b);
  }
  for (const r of model.roofs ?? []) {
    const item = itemFor(r.id, r.level, 'roof');
    if (!item) continue;
    const { positions, indices } = roofMesh(r);
    if (!indices.length) continue;
    const elev = storeyOf(item.level).elev;
    const pts: string[] = [];
    for (let i = 0; i < positions.length; i += 3)
      pts.push(
        `(${toIfc(positions[i], positions[i + 1] - elev, positions[i + 2])
          .map(real)
          .join(',')})`,
      );
    const tris: string[] = [];
    for (let i = 0; i < indices.length; i += 3)
      tris.push(`(${indices[i] + 1},${indices[i + 1] + 1},${indices[i + 2] + 1})`);
    const list = step.add(`IFCCARTESIANPOINTLIST3D((${pts.join(',')}))`, false);
    addShape(item, step.add(`IFCTRIANGULATEDFACESET(${list},$,$,(${tris.join(',')}),$)`, false), r);
  }

  // Floor and roof slabs the plan leaves to be understood.
  for (const [i, s] of impliedSlabList(doc, opts.wallHeightMm).entries()) {
    const elev = storeyOf(s.level).elev;
    const xz = (pts: Point[]) => pts.map((p): [number, number] => [p.x * M_PER_UNIT, p.y * M_PER_UNIT]);
    const shape = slab(xz(s.outline), s.holes.map(xz), s.y - elev, s.h);
    if (!shape) continue;
    const item: Item = {
      key: `slab/${s.level}/${s.kind}/${i}`,
      cls: 'IFCSLAB',
      name: s.kind === 'floor' ? 'Floor slab' : 'Roof slab',
      level: s.level,
      predefined: s.kind === 'floor' ? '.FLOOR.' : '.ROOF.',
      shapes: [],
      material: '',
      kind: 'swept',
    };
    items.set(item.key, item);
    addShape(item, shape, { color: '#c9c6bf' });
  }

  // The elements, each on its storey with its shape and look.
  const contained = new Map<Id, string[]>();
  const byMaterial = new Map<string, string[]>();
  const elementIds = new Map<Id, string>();
  for (const item of items.values()) {
    if (!item.shapes.length) continue;
    const storey = storeyOf(item.level);
    for (const s of item.shapes) step.add(`IFCSTYLEDITEM(${s.id},(${s.look}),$)`, false);
    const rep = step.add(
      `IFCSHAPEREPRESENTATION(${body},'Body','${item.kind === 'mesh' ? 'Tessellation' : 'SweptSolid'}',${refs(item.shapes.map((s) => s.id))})`,
      false,
    );
    const shape = step.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`, false);
    const place = step.add(`IFCLOCALPLACEMENT(${storey.place},${origin})`, false);
    const head = `${(item.el ? g : gp)(item.key)},$,${stepString(item.name)},$,$,${place},${shape},${opt(item.el?.id)}`;
    let id: string;
    const el = item.el;
    if ((item.cls === 'IFCDOOR' || item.cls === 'IFCWINDOW') && el && (el.type === 'door' || el.type === 'window')) {
      const { widthM, heightM } = openingSize(doc, el, opts.wallHeightMm);
      const tail =
        item.cls === 'IFCDOOR'
          ? `${item.predefined},${doorOperation(el)},$`
          : `${item.predefined},${el.windowKind === 'sliding' || el.windowKind === 'casement2' ? '.DOUBLE_PANEL_VERTICAL.' : '.SINGLE_PANEL.'},$`;
      id = step.add(`${item.cls}(${head},${real(heightM)},${real(widthM)},${tail})`, false);
      elementIds.set(el.id, id);
    } else id = step.add(`${item.cls}(${head},${item.predefined})`, false);
    if (el && item.cls !== 'IFCDOOR' && item.cls !== 'IFCWINDOW') elementIds.set(el.id, elementIds.get(el.id) ?? id);
    contained.set(item.level, [...(contained.get(item.level) ?? []), id]);
    const material = finishes.get(item.key)?.name ?? DEFAULT_MATERIAL[item.cls];
    byMaterial.set(material, [...(byMaterial.get(material) ?? []), id]);
  }

  // Openings cut in the walls, filled by their doors and windows.
  for (const el of doc.elements) {
    if ((el.type !== 'door' && el.type !== 'window') || el.flat) continue;
    const wallId = elementIds.get(el.wallId);
    const fill = elementIds.get(el.id);
    const wall = byId.get(el.wallId);
    if (!wallId || !wall || wall.type !== 'wall') continue;
    const level = levelOf(el);
    const storey = storeyOf(level);
    const cut = openingCut(doc, el, wall, opts.wallHeightMm);
    const y0 = baseOf(level) + (wall.elevMm ?? 0) / 1000 + cut.sillM - storey.elev;
    const shape = panel(
      {
        outline: cut.outline,
        x: el.x * M_PER_UNIT,
        z: el.y * M_PER_UNIT,
        y0: y0 + storey.elev,
        rotY: (-el.angle * Math.PI) / 180,
        depth: thicknessOf(wall) * M_PER_UNIT + 0.1,
        color: '#ffffff',
        role: 'wall',
      },
      storey.elev,
    );
    if (!shape) continue;
    const rep = step.add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${shape}))`, false);
    const pds = step.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`, false);
    const place = step.add(`IFCLOCALPLACEMENT(${storey.place},${origin})`, false);
    const opening = step.add(
      `IFCOPENINGELEMENT(${g(`opening/${el.id}`)},$,'Opening',$,$,${place},${pds},$,.OPENING.)`,
      false,
    );
    step.add(`IFCRELVOIDSELEMENT(${g(`voids/${el.id}`)},$,$,$,${wallId},${opening})`, false);
    if (fill) step.add(`IFCRELFILLSELEMENT(${g(`fills/${el.id}`)},$,$,$,${opening},${fill})`, false);
  }

  // Rooms, as spaces from floor to ceiling with their names and floor areas.
  const spaces = new Map<Id, string[]>();
  for (const room of doc.rooms) {
    if (room.points.length < 3) continue;
    const level = levelOf(room);
    const storey = storeyOf(level);
    const pts = room.points.map((p): [number, number] => [p.x * M_PER_UNIT, p.y * M_PER_UNIT]);
    const heightM = levelWallMm(doc, level, opts.wallHeightMm) / 1000;
    const shape = slab(pts, [], baseOf(level) - storey.elev, heightM);
    if (!shape) continue;
    const rep = step.add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${shape}))`, false);
    const pds = step.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`, false);
    const place = step.add(`IFCLOCALPLACEMENT(${storey.place},${origin})`, false);
    const name = stepString(room.name || 'Room');
    const space = step.add(
      `IFCSPACE(${g(`space/${room.id}`)},$,${name},$,$,${place},${pds},${name},.ELEMENT.,.INTERNAL.,$)`,
      false,
    );
    spaces.set(level, [...(spaces.get(level) ?? []), space]);
    const areaM2 = Math.abs(ringArea(pts));
    const area = step.add(`IFCQUANTITYAREA('NetFloorArea',$,$,${real(areaM2)},$)`, false);
    const height = step.add(`IFCQUANTITYLENGTH('Height',$,$,${real(heightM)},$)`, false);
    const qto = step.add(
      `IFCELEMENTQUANTITY(${g(`qto/${room.id}`)},$,'Qto_SpaceBaseQuantities',$,$,(${area},${height}))`,
      false,
    );
    step.add(`IFCRELDEFINESBYPROPERTIES(${g(`qto-rel/${room.id}`)},$,$,$,(${space}),${qto})`, false);
  }

  for (const [level, ids] of spaces) {
    step.add(`IFCRELAGGREGATES(${gp(`spaces/${level}`)},$,$,$,${storeyOf(level).id},${refs(ids)})`, false);
  }
  for (const [level, ids] of contained) {
    step.add(
      `IFCRELCONTAINEDINSPATIALSTRUCTURE(${gp(`contains/${level}`)},$,$,$,${refs(ids)},${storeyOf(level).id})`,
      false,
    );
  }
  for (const [name, ids] of byMaterial) {
    const material = step.add(`IFCMATERIAL(${stepString(name)},$,$)`, false);
    step.add(`IFCRELASSOCIATESMATERIAL(${gp(`material/${name}`)},$,$,$,${refs(ids)},${material})`, false);
  }

  const time = (opts.time ?? new Date().toISOString()).slice(0, 19);
  const app = stepString(opts.app ?? 'Mimar');
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView]'),'2;1');",
    `FILE_NAME(${stepString(`${opts.name}.ifc`)},'${time}',(''),(''),${app},${app},'');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...step.lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n');
}

function wallName(w: Wall): string {
  switch (w.kind) {
    case 'boundary':
      return 'Boundary wall';
    case 'parapet':
      return 'Parapet';
    case 'retaining':
      return 'Retaining wall';
    case 'curtain':
      return 'Curtain wall';
  }
  return 'Wall';
}

function doorOperation(d: Opening): string {
  switch (doorKindOf(d)) {
    case 'double':
      return '.DOUBLE_DOOR_SINGLE_SWING.';
    case 'sliding':
      return '.DOUBLE_DOOR_SLIDING.';
    case 'folding':
      return '.FOLDING_TO_LEFT.';
    case 'shutter':
      return '.ROLLINGUP.';
    case 'opening':
      return '.NOTDEFINED.';
  }
  return d.gate ? '.DOUBLE_DOOR_SINGLE_SWING.' : d.flipHinge ? '.SINGLE_SWING_RIGHT.' : '.SINGLE_SWING_LEFT.';
}

/** Its wall's height (m), from the floor. */
function wallTopMm(doc: PlanDoc, wall: Wall, wallHeightMm: number): number {
  return wall.heightMm ?? levelWallMm(doc, levelOf(wall), wallHeightMm);
}

/** An opening's width and height (m). */
function openingSize(doc: PlanDoc, o: Opening, wallHeightMm: number): { widthM: number; heightM: number } {
  const wall = doc.elements.find((el): el is Wall => el.type === 'wall' && el.id === o.wallId);
  const top = wall ? wallTopMm(doc, wall, wallHeightMm) : wallHeightMm;
  const widthM = (o.width * MM_PER_UNIT) / 1000;
  if (o.type === 'door') return { widthM, heightM: Math.min(top, o.gate ? top : DOOR_HEAD_MM) / 1000 };
  const pts = openingProfileMm(o);
  const [lo, hi] = [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))];
  return { widthM, heightM: (hi - lo) / 1000 };
}

/** The hole an opening cuts: its outline ([along, up] in metres from its centre and sill) and its sill (m). */
function openingCut(
  doc: PlanDoc,
  o: Opening,
  wall: Wall,
  wallHeightMm: number,
): { outline: [number, number][]; sillM: number } {
  const top = wallTopMm(doc, wall, wallHeightMm);
  const half = (o.width * MM_PER_UNIT) / 2000;
  if (o.type === 'door') {
    const head = (o.gate ? top : Math.min(top, DOOR_HEAD_MM)) / 1000;
    return {
      outline: [
        [-half, 0],
        [half, 0],
        [half, head],
        [-half, head],
      ],
      sillM: 0,
    };
  }
  const sillMm = o.sillMm ?? WINDOW_SILL_MM;
  return {
    outline: openingProfileMm(o).map((p): [number, number] => [p.x / 1000, Math.min(p.y, top - sillMm) / 1000]),
    sillM: sillMm / 1000,
  };
}
