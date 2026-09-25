import { elementOutline, planBounds } from '../geometry';
import { formatLength } from '../lib/units';
import { PLAN } from '../theme/plan';
import type { MarlaSqFt, PlanDoc, Units } from '../types';
import { wallFaces } from '../rooms';
import { DEFAULT_WALL_THICKNESS, placeWallDimension, thicknessOf, wallsOf } from '../walls';
import { FurnitureShape } from './shapes/FurnitureShape';
import { MaskShape } from './shapes/MaskShape';
import { OpeningShape } from './shapes/OpeningShape';
import { RoomShape } from './shapes/RoomShape';
import { PlotShape, StairShape } from './shapes/SiteShapes';
import { SketchLineShape } from './shapes/SketchLineShape';
import { BeamShape, BlockShape, ColumnShape, SlabShape } from './shapes/StructureShapes';
import { WallDimension } from './shapes/WallDimension';
import { WallsLayer } from './shapes/WallsLayer';

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
}

/** The plan itself: rooms, walls, doors, windows, furniture and dimensions. Used on screen and for exports. */
export function PlanDrawing(props: PlanDrawingProps) {
  const { doc, selectedIds, units, marlaSqFt, showDimensions, showFurniture, showRoomLabels, showRoomFills, k } = props;
  const walls = wallsOf(doc.elements);
  const selected = new Set(selectedIds);
  const colorOf = (id?: string) => doc.materials.find((m) => m.id === id)?.color;
  const faces = showDimensions ? wallFaces(walls) : [];
  const bounds = planBounds(walls, []);
  const centre = bounds ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 } : { x: 0, y: 0 };

  return (
    <>
      {doc.elements.map((el) =>
        el.type === 'plot' ? <PlotShape key={el.id} plot={el} selected={selected.has(el.id)} k={k} /> : null,
      )}

      {doc.rooms.map((r) => (
        <RoomShape
          key={r.id}
          room={r}
          color={colorOf(r.material)}
          selected={selected.has(r.id)}
          units={units}
          marlaSqFt={marlaSqFt}
          showLabel={showRoomLabels}
          showFill={showRoomFills}
          k={k}
          part="area"
        />
      ))}

      {doc.masks.map((m) => (
        <MaskShape key={m.id} mask={m} color={colorOf(m.material)} />
      ))}

      {doc.elements.map((el) =>
        el.type === 'line' ? <SketchLineShape key={el.id} line={el} selected={selected.has(el.id)} k={k} /> : null,
      )}

      <WallsLayer walls={walls} colorOf={colorOf} selected={selected} k={k} />

      {doc.elements.map((el) => {
        const isSelected = selected.has(el.id);
        const color = colorOf(el.material);
        switch (el.type) {
          case 'wall':
            return null;
          case 'door':
          case 'window': {
            const host = walls.find((w) => w.id === el.wallId);
            return (
              <OpeningShape
                key={el.id}
                opening={el}
                color={color}
                selected={isSelected}
                wallThickness={host ? thicknessOf(host) : DEFAULT_WALL_THICKNESS}
              />
            );
          }
          case 'furniture':
            if (!showFurniture) return null;
            return <FurnitureShape key={el.id} item={el} color={color} selected={isSelected} k={k} />;
          case 'column':
            return <ColumnShape key={el.id} col={el} selected={isSelected} color={color} k={k} />;
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

      {doc.elements.map((el) =>
        el.type === 'slab' ? <SlabShape key={el.id} slab={el} selected={selected.has(el.id)} k={k} /> : null,
      )}

      {/* Room names and sizes sit on top of furniture, as on a drawing. */}
      {doc.rooms.map((r) => (
        <RoomShape
          key={`label-${r.id}`}
          room={r}
          color={colorOf(r.material)}
          selected={selected.has(r.id)}
          units={units}
          marlaSqFt={marlaSqFt}
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
          return <WallDimension key={`dim-${w.id}`} wall={w} units={units} k={k} side={side} />;
        })}
    </>
  );
}
