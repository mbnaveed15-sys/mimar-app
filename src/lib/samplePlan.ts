import type { FurnitureKind } from '../furniture/catalog';
import { createPlannerStore } from '../store/plannerStore';
import type { PlanDoc, Point } from '../types';
import { DEFAULT_PREFS } from './prefs';
import { emptyDoc } from './storage';

const FT = 30.48; // plan units (10 mm) per foot
const ft = (x: number, y: number): Point => ({ x: x * FT, y: y * FT });

/**
 * A single-storey 5-marla house (25' × 45' plot, road at the bottom) to explore: a plot with
 * setbacks and boundary wall, two bedrooms, a lounge, kitchen, drawing room, bath and stairs,
 * built with the same actions as the tools, so everything in it can be edited.
 */
export function buildSamplePlan(): PlanDoc {
  const store = createPlannerStore(emptyDoc(), undefined, { ...DEFAULT_PREFS, showFurniture: true });
  const s = () => store.getState();

  s().addPlot([ft(0, 0), ft(25, 0), ft(25, 45), ft(0, 45)]);

  // The house: 22' × 36', 2' from the rear and 6' back from the road.
  const walls: [number, number, number, number][] = [
    [1.5, 3, 23.5, 3],
    [23.5, 3, 23.5, 39],
    [23.5, 39, 1.5, 39],
    [1.5, 39, 1.5, 3],
    [1.5, 15, 23.5, 15],
    [1.5, 27, 23.5, 27],
    [12.5, 3, 12.5, 15],
    [15, 15, 15, 27],
    [12.5, 27, 12.5, 39],
    [17, 27, 17, 39],
    [12.5, 33, 17, 33],
  ];
  for (const [x1, y1, x2, y2] of walls) s().addWall(ft(x1, y1), ft(x2, y2));

  const rooms: [number, number, string][] = [
    [7, 9, 'Bedroom'],
    [18, 9, 'Master bedroom'],
    [8, 21, 'TV lounge'],
    [19, 21, 'Kitchen'],
    [7, 33, 'Drawing room'],
    [14.75, 30, 'Bath'],
    [14.75, 36, 'Store'],
    [20.25, 33, 'Stairs'],
  ];
  for (const [x, y, name] of rooms) {
    s().addRoomAt(ft(x, y));
    const room = s().roomAt(ft(x, y));
    if (room) s().updateRoom({ ...room, name });
  }

  const doors: [number, number][] = [
    [7, 39], // main door
    [7, 15],
    [18, 15],
    [19, 27],
    [12.5, 30],
    [12.5, 36],
    [8, 27],
  ];
  for (const [x, y] of doors) s().placeOpening('door', ft(x, y));
  const windows: [number, number][] = [
    [7, 3],
    [18, 3],
    [1.5, 21],
    [23.5, 21],
    [1.5, 33],
  ];
  for (const [x, y] of windows) s().placeOpening('window', ft(x, y));
  // A gate in the boundary wall on the road side.
  s().setSite({ gate: true });
  s().placeOpening('door', ft(12.5, 44.6));
  s().setSite({ gate: false });

  // [kind, x, y, turn]: beds with their heads on the rear wall, the counter along the kitchen's side wall.
  const furniture: [FurnitureKind, number, number, number][] = [
    ['bed-double', 5.5, 6.9, 0],
    ['bed-king', 19.5, 7, 0],
    ['wardrobe', 2.8, 11.2, 90],
    ['wardrobe', 22.2, 11.2, 270],
    ['sofa-3', 5.5, 17.2, 0],
    ['tv-unit', 5.5, 26.1, 180],
    ['counter', 22.5, 21, 90],
    ['stove', 22.5, 17.3, 90],
    ['sink', 22.5, 24.6, 90],
    ['sofa-2', 4.2, 30, 0],
    ['armchair', 10.4, 30.2, 0],
    ['wc', 14.75, 28.6, 0],
    ['basin', 16.2, 31.8, 270],
  ];
  for (const [kind, x, y, rotation] of furniture) {
    s().setFurnitureKind(kind);
    s().addFurniture(ft(x, y));
    if (rotation) {
      const el = s().doc.elements.at(-1);
      if (el?.type === 'furniture') s().updateElement({ ...el, rotation });
    }
  }

  s().setSite({ stairShape: 'U', climb: 'floor' });
  s().addStair(ft(20.25, 33));
  return s().doc;
}
