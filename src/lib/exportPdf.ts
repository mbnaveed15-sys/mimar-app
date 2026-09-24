import type { Bounds, PaperSize } from '../types';
import { downloadUrl, padBounds, renderPlan } from './exportPng';
import type { PlanImageContent } from './planImage';
import { MM_PER_UNIT } from './scale';

/** Landscape paper sizes in millimetres. */
export const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
};

/** Architectural scales, from most to least detailed. */
export const STANDARD_SCALES = [20, 50, 100, 200, 250, 500, 1000, 2000, 5000];

const MARGIN = 10;
const TITLE_BLOCK = 20;
/** Resolution of the drawing on paper. */
const DPI = 200;

/** Space kept around the plan on paper for dimension lines and labels, in paper millimetres. */
const PAPER_PADDING = 12;

/**
 * Most detailed standard scale (1:N) at which a plan of this real size (mm), plus the paper
 * padding on each side, fits the drawing space.
 */
export function chooseScale(realW: number, realH: number, spaceW: number, spaceH: number): number {
  const fits = (n: number) => realW / n + 2 * PAPER_PADDING <= spaceW && realH / n + 2 * PAPER_PADDING <= spaceH;
  return STANDARD_SCALES.find(fits) ?? STANDARD_SCALES.at(-1)!;
}

export interface PdfDetails {
  title: string;
  paper: PaperSize;
  /** e.g. "Dimensions in feet & inches". */
  unitsNote: string;
  /** e.g. "Covered area: 1,250 sq ft · 5.56 marla", or empty. */
  areaNote: string;
  version: string;
  filename: string;
}

/** Export the plan as a print-ready PDF at a true architectural scale, with a title block. */
export async function exportPdf(content: PlanImageContent, area: Bounds, details: PdfDetails) {
  const { jsPDF } = await import('jspdf');
  const planW = (area.maxX - area.minX) * MM_PER_UNIT;
  const planH = (area.maxY - area.minY) * MM_PER_UNIT;

  // Portrait suits plans that are taller than they are wide.
  const landscape = planW >= planH;
  const paper = PAPER_MM[details.paper];
  const pageW = landscape ? paper.w : paper.h;
  const pageH = landscape ? paper.h : paper.w;
  const spaceW = pageW - 2 * MARGIN;
  const spaceH = pageH - 2 * MARGIN - TITLE_BLOCK;
  const scale = chooseScale(planW, planH, spaceW, spaceH);
  const padded = padBounds(area, (PAPER_PADDING * scale) / MM_PER_UNIT);
  const drawW = planW / scale + 2 * PAPER_PADDING;
  const drawH = planH / scale + 2 * PAPER_PADDING;

  const px = (mm: number) => Math.max(1, Math.round((mm / 25.4) * DPI));
  // Text and thin lines sized for paper: 1 "pixel" of the on-screen design is 0.2 mm on paper.
  const k = (0.2 * scale) / MM_PER_UNIT;
  const canvas = await renderPlan(content, padded, px(drawW), px(drawH), { grid: null, k, watermark: false });

  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: details.paper.toLowerCase(),
  });
  pdf.setProperties({ title: details.title, creator: `Mimar ${details.version}` });
  const x = MARGIN + (spaceW - drawW) / 2;
  const y = MARGIN + (spaceH - drawH) / 2;
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, drawW, drawH, undefined, 'FAST');

  // Frame and title block.
  pdf.setDrawColor(30);
  pdf.setLineWidth(0.4);
  pdf.rect(MARGIN / 2, MARGIN / 2, pageW - MARGIN, pageH - MARGIN);
  const tbY = pageH - MARGIN / 2 - TITLE_BLOCK + 4;
  pdf.line(MARGIN / 2, tbY - 4, pageW - MARGIN / 2, tbY - 4);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(details.title, MARGIN, tbY + 3);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Scale 1:${scale} on ${details.paper}  ·  ${details.unitsNote}`, MARGIN, tbY + 9);
  if (details.areaNote) pdf.text(details.areaNote, MARGIN, tbY + 14);
  const right = pageW - MARGIN;
  pdf.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), right, tbY + 3, {
    align: 'right',
  });
  pdf.setTextColor(120);
  pdf.text(`Drawn with Mimar ${details.version}`, right, tbY + 9, { align: 'right' });

  const url = URL.createObjectURL(pdf.output('blob'));
  downloadUrl(url, details.filename);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
