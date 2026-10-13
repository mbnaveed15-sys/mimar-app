import { memo, useId } from 'react';
import { NorthArrowShape } from './shapes/NorthArrowShape';
import { openingBend } from '../lib/arc';
import { projectOf } from '../lib/project';
import { elementOutline, planBounds } from '../geometry';
import { formatLength } from '../lib/units';
import { PLAN } from '../theme/plan';
import type { EdgeCurve, MarlaSqFt, PlanDoc, PlanElement, Point, Room, Units, Wall } from '../types';
import { labelPoint, wallFaces } from '../rooms';
import { metricProject } from '../lib/curtain';
import { plinthOutlines } from '../lib/plinth';
import { DEFAULT_WALL_THICKNESS, openingCover, placeWallDimension, thicknessOf, wallsOf } from '../walls';
import { FurnitureShape } from './shapes/FurnitureShape';
import { MaskShape } from './shapes/MaskShape';
import { OpeningShape } from './shapes/OpeningShape';
import { RoomShape } from './shapes/RoomShape';
import { PlotShape, StairShape } from './shapes/SiteShapes';
import { SectionShape } from './shapes/SectionShape';
import { DimensionShape } from './shapes/DimensionShape';
import { dimStyleOf } from '../lib/dimStyle';
import { SketchLineShape } from './shapes/SketchLineShape';
import { BeamShape, BlockShape, ColumnShape, RoofShape, SlabShape } from './shapes/StructureShapes';
import { WallDimension } from './shapes/WallDimension';
import { WallsLayer } from './shapes/WallsLayer';
import { ContextShape, ContourShape, GroundOverlay, PadShape, SpotLevelShape } from './shapes/TerrainShapes';
import type { GroundOnPlan } from '../lib/terrain/groundView';
import { hatchOf, ringsPath, surfaceHatchOf, type Hatch } from '../lib/hatch';
import { curveOf, facetOutline } from '../lib/curvedEdges';
import { outlinePoints } from '../lib/plot';
import { HatchArea, HatchDefs } from './shapes/Hatching';

export interface PlanDrawingProps {
  doc: PlanDoc;
  /** Highlighted items. */
  selectedIds: readonly string[];
  units: Units;
  marlaSqFt: MarlaSqFt;
  showDimensions: boolean;
  showFurniture: boolean;
  showRoomLabels: boolean;
  showRoomFills: boolean;
  /** Plan units per screen (or output) pixel, for line widths and text that keep a fixed size. */
  k: number;
  /** Selected furniture shows its use zone sized for a wheelchair user (ADA), where that differs. */
  accessibleZones?: boolean;
  /** The ground worked out from the levels (contour lines, cut and fill), on the ground floor. */
  ground?: GroundOnPlan | null;
  /** Double-height rooms on the floor below: the floor is open over them. */
  voids?: Room[];
  /** Show every furniture item's use zone (exports), not only the selected ones'. */
  showZones?: boolean;
  /** The wall whose automatic plinth is selected (it shows highlighted where it stands out). */
  selectedPlinth?: string | null;
}

/**
 * The plan itself: rooms, walls, doors, windows, furniture and dimensions. Used on screen and for
 * exports. Memoised: moving the pointer or panning doesn't redraw it, only a change to what it shows.
 */
export const PlanDrawing = memo(function PlanDrawing(props: PlanDrawingProps) {
  const { doc, selectedIds, units, marlaSqFt, showDimensions, showFurniture, showRoomLabels, showRoomFills, k } = props;
  const marla = projectOf(doc).type === 'house' ? marlaSqFt : undefined;
  const look = dimStyleOf(doc);
  const walls = wallsOf(doc.elements);
  const wallById = new Map(walls.map((w) => [w.id, w] as const));
  const selected = new Set(selectedIds);
  const colorOf = (id?: string) => doc.materials.find((m) => m.id === id)?.color;
  const faces = showDimensions ? wallFaces(walls) : [];
  const bounds = planBounds(walls, []);
  const centre = bounds ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 } : { x: 0, y: 0 };
  // Hatching: walls and columns by what they are made of, floors and ground by their finish.
  const uid = `h${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const cutHatch = doc.drawing?.planHatch !== false;
  const floorHatch = doc.drawing?.floorHatch !== false;
  const used = new Set<Hatch>();
  // Worked out here, before drawing, so the patterns for every hatch in use are made.
  const cutHatches = new Map<string, Hatch>();
  if (cutHatch)
    for (const el of doc.elements)
      if (el.type === 'wall' || el.type === 'column') {
        const h = el.type === 'wall' && el.kind === 'curtain' ? null : hatchOf(el, doc.materials);
        if (h) {
          cutHatches.set(el.id, h);
          used.add(h);
        }
      }
  const wallHatch = (w: Wall) => cutHatches.get(w.id) ?? null;
  const cutOf = (el: PlanElement) => {
    const h = cutHatches.get(el.id);
    return h ? { uid, hatch: h } : undefined;
  };
  const floors: { key: string; hatch: Hatch; d: string }[] = [];
  const blockHatches: { key: string; hatch: Hatch; d: string }[] = [];
  if (floorHatch) {
    const add = (list: typeof floors, key: string, material: string | undefined, outline: Point[]) => {
      const h = surfaceHatchOf(material, doc.materials);
      if (!h || outline.length < 3) return;
      used.add(h);
      list.push({ key, hatch: h, d: ringsPath([outline]) });
    };
    const curved = (el: { points: Point[]; curve?: EdgeCurve }) => {
      const c = curveOf(el);
      return c ? facetOutline(c) : el.points;
    };
    for (const el of doc.elements) {
      if (el.type === 'plot') add(floors, el.id, el.material, outlinePoints(el));
      if (el.type === 'pad') add(floors, el.id, el.material, curved(el));
      if (el.type === 'block') add(blockHatches, el.id, el.material, el.points);
    }
    for (const r of doc.rooms) add(floors, r.id, r.material, r.points);
  }
  const wallHatches = cutHatch ? { uid, of: wallHatch } : undefined;

  return (
    <>
      {used.size > 0 && <HatchDefs uid={uid} k={k} hatches={used} />}
      {doc.elements.map((el) =>
        el.type === 'context' ? <ContextShape key={el.id} item={el} selected={selected.has(el.id)} k={k} /> : null,
      )}

      {doc.elements.map((el) =>
        el.type === 'plot' ? <PlotShape key={el.id} plot={el} selected={selected.has(el.id)} k={k} /> : null,
      )}

      {props.ground && (
        <GroundOverlay contours={props.ground.contours} cutFill={props.ground.cutFill} units={units} k={k} />
      )}

      {props.voids?.map((v) => (
        <VoidShape key={`void-${v.id}`} room={v} k={k} />
      ))}

      {doc.rooms.map((r) => (
        <RoomShape
          key={r.id}
          room={r}
          color={colorOf(r.material)}
          selected={selected.has(r.id)}
          units={units}
          marlaSqFt={marla}
          showLabel={showRoomLabels}
          showFill={showRoomFills}
          k={k}
          part="area"
        />
      ))}

      {floors.map((f) => (
        <HatchArea key={`fh-${f.key}`} uid={uid} hatch={f.hatch} d={f.d} opacity={0.45} />
      ))}

      {doc.masks.map((m) => (
        <MaskShape key={m.id} mask={m} color={colorOf(m.material)} />
      ))}

      {doc.elements.map((el) =>
        el.type === 'line' ? <SketchLineShape key={el.id} line={el} selected={selected.has(el.id)} k={k} /> : null,
      )}

      {plinthOutlines(doc).map(({ wallId, points }) => (
        <polygon
          key={`plinth-${wallId}`}
          data-type="plinth"
          data-id={wallId}
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          style={{ fill: 'none', stroke: props.selectedPlinth === wallId ? PLAN.selection : PLAN.wallEdge }}
          strokeWidth={(props.selectedPlinth === wallId ? 3 : 1) * k}
          strokeLinejoin="miter"
        />
      ))}

      <WallsLayer
        walls={walls}
        colorOf={colorOf}
        selected={selected}
        k={k}
        metric={metricProject(doc)}
        hatch={wallHatches}
      />

      {doc.elements.map((el) => {
        const isSelected = selected.has(el.id);
        const color = colorOf(el.material);
        switch (el.type) {
          case 'wall':
            return null;
          case 'door':
          case 'window': {
            const host = wallById.get(el.wallId);
            // An opening round a curve covers just the wall; one flat across it, the curve's rise too.
            const bend = openingBend(el, host);
            return (
              <OpeningShape
                key={el.id}
                opening={el}
                color={color}
                selected={isSelected}
                wallThickness={
                  host ? (bend ? thicknessOf(host) : openingCover(host, el.width)) : DEFAULT_WALL_THICKNESS
                }
                bend={bend}
              />
            );
          }
          case 'furniture':
            if (!showFurniture) return null;
            return (
              <FurnitureShape
                key={el.id}
                item={el}
                color={color}
                selected={isSelected}
                k={k}
                accessible={props.accessibleZones}
                showZone={props.showZones}
              />
            );
          case 'column':
            return <ColumnShape key={el.id} col={el} selected={isSelected} color={color} k={k} hatch={cutOf(el)} />;
          case 'beam':
            return <BeamShape key={el.id} beam={el} selected={isSelected} k={k} />;
          case 'stair':
            return <StairShape key={el.id} stair={el} selected={isSelected} k={k} />;
          case 'block':
            return <BlockShape key={el.id} block={el} selected={isSelected} color={color} k={k} />;
          default:
            return null;
        }
      })}

      {blockHatches.map((f) => (
        <HatchArea key={`bh-${f.key}`} uid={uid} hatch={f.hatch} d={f.d} opacity={0.45} />
      ))}

      {doc.elements.map((el) =>
        el.type === 'slab' ? (
          <SlabShape key={el.id} slab={el} selected={selected.has(el.id)} k={k} />
        ) : el.type === 'roof' ? (
          <RoofShape key={el.id} roof={el} selected={selected.has(el.id)} k={k} />
        ) : null,
      )}

      {doc.elements.map((el) =>
        el.type === 'section' ? <SectionShape key={el.id} line={el} selected={selected.has(el.id)} k={k} /> : null,
      )}

      {doc.northArrow && <NorthArrowShape at={doc.northArrow} deg={doc.northDeg ?? 0} k={k} />}

      {doc.elements.map((el) =>
        el.type === 'dimension' ? (
          <DimensionShape key={el.id} dim={el} units={units} selected={selected.has(el.id)} k={k} look={look} />
        ) : null,
      )}

      {doc.elements.map((el) => {
        const on = selected.has(el.id);
        if (el.type === 'pad') return <PadShape key={el.id} pad={el} selected={on} units={units} k={k} />;
        if (el.type === 'contour') return <ContourShape key={el.id} contour={el} selected={on} units={units} k={k} />;
        if (el.type === 'level') return <SpotLevelShape key={el.id} level={el} selected={on} units={units} k={k} />;
        return null;
      })}

      {/* Room names and sizes sit on top of furniture, as on a drawing. */}
      {doc.rooms.map((r) => (
        <RoomShape
          key={`label-${r.id}`}
          room={r}
          color={colorOf(r.material)}
          selected={selected.has(r.id)}
          units={units}
          marlaSqFt={marla}
          showLabel={showRoomLabels}
          showFill={showRoomFills}
          k={k}
          part="label"
        />
      ))}

      {/* Items raised above (or sunk below) their floor carry their height, e.g. +2' 0". */}
      {doc.elements.map((el) => {
        if (!el.elevMm || (el.type === 'furniture' && !showFurniture)) return null;
        const pts = elementOutline(el);
        if (!pts.length) return null;
        const at = {
          x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
          y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length + 12 * k,
        };
        return (
          <text
            key={`elev-${el.id}`}
            data-testid="elevation-tag"
            x={at.x}
            y={at.y}
            fontSize={10 * k}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fill: PLAN.dim, stroke: PLAN.paper }}
            strokeWidth={3 * k}
            paintOrder="stroke"
          >
            {`${el.elevMm > 0 ? '+' : ''}${formatLength(el.elevMm, units)}`}
          </text>
        );
      })}

      {showDimensions &&
        walls.map((w) => {
          const { side, exterior } = placeWallDimension(w, faces, centre);
          // Interior walls are measured by the rooms around them; show theirs only when selected.
          if (!exterior && !selected.has(w.id)) return null;
          return <WallDimension key={`dim-${w.id}`} wall={w} units={units} k={k} side={side} look={look} />;
        })}
    </>
  );
});

/** A double-height space seen from the floor above: its outline dashed, crossed through, marked open to below. */
function VoidShape({ room, k }: { room: Room; k: number }) {
  const pts = room.points;
  const n = pts.length;
  const at = labelPoint(pts);
  // Corner to opposite corner, twice (the two diagonals of a rectangle).
  const cross = [
    [pts[0], pts[Math.floor(n / 2)]],
    [pts[Math.floor(n / 4)], pts[Math.floor((3 * n) / 4)]],
  ];
  return (
    <g data-testid="open-to-below" pointerEvents="none" style={{ stroke: PLAN.inkMuted }} strokeWidth={k}>
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" strokeDasharray={`${6 * k} ${4 * k}`} />
      {cross.map(([a, b], i) => (
        <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      ))}
      <text
        x={at.x}
        y={at.y}
        fontSize={11 * k}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fill: PLAN.inkMuted, stroke: PLAN.paper }}
        strokeWidth={3 * k}
        paintOrder="stroke"
      >
        Open to below
      </text>
    </g>
  );
}
