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
  /** e.g. "Bylaws: CDA Islamabad (sectors), Type C, 400–1000 sq yd", or empty. */
  bylawNote?: string;
  /** Which way north points, in degrees clockwise from up the page (for the north arrow). */
  northDeg?: number;
  /** The check page's title: the plan's name (the check covers every floor). */
  checkTitle?: string;
  /** Plan hints (good-practice advice), printed after the plan check. */
  hints?: string[];
  /** The bill of quantities and cost estimate, on a page of its own. */
  cost?: {
    heading: string;
    rows: { label: string; qty: string; rate: string; amount: string }[];
    total: string;
    materials: string[];
    quick: string;
    footer: string;
  };
  /** The plan check, printed on a page of its own. */
  check?: {
    heading: string;
    rows: { status: 'ok' | 'fail' | 'check'; label: string; actual: string; required: string; clause: string }[];
    footer: string;
  };
}

type Pdf = InstanceType<typeof import('jspdf').jsPDF>;

/** Text for the PDF's built-in font, which lacks some characters. */
const pdfText = (s: string) => s.replace(/⅓/g, '1/3').replace(/⅔/g, '2/3').replace(/≤/g, '<=').replace(/≥/g, '>=');

/**
 * The plan check on a page of its own: a row per rule, with what's needed, what the plan has, and
 * the clause; then the plan hints, if any.
 */
function checkPage(pdf: Pdf, check: PdfDetails['check'], hints: string[], title: string) {
  pdf.addPage('a4', 'portrait');
  const w = 210;
  let y = 20;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(`${check ? 'Plan check' : 'Plan hints'} · ${title}`, MARGIN, y);
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  if (check) y = checkRows(pdf, check, y);
  if (hints.length) {
    y += check ? 8 : 3;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Plan hints (good practice, not bylaws)', MARGIN, y);
    pdf.setFont('helvetica', 'normal');
    y += 6;
    for (const h of hints) {
      const lines = pdf.splitTextToSize(pdfText(h), w - 2 * MARGIN - 5);
      if (y + lines.length * 4 > 280) {
        pdf.addPage('a4', 'portrait');
        y = 20;
      }
      pdf.text('•', MARGIN, y);
      pdf.text(lines, MARGIN + 5, y);
      y += lines.length * 4 + 2;
    }
  }
}

/** The plan check's rows (from y), returning where the next text can go. */
function checkRows(pdf: Pdf, check: NonNullable<PdfDetails['check']>, top: number): number {
  const w = 210;
  let y = top;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(pdf.splitTextToSize(check.heading, w - 2 * MARGIN), MARGIN, y);
  y += 10;
  const cols = [MARGIN, MARGIN + 16, MARGIN + 62, MARGIN + 116, w - MARGIN - 28];
  pdf.setFont('helvetica', 'bold');
  ['', 'Rule', 'The plan', 'Required', 'Clause'].forEach((h, i) => pdf.text(h, cols[i], y));
  pdf.setFont('helvetica', 'normal');
  y += 2;
  pdf.line(MARGIN, y, w - MARGIN, y);
  y += 5;
  const word = { ok: 'OK', fail: 'NOT MET', check: 'CHECK' } as const;
  for (const r of check.rows) {
    const cells = [
      [word[r.status]],
      // Each column wraps short of the next one.
      pdf.splitTextToSize(pdfText(r.label), cols[2] - cols[1] - 2),
      pdf.splitTextToSize(pdfText(r.actual), cols[3] - cols[2] - 2),
      pdf.splitTextToSize(pdfText(r.required), cols[4] - cols[3] - 2),
      pdf.splitTextToSize(pdfText(r.clause), w - MARGIN - cols[4]),
    ];
    if (r.status === 'fail') pdf.setTextColor(180, 30, 30);
    cells.forEach((c, i) => pdf.text(c, cols[i], y));
    pdf.setTextColor(0);
    y += Math.max(...cells.map((c) => c.length)) * 4 + 3;
    if (y > 270) {
      pdf.addPage('a4', 'portrait');
      y = 20;
    }
  }
  y += 4;
  pdf.setTextColor(110);
  const footer = pdf.splitTextToSize(check.footer, w - 2 * MARGIN);
  pdf.text(footer, MARGIN, y);
  pdf.setTextColor(0);
  return y + footer.length * 4;
}

/** The bill of quantities: an item per row with its quantity, rate and amount; the materials; the quick check. */
function costPage(pdf: Pdf, cost: NonNullable<PdfDetails['cost']>, title: string) {
  pdf.addPage('a4', 'portrait');
  const w = 210;
  let y = 20;
  const room = (need: number) => {
    if (y + need <= 280) return;
    pdf.addPage('a4', 'portrait');
    y = 20;
  };
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(`Quantities and cost · ${title}`, MARGIN, y);
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(pdf.splitTextToSize(pdfText(cost.heading), w - 2 * MARGIN), MARGIN, y);
  y += 9;
  const right = [MARGIN + 118, MARGIN + 146, w - MARGIN];
  pdf.setFont('helvetica', 'bold');
  pdf.text('Item', MARGIN, y);
  ['Quantity', 'Rate (Rs)', 'Amount (Rs)'].forEach((h, i) => pdf.text(h, right[i], y, { align: 'right' }));
  pdf.setFont('helvetica', 'normal');
  y += 2;
  pdf.line(MARGIN, y, w - MARGIN, y);
  y += 5;
  for (const r of cost.rows) {
    const label = pdf.splitTextToSize(pdfText(r.label), right[0] - MARGIN - 24);
    room(label.length * 4 + 2);
    pdf.text(label, MARGIN, y);
    [r.qty, r.rate, r.amount].forEach((v, i) => pdf.text(pdfText(v), right[i], y, { align: 'right' }));
    y += label.length * 4 + 2;
  }
  pdf.line(MARGIN, y - 1, w - MARGIN, y - 1);
  y += 4;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Total', MARGIN, y);
  pdf.text(pdfText(cost.total), right[2], y, { align: 'right' });
  y += 10;
  room(8 + cost.materials.length * 5);
  pdf.text('Materials', MARGIN, y);
  pdf.setFont('helvetica', 'normal');
  y += 6;
  for (const m of cost.materials) {
    pdf.text(pdfText(m), MARGIN, y);
    y += 5;
  }
  y += 4;
  room(20);
  pdf.text(pdf.splitTextToSize(pdfText(cost.quick), w - 2 * MARGIN), MARGIN, y);
  y += 10;
  pdf.setTextColor(110);
  pdf.text(pdf.splitTextToSize(pdfText(cost.footer), w - 2 * MARGIN), MARGIN, y);
  pdf.setTextColor(0);
}

/** A north arrow centred at (cx, cy), pointing `deg` clockwise from up the page. */
function northArrow(pdf: Pdf, cx: number, cy: number, deg: number) {
  const r = 6;
  const a = (deg * Math.PI) / 180;
  const at = (x: number, y: number) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)];
  pdf.setLineWidth(0.3);
  pdf.circle(cx, cy, r);
  const [tx, ty] = at(0, -r);
  const [lx, ly] = at(-2.2, r * 0.55);
  const [mx, my] = at(0, r * 0.2);
  const [rx, ry] = at(2.2, r * 0.55);
  pdf.setFillColor(30, 30, 30);
  pdf.triangle(tx, ty, lx, ly, mx, my, 'F');
  pdf.triangle(tx, ty, mx, my, rx, ry, 'S');
  const [nx, ny] = at(0, -r - 3);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('N', nx, ny + 1.2, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
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
  if (drawW > spaceW + 1 || drawH > spaceH + 1)
    throw new Error(
      `The plan is too big to fit on ${details.paper} even at 1:${scale}. Check for items drawn far away.`,
    );

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
  if (details.bylawNote) pdf.text(details.bylawNote, right, tbY + 9, { align: 'right' });
  pdf.setTextColor(120);
  pdf.text(`Drawn with Mimar ${details.version}`, right, tbY + (details.bylawNote ? 14 : 9), { align: 'right' });
  pdf.setTextColor(0);
  northArrow(pdf, pageW - MARGIN - 8, MARGIN + 11, details.northDeg ?? 0);
  if (details.check || details.hints?.length)
    checkPage(pdf, details.check, details.hints ?? [], details.checkTitle ?? details.title);
  if (details.cost) costPage(pdf, details.cost, details.checkTitle ?? details.title);

  const url = URL.createObjectURL(pdf.output('blob'));
  downloadUrl(url, details.filename);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
