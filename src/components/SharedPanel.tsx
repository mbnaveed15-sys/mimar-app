import { MM_PER_UNIT } from '../lib/scale';
import { levelWallMm } from '../lib/levels';
import { kindHeightMm, usePlanner } from '../store/plannerStore';
import { furnitureLibraryHeightMm } from '../three/model';
import { levelOf, type Beam, type Column, type Furniture, type PlanElement, type Slab, type Wall } from '../types';
import { thicknessOf } from '../walls';
import { LengthField } from './LengthField';

/** The value (mm) they all share, rounded to a tenth of a millimetre, or null when they differ. */
function shared<T>(list: T[], get: (it: T) => number): number | null {
  const first = Math.round(get(list[0]) * 10) / 10;
  return list.every((it) => Math.round(get(it) * 10) / 10 === first) ? first : null;
}

const u = (mm: number) => mm / MM_PER_UNIT;

/**
 * Several items of one kind selected (walls, furniture, columns, beams, slabs): the settings they
 * share. A box whose values differ says "Mixed"; what is typed in a box goes to them all, as one undo step.
 * Doors and windows have their own panel.
 */
export function SharedPanel() {
  const doc = usePlanner((s) => s.doc);
  const selectedIds = usePlanner((s) => s.selectedIds);
  const units = usePlanner((s) => s.units);
  const wallHeightMm = usePlanner((s) => s.wallHeightMm);
  const editElements = usePlanner((s) => s.editElements);
  const picked = selectedIds
    .map((id) => doc.elements.find((el) => el.id === id))
    .filter((el): el is PlanElement => !!el && !el.locked);
  const of = <T extends PlanElement>(type: T['type']) => picked.filter((el): el is T => el.type === type);
  const walls = of<Wall>('wall').filter((w) => !w.plotId);
  const furniture = of<Furniture>('furniture');
  const columns = of<Column>('column');
  const beams = of<Beam>('beam');
  const slabs = of<Slab>('slab');
  const ids = (list: PlanElement[]) => list.map((el) => el.id);
  /** Set one field on every item of a list. */
  const edit = <T extends PlanElement>(list: T[], patch: (el: T) => Partial<T>) =>
    editElements(ids(list), (el) => ({ ...el, ...patch(el as T) }) as PlanElement);
  const wallHeight = (w: Wall) => w.heightMm ?? kindHeightMm(w.kind) ?? levelWallMm(doc, levelOf(w), wallHeightMm);
  const columnHeight = (c: Column) => c.heightMm ?? levelWallMm(doc, levelOf(c), wallHeightMm);
  const squareColumns = columns.filter((c) => c.shape !== 'round');

  const sections = [
    walls.length > 1 && (
      <Section key="walls" title={`${walls.length} walls`}>
        <LengthField
          id="walls-thickness"
          label="Thickness"
          mm={shared(walls, (w) => thicknessOf(w) * MM_PER_UNIT)}
          units={units}
          min={25}
          onCommit={(mm) => edit(walls, () => ({ thickness: u(Math.min(mm, 1000)) }))}
        />
        <LengthField
          id="walls-height"
          label="Height"
          mm={shared(walls, wallHeight)}
          units={units}
          min={100}
          onCommit={(mm) => edit(walls, () => ({ heightMm: Math.min(mm, 10000) }))}
        />
      </Section>
    ),
    furniture.length > 1 && (
      <Section key="furniture" title={`${furniture.length} furniture items`}>
        <div className="grid grid-cols-2 gap-2">
          <LengthField
            id="furniture-many-width"
            label="Width"
            mm={shared(furniture, (f) => f.w * MM_PER_UNIT)}
            units={units}
            min={50}
            onCommit={(mm) => edit(furniture, () => ({ w: u(Math.min(mm, 20000)) }))}
          />
          <LengthField
            id="furniture-many-depth"
            label="Depth"
            mm={shared(furniture, (f) => f.h * MM_PER_UNIT)}
            units={units}
            min={50}
            onCommit={(mm) => edit(furniture, () => ({ h: u(Math.min(mm, 20000)) }))}
          />
        </div>
        <LengthField
          id="furniture-many-height"
          label="Height"
          mm={shared(furniture, (f) => f.heightMm ?? furnitureLibraryHeightMm(f))}
          units={units}
          min={10}
          onCommit={(mm) => edit(furniture, () => ({ heightMm: Math.min(mm, 20000) }))}
        />
      </Section>
    ),
    columns.length > 1 && (
      <Section key="columns" title={`${columns.length} columns`}>
        <div className="grid grid-cols-2 gap-2">
          <LengthField
            id="columns-width"
            label={squareColumns.length ? 'Width' : 'Diameter'}
            mm={shared(columns, (c) => c.w * MM_PER_UNIT)}
            units={units}
            min={50}
            onCommit={(mm) => edit(columns, (c) => ({ w: u(mm), ...(c.shape === 'round' && { h: u(mm) }) }))}
          />
          {squareColumns.length > 0 && (
            <LengthField
              id="columns-depth"
              label="Depth"
              mm={shared(squareColumns, (c) => c.h * MM_PER_UNIT)}
              units={units}
              min={50}
              onCommit={(mm) => edit(squareColumns, () => ({ h: u(mm) }))}
            />
          )}
        </div>
        <LengthField
          id="columns-height"
          label="Height"
          mm={shared(columns, columnHeight)}
          units={units}
          min={100}
          onCommit={(mm) => edit(columns, () => ({ heightMm: Math.min(mm, 30000) }))}
        />
      </Section>
    ),
    beams.length > 1 && (
      <Section key="beams" title={`${beams.length} beams`}>
        <div className="grid grid-cols-2 gap-2">
          <LengthField
            id="beams-width"
            label="Width"
            mm={shared(beams, (b) => b.width * MM_PER_UNIT)}
            units={units}
            min={50}
            onCommit={(mm) => edit(beams, () => ({ width: u(mm) }))}
          />
          <LengthField
            id="beams-depth"
            label="Depth"
            mm={shared(beams, (b) => b.depth * MM_PER_UNIT)}
            units={units}
            min={50}
            onCommit={(mm) => edit(beams, () => ({ depth: u(mm) }))}
          />
        </div>
      </Section>
    ),
    slabs.length > 1 && (
      <Section key="slabs" title={`${slabs.length} slabs`}>
        <LengthField
          id="slabs-thickness"
          label="Thickness"
          mm={shared(slabs, (sl) => sl.thickness * MM_PER_UNIT)}
          units={units}
          min={25}
          onCommit={(mm) => edit(slabs, () => ({ thickness: u(mm) }))}
        />
      </Section>
    ),
  ].filter(Boolean);
  if (!sections.length) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2" data-testid="shared-panel">
      {sections}
      <div className="text-muted">A box that says Mixed has different values; what you type goes to them all.</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-medium">{title}</div>
      {children}
    </div>
  );
}
