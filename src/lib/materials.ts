import type { Material } from '../types';

const texture = (name: string) => `${import.meta.env.BASE_URL}assets/textures/${name}.png`;

export function defaultMaterials(): Material[] {
  return [
    { id: 'mat_concrete', name: 'Concrete', color: '#D1D5DB', texture: texture('concrete'), type: 'structure' },
    { id: 'mat_brick', name: 'Brick', color: '#B7410E', texture: texture('brick'), type: 'masonry' },
    { id: 'mat_wood', name: 'Wood', color: '#C29B6C', texture: texture('wood'), type: 'finish' },
    { id: 'mat_marble', name: 'Marble', color: '#F3F4F6', texture: texture('marble'), type: 'finish' },
    { id: 'mat_glass', name: 'Glass', color: '#D0F0FF', texture: '', type: 'glazing' },
  ];
}
