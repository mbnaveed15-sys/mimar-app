import { downloadUrl, renderPlan } from './exportPng';
import { checkPage, costPage, pdfText, type Pdf, type PdfDetails } from './exportPdf';
import type { PlanImageContent } from './planImage';
import { MM_PER_UNIT } from './scale';
import { layoutSheet, type Prim, type SheetSource } from './drawings/sheet';
import type { Sheet } from '../types';

/** Resolution plans are printed at on sheets (lower on very big drawings, to keep memory in hand). */
const DPI = 200;
const MAX_PIXELS = 24_000_000;
/** Millimetres per point (font sizes are in points). */
const MM_PER_PT = 25.4 / 72;

/** The extras printed after the sheets: the plan check and hints, and the cost estimate. */
export type SheetExtras = Pick<PdfDetails, 'check' | 'hints' | 'cost'> & { checkTitle: string };

/** Draw one sheet's instructions onto the current PDF page. */
async function drawPrims(pdf: Pdf, prims: Prim[], plan: (levelId: string) => PlanImageContent) {
  pdf.setDrawColor(17, 17, 17);
  pdf.setFillColor(17, 17, 17);
  pdf.setTextColor(17, 17, 17);
  for (const p of prims) {
    switch (p.t) {
      case 'line':
        pdf.setLineWidth(p.w);
        pdf.setLineDashPattern(p.dash ?? [], 0);
        pdf.line(p.a[0], p.a[1], p.b[0], p.b[1]);
        break;
      case 'fill':
        pdf.setLineDashPattern([], 0);
        for (const ring of p.rings) {
          ring.forEach(([x, y], i) => (i ? pdf.lineTo(x, y) : pdf.moveTo(x, y)));
          pdf.close();
        }
        pdf.fillEvenOdd();
        break;
      case 'tri':
        pdf.triangle(p.pts[0][0], p.pts[0][1], p.pts[1][0], p.pts[1][1], p.pts[2][0], p.pts[2][1], 'F');
        break;
      case 'rect':
        pdf.setLineDashPattern([], 0);
        pdf.setLineWidth(p.lw);
        pdf.rect(p.x, p.y, p.w, p.h);
        break;
      case 'circle':
        pdf.setLineDashPattern([], 0);
        pdf.setLineWidth(p.lw);
        pdf.circle(p.x, p.y, p.r);
        break;
      case 'text':
        pdf.setFont('helvetica', p.bold ? 'bold' : 'normal');
        pdf.setFontSize(p.size / MM_PER_PT);
        pdf.text(pdfText(p.text), p.x, p.y, { align: p.align ?? 'left' });
        break;
      case 'plan': {
        const dpi = Math.min(DPI, Math.sqrt(MAX_PIXELS / ((p.w / 25.4) * (p.h / 25.4))));
        const px = (mm: number) => Math.max(1, Math.round((mm / 25.4) * dpi));
        // Text and thin lines sized for paper: 1 "pixel" of the screen design is 0.2 mm on paper.
        const k = (0.2 * p.scale) / MM_PER_UNIT;
        const canvas = await renderPlan(plan(p.levelId), p.area, px(p.w), px(p.h), { grid: null, k, watermark: false });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', p.x, p.y, p.w, p.h, undefined, 'FAST');
        break;
      }
    }
  }
  pdf.setLineDashPattern([], 0);
}

/**
 * Print the drawing sheets to one PDF (each on its own paper, landscape), then the plan check and
 * cost pages when asked for. Returns the sheets whose drawings don't all fit.
 */
export async function exportSheets(
  src: SheetSource,
  sheets: Sheet[],
  plan: (levelId: string) => PlanImageContent,
  extras: SheetExtras,
  filename: string,
): Promise<string[]> {
  const { jsPDF } = await import('jspdf');
  const overflow: string[] = [];
  let pdf: Pdf | null = null;
  for (const [i, sheet] of sheets.entries()) {
    const layout = layoutSheet(src, sheet, i, sheets.length);
    if (layout.overflow) overflow.push(sheet.name);
    const format = sheet.paper.toLowerCase();
    if (!pdf) pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format });
    else pdf.addPage(format, 'landscape');
    await drawPrims(pdf, layout.prims, plan);
  }
  if (!pdf) throw new Error('There are no sheets to print. Add a sheet in the Drawings view first.');
  pdf.setProperties({ title: src.projectName, creator: `Mimar ${src.version}` });
  if (extras.check || extras.hints?.length) checkPage(pdf, extras.check, extras.hints ?? [], extras.checkTitle);
  if (extras.cost) costPage(pdf, extras.cost, extras.checkTitle);
  const url = URL.createObjectURL(pdf.output('blob'));
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return overflow;
}
