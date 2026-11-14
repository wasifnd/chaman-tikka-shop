import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

/** Shop details printed at the top (from siteConfig, passed in so this stays testable). */
export interface ReceiptShop {
  name: string;
  address: string;
  hours: string;
}

// 80 mm wide, the size of a shop's thermal receipt printer, and easy to read on a phone.
const WIDTH = 226.77;
const MARGIN = 14;
const INNER = WIDTH - MARGIN * 2;

export const BLACK = rgb(0.08, 0.06, 0.05);
export const GREY = rgb(0.38, 0.36, 0.34);
export const RED = rgb(0.72, 0.1, 0.08);
type Colour = typeof BLACK;

export const dateTime = new Intl.DateTimeFormat('en-PK', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Karachi',
});

type Align = 'left' | 'right' | 'center';
type Op =
  | { kind: 'text'; text: string; font: PDFFont; size: number; x: number; y: number; color: Colour }
  | { kind: 'rule'; y: number; dashed: boolean };

/**
 * Lays a receipt out top to bottom, then sizes the page to fit, so a two-line receipt and a
 * hundred-line statement both come out as one tidy strip.
 */
export class Layout {
  readonly ops: Op[] = [];
  y = 0; // distance from the top, grows downwards

  constructor(
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {}

  /** Characters the built-in PDF font can't draw (e.g. Urdu) become "?" instead of failing. */
  private safe(value: string): string {
    const supported = new Set(this.regular.getCharacterSet());
    return value
      .replace(/\s+/g, ' ')
      .replace(/[\s\S]/gu, (char) => (supported.has(char.codePointAt(0) ?? 0) ? char : '?'));
  }

  private wrap(value: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of this.safe(value).split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  text(
    value: string,
    {
      size = 8,
      bold = false,
      align = 'left',
      color = BLACK,
      indent = 0,
    }: { size?: number; bold?: boolean; align?: Align; color?: Colour; indent?: number } = {},
  ) {
    const font = bold ? this.bold : this.regular;
    for (const line of this.wrap(value, font, size, INNER - indent)) {
      const width = font.widthOfTextAtSize(line, size);
      const x =
        align === 'center'
          ? MARGIN + (INNER - width) / 2
          : align === 'right'
            ? MARGIN + INNER - width
            : MARGIN + indent;
      this.y += size * 1.35;
      this.ops.push({ kind: 'text', text: line, font, size, x, y: this.y, color });
    }
  }

  /** A label on the left and a value on the right, on one line. */
  pair(
    label: string,
    value: string,
    {
      size = 8,
      bold = false,
      color = BLACK,
    }: { size?: number; bold?: boolean; color?: Colour } = {},
  ) {
    const font = bold ? this.bold : this.regular;
    const right = this.safe(value);
    const rightWidth = font.widthOfTextAtSize(right, size);
    const lines = this.wrap(label, font, size, INNER - rightWidth - 8);
    this.y += size * 1.35;
    this.ops.push({
      kind: 'text',
      text: right,
      font,
      size,
      x: MARGIN + INNER - rightWidth,
      y: this.y,
      color,
    });
    lines.forEach((line, index) => {
      if (index > 0) this.y += size * 1.35;
      this.ops.push({ kind: 'text', text: line, font, size, x: MARGIN, y: this.y, color });
    });
  }

  rule(dashed = true) {
    this.y += 6;
    this.ops.push({ kind: 'rule', y: this.y, dashed });
    this.y += 2;
  }

  gap(points: number) {
    this.y += points;
  }

  /** The shop's name, address and hours, as every receipt starts. */
  shopHeader(shop: ReceiptShop) {
    this.text(shop.name.toUpperCase(), { size: 13, bold: true, align: 'center', color: RED });
    this.text(shop.address, { size: 7.5, align: 'center', color: GREY });
    this.text(shop.hours, { size: 7.5, align: 'center', color: GREY });
    this.rule(false);
  }
}

/** A new PDF with the shop's details filled in, and a Layout to write into. */
export async function startStrip(
  title: string,
  shop: ReceiptShop,
  createdAt: Date,
): Promise<{ pdf: PDFDocument; doc: Layout }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${title} - ${shop.name}`);
  pdf.setAuthor(shop.name);
  pdf.setCreator(shop.name);
  pdf.setProducer(shop.name);
  pdf.setCreationDate(createdAt);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return { pdf, doc: new Layout(regular, bold) };
}

/** Draws everything laid out on one page exactly as tall as it, and returns the file. */
export async function finishStrip(pdf: PDFDocument, doc: Layout): Promise<Uint8Array> {
  const height = doc.y + MARGIN * 1.5;
  const page = pdf.addPage([WIDTH, height]);
  for (const op of doc.ops) {
    if (op.kind === 'text') {
      page.drawText(op.text, {
        x: op.x,
        y: height - op.y,
        size: op.size,
        font: op.font,
        color: op.color,
      });
    } else {
      page.drawLine({
        start: { x: MARGIN, y: height - op.y },
        end: { x: WIDTH - MARGIN, y: height - op.y },
        thickness: 0.6,
        color: GREY,
        ...(op.dashed ? { dashArray: [2, 2] } : {}),
      });
    }
  }
  return pdf.save();
}

/** A PDF as a private reply: inline to view, or as a download. */
export function pdfResponse(pdf: Uint8Array, filename: string, download: boolean): Response {
  return new Response(new Blob([pdf as BlobPart], { type: 'application/pdf' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
