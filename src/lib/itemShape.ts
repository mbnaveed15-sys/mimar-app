/**
 * The shape an item shows on the plan, as one or more outlines: a wall with its thickness (round a
 * curve, with its corners joined), a round column as a circle, a stair as its treads and landings.
 * Checks use it so only what is drawn counts, not the box round it. Pure.
 */
import { elementOutline, fromFurnitureLocal } from '../geometry';
import { stairLayout } from './site';
import { levelOf, type PlanElement, type Point, type Wall } from '../types';
import { wallPolygon } from '../walls';

/** Corners round a circle (enough to read as round, and to measure to within a few mm). */
const ROUND_SIDES = 32;

export function visibleShapes(el: PlanElement, walls: Wall[]): Point[][] {
  switch (el.type) {
    case 'wall':
      return [
        wallPolygon(
          el,
          walls.filter((w) => levelOf(w) === levelOf(el)),
        ),
      ];
    case 'column':
      if (el.shape !== 'round') return [elementOutline(el)];
      return [
        Array.from({ length: ROUND_SIDES }, (_, i) => {
          const a = (i / ROUND_SIDES) * Math.PI * 2;
          return { x: el.x + (Math.cos(a) * el.w) / 2, y: el.y + (Math.sin(a) * el.w) / 2 };
        }),
      ];
    case 'stair':
      return stairLayout(el)
        .parts.filter((p) => !p.overhead)
        .map((p) =>
          (
            p.points ?? [
              { x: p.x, y: p.y },
              { x: p.x + p.w, y: p.y },
              { x: p.x + p.w, y: p.y + p.h },
              { x: p.x, y: p.y + p.h },
            ]
          ).map((q) => fromFurnitureLocal(el, q)),
        );
    default:
      return [elementOutline(el)];
  }
}
