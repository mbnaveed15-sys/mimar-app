import type { Material, Pattern } from '../types';

/**
 * How many of a material's repeats (tiles, bricks, planks) one drawn pattern covers across. A
 * pattern of 2 × 2 tiles, for example, spans twice the tile size.
 */
export const PATTERN_SPAN: Record<Pattern, number> = {
  plain: 1,
  tiles: 2,
  brick: 2,
  wood: 4,
  marble: 1,
  granite: 1,
  terrazzo: 1,
  stone: 3,
  concrete: 1,
  grass: 1,
  pavers: 4,
  gravel: 1,
  metal: 1,
  glass: 1,
  fabric: 1,
};

/** World size of one drawn pattern, in millimetres. */
export function patternSpanMm(m: Pick<Material, 'pattern' | 'sizeMm'>): number {
  return (m.sizeMm ?? 1000) * PATTERN_SPAN[m.pattern ?? 'plain'];
}

/** Small, repeatable random numbers, so a pattern looks the same every time. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(full.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The colour made lighter (amount > 0) or darker (amount < 0), -1…1. */
export function shade(hex: string, amount: number, alpha = 1): string {
  const [r, g, b] = rgb(hex).map((c) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)));
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Is the colour dark? Joints and veins then go lighter instead of darker. */
const isDark = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b < 90;
};

/**
 * Draw one repeat of a material's pattern on a square canvas of `px` pixels. It tiles seamlessly,
 * so a 3D surface can repeat it.
 */
export function drawPattern(ctx: CanvasRenderingContext2D, px: number, m: Pick<Material, 'color' | 'pattern'>) {
  const pattern = m.pattern ?? 'plain';
  const base = m.color;
  const rand = random(hash(`${base}/${pattern}`));
  const dark = isDark(base);
  const joint = (a: number) => shade(base, dark ? 0.35 : -0.35, a);
  const line = Math.max(1, px / 128);
  const fill = (c: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  /** Dots (for speckles, grit and pebbles) that wrap round the edges. */
  const dots = (count: number, rMin: number, rMax: number, colour: () => string) => {
    for (let i = 0; i < count; i++) {
      const x = rand() * px;
      const y = rand() * px;
      const r = rMin + rand() * (rMax - rMin);
      ctx.fillStyle = colour();
      for (const dx of [-px, 0, px])
        for (const dy of [-px, 0, px]) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
    }
  };
  const noise = (count: number, strength: number) =>
    dots(count, px / 256, px / 64, () => shade(base, (rand() - 0.5) * 2 * strength, 0.5));

  fill(base, 0, 0, px, px);
  switch (pattern) {
    case 'plain':
      noise(60, 0.03);
      break;
    case 'glass':
      ctx.fillStyle = shade(base, 0.4, 0.35);
      ctx.beginPath();
      ctx.moveTo(px * 0.1, px);
      ctx.lineTo(px * 0.45, 0);
      ctx.lineTo(px * 0.6, 0);
      ctx.lineTo(px * 0.25, px);
      ctx.fill();
      break;
    case 'concrete':
      noise(500, 0.08);
      dots(40, px / 200, px / 120, () => shade(base, -0.25, 0.5));
      break;
    case 'tiles': {
      const t = px / 2;
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) fill(shade(base, (rand() - 0.5) * 0.08), i * t, j * t, t, t);
      noise(120, 0.04);
      for (const k of [0, t]) {
        fill(joint(0.9), k, 0, line * 1.5, px);
        fill(joint(0.9), 0, k, px, line * 1.5);
      }
      break;
    }
    case 'marble':
    case 'granite': {
      if (pattern === 'granite') {
        dots(900, px / 400, px / 140, () =>
          rand() < 0.5 ? shade(base, 0.35 + rand() * 0.3, 0.9) : shade(base, -0.4, 0.9),
        );
      } else {
        noise(150, 0.05);
        ctx.lineWidth = line * 1.2;
        for (let v = 0; v < 4; v++) {
          ctx.strokeStyle = shade(base, dark ? 0.45 : -0.22, 0.55);
          ctx.beginPath();
          let x = rand() * px;
          let y = 0;
          ctx.moveTo(x, y);
          while (y < px) {
            x += (rand() - 0.5) * px * 0.18;
            y += px * (0.05 + rand() * 0.08);
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      fill(joint(0.7), 0, 0, line, px);
      fill(joint(0.7), 0, 0, px, line);
      break;
    }
    case 'terrazzo':
      dots(500, px / 300, px / 60, () => {
        const r = rand();
        return r < 0.4 ? shade(base, -0.35, 1) : r < 0.8 ? shade(base, 0.45, 1) : shade(base, -0.6, 1);
      });
      break;
    case 'brick': {
      // Two bricks across, six courses down; every other course starts half a brick in.
      const w = px / 2;
      const h = px / 6;
      for (let row = 0; row < 6; row++) {
        const offset = row % 2 ? w / 2 : 0;
        for (let i = -1; i < 3; i++)
          fill(shade(base, (rand() - 0.5) * 0.18), i * w + offset, row * h, w - line * 2, h - line * 2);
      }
      ctx.globalCompositeOperation = 'destination-over';
      fill(shade(base, dark ? 0.3 : 0.45), 0, 0, px, px);
      ctx.globalCompositeOperation = 'source-over';
      noise(200, 0.06);
      break;
    }
    case 'pavers': {
      // Four pavers across, eight rows of half-height blocks, in stretcher bond.
      const w = px / 4;
      const h = px / 8;
      fill(joint(1), 0, 0, px, px);
      for (let row = 0; row < 8; row++) {
        const offset = row % 2 ? w / 2 : 0;
        for (let i = -1; i < 5; i++)
          fill(shade(base, (rand() - 0.5) * 0.14), i * w + offset + line, row * h + line, w - line * 2, h - line * 2);
      }
      break;
    }
    case 'stone': {
      // Three courses of random-length stones.
      fill(joint(1), 0, 0, px, px);
      const h = px / 3;
      for (let row = 0; row < 3; row++) {
        // Widths that add up to exactly one pattern width, so the row wraps round seamlessly.
        const raw = Array.from({ length: 3 + Math.floor(rand() * 2) }, () => 0.6 + rand());
        const total = raw.reduce((a, b) => a + b, 0);
        let x = rand() * px;
        for (const r of raw) {
          const w = (r / total) * px;
          const c = shade(base, (rand() - 0.5) * 0.3);
          for (const dx of [0, -px]) fill(c, x + dx + line, row * h + line, w - line * 2, h - line * 2);
          x += w;
        }
      }
      noise(200, 0.07);
      break;
    }
    case 'wood': {
      // Four planks, each with its own shade, grain lines, and a butt joint somewhere along it.
      const h = px / 4;
      for (let row = 0; row < 4; row++) {
        const tone = (rand() - 0.5) * 0.16;
        fill(shade(base, tone), 0, row * h, px, h);
        ctx.lineWidth = line * 0.8;
        for (let g = 0; g < 7; g++) {
          ctx.strokeStyle = shade(base, tone - 0.12 - rand() * 0.1, 0.45);
          const y = row * h + rand() * h;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(px * 0.33, y + (rand() - 0.5) * h * 0.3, px * 0.66, y + (rand() - 0.5) * h * 0.3, px, y);
          ctx.stroke();
        }
        fill(joint(0.8), 0, row * h, px, line);
        fill(joint(0.8), rand() * px, row * h, line, h);
      }
      break;
    }
    case 'grass':
      noise(300, 0.12);
      ctx.lineWidth = line;
      for (let i = 0; i < 700; i++) {
        const x = rand() * px;
        const y = rand() * px;
        ctx.strokeStyle = shade(base, (rand() - 0.5) * 0.5, 0.8);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * px * 0.02, y - px * (0.015 + rand() * 0.02));
        ctx.stroke();
      }
      break;
    case 'gravel':
      dots(600, px / 90, px / 40, () => shade(base, (rand() - 0.5) * 0.6, 1));
      break;
    case 'metal':
      for (let y = 0; y < px; y += line) fill(shade(base, (rand() - 0.5) * 0.1), 0, y, px, line);
      break;
    case 'fabric':
      for (let i = 0; i < px; i += line * 2) {
        fill(shade(base, -0.08, 0.6), i, 0, line, px);
        fill(shade(base, 0.06, 0.5), 0, i, px, line);
      }
      noise(80, 0.05);
      break;
  }
}

const swatchCache = new Map<string, string>();

/** A small picture of the material, as a data URL, for buttons (browser only). */
export function swatchUrl(m: Pick<Material, 'color' | 'pattern'>, px = 48): string {
  const key = `${m.color}/${m.pattern}/${px}`;
  const hit = swatchCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  drawPattern(ctx, px, m);
  const url = canvas.toDataURL();
  swatchCache.set(key, url);
  return url;
}
