import { planBounds } from '../geometry';
import type { MarlaSqFt, PlanDoc, Units } from '../types';
import { DEFAULT_WALL_THICKNESS, thicknessOf, wallsOf } from '../walls';
import { FurnitureShape } from './shapes/FurnitureShape';
import { MaskShape } from './shapes/MaskShape';
import { OpeningShape } from './shapes/OpeningShape';
import { RoomShape } from './shapes/RoomShape';
import { WallDimension } from './shapes/WallDimension';
import { WallsLayer } from './shapes/WallsLayer';

export interface PlanDrawingProps {
  doc: PlanDoc;
  selectedId: string | null;
  units: Units;
  marlaSqFt: MarlaSqFt;
  showDimensions: boolean;
  /** Plan units per screen (or output) pixel, for line widths and text that keep a fixed size. */
  k: number;
}

/** The plan itself: rooms, walls, doors, windows, furniture and dimensions. Used on screen and for exports. */
export function PlanDrawing({ doc, selectedId, units, marlaSqFt, showDimensions, k }: PlanDrawingProps) {
  const walls = wallsOf(doc.elements);
  const colorOf = (id?: string) => doc.materials.find((m) => m.id === id)?.color;
  const bounds = planBounds(walls, []);
  const centre = bounds ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 } : { x: 0, y: 0 };

  return (
    <>
      {doc.rooms.map((r) => (
        <RoomShape
          key={r.id}
          room={r}
          color={colorOf(r.material)}
          selected={r.id === selectedId}
          units={units}
          marlaSqFt={marlaSqFt}
          k={k}
        />
      ))}

      {doc.masks.map((m) => (
        <MaskShape key={m.id} mask={m} color={colorOf(m.material)} />
      ))}

      <WallsLayer walls={walls} colorOf={colorOf} selectedId={selectedId} k={k} />

      {doc.elements.map((el) => {
        const isSelected = el.id === selectedId;
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
            return <FurnitureShape key={el.id} item={el} color={color} selected={isSelected} />;
        }
      })}

      {showDimensions &&
        walls.map((w) => <WallDimension key={`dim-${w.id}`} wall={w} units={units} k={k} centre={centre} />)}
    </>
  );
}
