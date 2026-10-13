import { useCallback, useMemo, useState } from 'react';
import { exportDrawingsDxf, exportSheetsPdf } from '../lib/exportActions';
import { newId } from '../lib/ids';
import { levelContent, drawingSource } from '../lib/drawings/source';
import {
  layoutSheet,
  MAX_SHEET_SCALE,
  MIN_SHEET_SCALE,
  planArea,
  sheetScaleOf,
  sheetsOf,
  sidePrims,
  SHEET_SCALES,
  type Prim,
} from '../lib/drawings/sheet';
import {
  drawingFromKey,
  drawingKey,
  drawingTitle,
  ELEVATION_NAMES,
  ELEVATION_SIDES,
  sectionLines,
  sectionTitle,
} from '../lib/drawings/views';
import { VIEW3D_NAMES, VIEW3D_STYLES } from '../lib/drawings/refs';
import { withoutHidden } from '../lib/layers';
import { plannerStore, usePlanner } from '../store/plannerStore';
import type { DrawingRef, PaperSize, Sheet, SheetScale } from '../types';
import { Icon } from './Icon';
import { PrimsSvg } from './SheetSvg';

/** A drawing shown on its own in the view: at 1:100, with room round it. */
const VIEW_SCALE = 100;

/**
 * The Drawings view: sections, elevations and the printed sheets, drawn as they print. The list on
 * the left picks one; a sheet's contents, paper and scales are set there too.
 */
export function DrawingsView() {
  const doc = usePlanner((s) => s.doc);
  const showFurniture = usePlanner((s) => s.showFurniture);
  const wallHeightMm = usePlanner((s) => s.wallHeightMm);
  const units = usePlanner((s) => s.units);
  const fileName = usePlanner((s) => s.fileName);
  const current = usePlanner((s) => s.drawing);
  const showDrawing = usePlanner((s) => s.showDrawing);
  const setSheets = usePlanner((s) => s.setSheets);
  const setDrawingStyle = usePlanner((s) => s.setDrawingStyle);
  const [zoom, setZoom] = useState(1);

  const shown = useMemo(() => withoutHidden(doc, { layers: doc.layers, showFurniture }), [doc, showFurniture]);
  // Everything is worked out again when the plan changes; each drawing only when it is asked for.
  const src = useMemo(
    () => drawingSource(plannerStore.getState(), shown),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, wallHeightMm, units, fileName],
  );
  const sheets = useMemo(() => sheetsOf(src), [src]);
  const sections = sectionLines(doc)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));

  const sheetId = current?.startsWith('sheet:') ? current.slice(6) : null;
  const sheetIndex = sheetId ? sheets.findIndex((s) => s.id === sheetId) : -1;
  const sheet = sheetIndex >= 0 ? sheets[sheetIndex] : null;
  const ref = current && !sheetId ? drawingFromKey(current) : null;

  const page = useMemo((): { w: number; h: number; prims: Prim[]; overflow?: boolean } | null => {
    if (sheet) {
      const l = layoutSheet(src, sheet, sheetIndex, sheets.length);
      return { w: l.paper.w, h: l.paper.h, prims: l.prims, overflow: l.overflow };
    }
    if (!ref || ref.kind === 'plan') return null;
    const d = src.side(ref.kind === 'view3d' ? { kind: 'view3d', style: 'iso' } : ref);
    if (!d?.bounds) return null;
    if (ref.kind === 'view3d' && ref.style === 'picture') {
      // The picture in the isometric's box, at 1:100.
      const k = 1000 / VIEW_SCALE;
      const w = (d.bounds.maxU - d.bounds.minU + 0.6) * k;
      const h = (d.bounds.maxV - d.bounds.minV + 0.6) * k;
      return { w: w + 20, h: h + 20, prims: [{ t: 'picture', x: 10, y: 10, w, h }] };
    }
    const prims = sidePrims(d, VIEW_SCALE, 10, 10, src.doc.drawing);
    const xs = prims.flatMap((p) => (p.t === 'line' ? [p.a[0], p.b[0]] : p.t === 'text' ? [p.x + 40] : []));
    const ys = prims.flatMap((p) => (p.t === 'line' ? [p.a[1], p.b[1]] : p.t === 'text' ? [p.y] : []));
    return { w: Math.max(...xs) + 10, h: Math.max(...ys) + 10, prims };
  }, [src, sheet, sheetIndex, sheets.length, ref]);

  /** Change the sheets: the suggested set becomes the plan's own the first time one is changed. */
  const change = (next: Sheet[]) => setSheets(next);
  const patchSheet = (patch: Partial<Sheet>) =>
    sheet && change(sheets.map((s) => (s.id === sheet.id ? { ...s, ...patch } : s)));
  const addSheet = () => {
    const fresh: Sheet = { id: newId(), name: `Sheet ${sheets.length + 1}`, paper: 'A3', items: [] };
    change([...sheets, fresh]);
    showDrawing(`sheet:${fresh.id}`);
  };
  const choices: DrawingRef[] = [
    ...doc.levels.filter((l) => planArea(shown, l.id)).map((l): DrawingRef => ({ kind: 'plan', levelId: l.id })),
    ...sections.map((s): DrawingRef => ({ kind: 'section', id: s.id })),
    ...ELEVATION_SIDES.map((side): DrawingRef => ({ kind: 'elevation', side })),
    ...VIEW3D_STYLES.map((style): DrawingRef => ({ kind: 'view3d', style })),
  ];
  const picture = useCallback(
    (w: number, h: number) =>
      import('../three/picture').then((m) => m.renderPicture(shown, { wallHeightMm, showFurniture }, w, h)),
    [shown, wallHeightMm, showFurniture],
  );

  const item = (key: string, label: string, testId?: string) => (
    <button
      key={key}
      data-testid={testId}
      aria-pressed={current === key}
      onClick={() => showDrawing(key)}
      className={`w-full truncate rounded-sm px-2 py-1 text-left ${current === key ? 'bg-accent-soft font-medium text-accent-ink' : 'hover:bg-sunken'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 phone:flex-col" data-testid="drawings-view">
      <nav
        aria-label="Drawings"
        className="flex w-64 flex-none flex-col gap-3 overflow-y-auto border-r border-line bg-surface p-2 text-xs phone:max-h-[45%] phone:w-full phone:border-r-0 phone:border-b"
      >
        <div>
          <div className="m-heading px-2">Sections</div>
          {sections.length ? (
            sections.map((s) => item(`section:${s.id}`, sectionTitle(s), `drawing-section-${s.label}`))
          ) : (
            <p className="px-2 py-1 text-muted">
              None yet. Pick the Section tool (Shift+E) and click across the plan where to cut it.
            </p>
          )}
        </div>
        <div>
          <div className="m-heading px-2">Elevations</div>
          {ELEVATION_SIDES.map((side) => item(`elevation:${side}`, ELEVATION_NAMES[side], `drawing-${side}`))}
        </div>
        <div>
          <div className="m-heading px-2">3D views</div>
          {VIEW3D_STYLES.map((style) => item(`view3d:${style}`, VIEW3D_NAMES[style], `drawing-view3d-${style}`))}
        </div>
        <div>
          <div className="m-heading px-2">Sheets</div>
          {sheets.map((s, i) => item(`sheet:${s.id}`, `${i + 1}. ${s.name} (${s.paper})`, `sheet-${i + 1}`))}
          <div className="mt-1 flex flex-wrap gap-1 px-2">
            <button className="m-btn" onClick={addSheet}>
              Add sheet
            </button>
            {doc.sheets && (
              <button
                className="m-btn"
                title="Go back to a sheet per floor plan, one for sections and one for elevations"
                onClick={() => setSheets(undefined)}
              >
                Use suggested sheets
              </button>
            )}
          </div>
        </div>

        {sheet && (
          <SheetEditor
            sheet={sheet}
            choices={choices}
            title={(r) => drawingTitle(shown, r) ?? ''}
            onChange={patchSheet}
            onDelete={() => {
              change(sheets.filter((s) => s.id !== sheet.id));
              showDrawing(drawingKey({ kind: 'elevation', side: 'front' }));
            }}
          />
        )}

        <div className="mt-auto flex flex-col gap-1.5 border-t border-line pt-2">
          <label className="flex items-center gap-2 px-1">
            <input
              type="checkbox"
              data-testid="side-dims"
              checked={doc.drawing?.sideDims !== false}
              onChange={(e) => setDrawingStyle({ sideDims: e.target.checked })}
            />
            Dimensions on sections and elevations
          </label>
          <div className="flex items-center gap-2 px-1">
            <span className="text-muted">Cut parts</span>
            <div role="radiogroup" aria-label="Cut parts" className="m-seg">
              <button
                role="radio"
                aria-checked={!doc.drawing?.solidCuts}
                onClick={() => setDrawingStyle({ solidCuts: false })}
              >
                Hatched
              </button>
              <button
                role="radio"
                aria-checked={!!doc.drawing?.solidCuts}
                onClick={() => setDrawingStyle({ solidCuts: true })}
              >
                Solid black
              </button>
            </div>
          </div>
          <button className="m-btn m-btn-primary justify-center" onClick={() => exportSheetsPdf()}>
            <Icon name="sheet" size={15} />
            Export sheets (PDF)
          </button>
          <button className="m-btn justify-center" onClick={() => exportDrawingsDxf()}>
            Export drawings (DXF)
          </button>
        </div>
      </nav>

      <div className="relative min-w-0 flex-1">
        <div className="h-full overflow-auto bg-canvas" data-testid="drawing-page">
          {page ? (
            <>
              {page.overflow && (
                <div
                  role="alert"
                  className="sticky top-2 z-10 mx-auto w-fit rounded-md border border-accent bg-raised px-3 py-1.5 text-xs shadow-popover"
                >
                  The drawings don’t all fit on this sheet: pick a smaller scale (1:200) or bigger paper.
                </div>
              )}
              <div className="p-4" style={{ width: `${zoom * 100}%`, height: zoom === 1 ? '100%' : undefined }}>
                <svg
                  viewBox={`0 0 ${page.w} ${page.h}`}
                  className="h-full w-full"
                  style={zoom === 1 ? undefined : { height: 'auto' }}
                  data-testid="drawing-svg"
                >
                  <rect width={page.w} height={page.h} fill="#fff" />
                  <PrimsSvg
                    picture={picture}
                    prims={page.prims}
                    plan={(levelId) => levelContent(plannerStore.getState(), shown, levelId)}
                  />
                </svg>
              </div>
            </>
          ) : (
            <p className="p-6 text-sm text-muted">
              {ref
                ? 'Nothing to draw here yet: draw some walls first.'
                : 'Pick a section, an elevation or a sheet on the left.'}
            </p>
          )}
        </div>
        <div className="absolute right-4 bottom-4 flex gap-1" role="group" aria-label="Zoom">
          <button className="m-btn" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
            −
          </button>
          <button className="m-btn" aria-label="Fit" onClick={() => setZoom(1)}>
            Fit
          </button>
          <button className="m-btn" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(8, z * 1.5))}>
            +
          </button>
        </div>
      </div>
    </div>
  );
}

/** A sheet's name, paper and drawings (each at its own scale). */
function SheetEditor({
  sheet,
  choices,
  title,
  onChange,
  onDelete,
}: {
  sheet: Sheet;
  choices: DrawingRef[];
  title: (ref: DrawingRef) => string;
  onChange: (patch: Partial<Sheet>) => void;
  onDelete: () => void;
}) {
  const on = new Set(sheet.items.map((i) => drawingKey(i.drawing)));
  const free = choices.filter((c) => !on.has(drawingKey(c)));
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-raised p-2" data-testid="sheet-editor">
      <label className="flex flex-col gap-0.5">
        <span className="text-muted">Sheet name</span>
        <input
          key={sheet.id + sheet.name}
          defaultValue={sheet.name}
          aria-label="Sheet name"
          onBlur={(e) => {
            const name = e.currentTarget.value.trim();
            if (name && name !== sheet.name) onChange({ name });
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="rounded-sm border p-1"
        />
      </label>
      <div role="radiogroup" aria-label="Paper" className="m-seg self-start">
        {(['A4', 'A3', 'A1'] as PaperSize[]).map((p) => (
          <button key={p} role="radio" aria-checked={sheet.paper === p} onClick={() => onChange({ paper: p })}>
            {p}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {sheet.items.map((it, i) => (
          <div key={drawingKey(it.drawing)} className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate">{title(it.drawing) || 'Deleted drawing'}</span>
            <ScalePicker
              label={`Scale of ${title(it.drawing)}`}
              scale={it.scale}
              onChange={(scale) => onChange({ items: sheet.items.map((x, j) => (j === i ? { ...x, scale } : x)) })}
            />
            <button
              className="grid h-6 w-6 place-items-center rounded-sm hover:bg-sunken"
              aria-label={`Take ${title(it.drawing)} off the sheet`}
              onClick={() => onChange({ items: sheet.items.filter((_, j) => j !== i) })}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
        {!sheet.items.length && <p className="text-muted">Nothing on this sheet yet: add a drawing.</p>}
      </div>
      {free.length > 0 && (
        <select
          aria-label="Add a drawing"
          value=""
          onChange={(e) => {
            const pick = free.find((c) => drawingKey(c) === e.target.value);
            if (pick) onChange({ items: [...sheet.items, { drawing: pick, scale: 100 }] });
          }}
          className="rounded-sm border p-1"
        >
          <option value="">Add a drawing…</option>
          {free.map((c) => (
            <option key={drawingKey(c)} value={drawingKey(c)}>
              {title(c)}
            </option>
          ))}
        </select>
      )}
      <button className="m-btn m-btn-danger self-start" onClick={onDelete}>
        Delete sheet
      </button>
    </div>
  );
}

/** A drawing's scale: one of the usual ones, or Custom… to type any 1:n. */
function ScalePicker({
  label,
  scale,
  onChange,
}: {
  label: string;
  scale: SheetScale;
  onChange: (scale: SheetScale) => void;
}) {
  const usual = SHEET_SCALES.includes(scale);
  const [custom, setCustom] = useState(!usual);
  const [typed, setTyped] = useState(String(scale));
  const commit = () => {
    const n = sheetScaleOf(typed);
    if (n) onChange(n);
    else setTyped(String(scale));
  };
  return (
    <>
      <select
        aria-label={label}
        value={custom ? 'custom' : scale}
        onChange={(e) => {
          if (e.target.value === 'custom') {
            setCustom(true);
            setTyped(String(scale));
            return;
          }
          setCustom(false);
          onChange(Number(e.target.value));
        }}
        className="rounded-sm border p-0.5"
      >
        {SHEET_SCALES.map((s) => (
          <option key={s} value={s}>
            1:{s}
          </option>
        ))}
        <option value="custom">{custom && !usual ? `1:${scale}` : 'Custom…'}</option>
      </select>
      {custom && (
        <span className="flex items-center">
          1:
          <input
            aria-label={`Custom ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
            type="number"
            min={MIN_SHEET_SCALE}
            max={MAX_SHEET_SCALE}
            step={1}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
            className="w-14 rounded-sm border p-0.5 tabular-nums"
          />
        </span>
      )}
    </>
  );
}
