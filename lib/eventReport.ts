import fs from "fs";
import path from "path";
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from "pdf-lib";
import type { Event, RSVP } from "@/types";
import { formatAssignment } from "@/lib/seatLabel";

// ─────────────────────────────────────────────────────────────────────────────
// AuraPixel post-event report — server-side PDF generator (pdf-lib).
//
// Produces a branded, multi-page A4 report from an event + its RSVPs. All text
// is sanitised to a WinAnsi-safe subset before drawing, because the standard
// Helvetica font throws on any code point it can't encode (e.g. CJK guest
// names). Timestamps are rendered in Asia/Kuala_Lumpur regardless of the
// server's timezone (Vercel runs in UTC), so check-in times read correctly.
// ─────────────────────────────────────────────────────────────────────────────

// ── Geometry (A4 portrait, points) ───────────────────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_RESERVE = 46; // keep clear at the bottom for the footer strip

// ── Brand palette ─────────────────────────────────────────────────────────────
const BRAND = rgb(0.239, 0.608, 0.961); // #3d9bf5
const BRAND_DK = rgb(0.149, 0.388, 0.62); // darker blue for text-on-light
const INK = rgb(0.07, 0.07, 0.08); // near-black
const SUB = rgb(0.34, 0.37, 0.42); // sub heading grey
const MUTED = rgb(0.5, 0.53, 0.58); // muted grey
const LINE = rgb(0.886, 0.898, 0.918); // hairline
const CARD_BG = rgb(0.965, 0.972, 0.98);
const TABLE_ALT = rgb(0.974, 0.978, 0.985);
const GREEN = rgb(0.13, 0.74, 0.37);
const AMBER = rgb(0.92, 0.62, 0.12);
const RED = rgb(0.9, 0.27, 0.27);
const VIOLET = rgb(0.62, 0.36, 0.92);

const KL_TZ = "Asia/Kuala_Lumpur";

// ── Text sanitisation (WinAnsi-safe) ──────────────────────────────────────────
function safe(input: unknown): string {
  let s = String(input ?? "");
  // Decompose accents → base letters where possible, drop combining marks.
  s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  // Map common smart punctuation to ASCII.
  s = s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ");
  // Anything still outside printable Latin-1 → "?".
  s = s.replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
  return s;
}

// ── Timezone-correct formatters ───────────────────────────────────────────────
function klParts(iso: string): { h: number; m: number; valid: boolean } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { h: 0, m: 0, valid: false };
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: KL_TZ,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { h, m, valid: true };
}

function klTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const { h, m, valid } = klParts(iso);
  if (!valid) return "-";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function klMinutes(iso: string): number | null {
  const { h, m, valid } = klParts(iso);
  return valid ? h * 60 + m : null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtEventDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d ?? "");
  if (!m) return d ?? "-";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function fmtTime12(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return t ?? "";
  const h = Number(m[1]);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m[2]} ${ap}`;
}

function fmtGeneratedAt(d: Date): string {
  const datePart = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: KL_TZ,
  }).format(d);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: KL_TZ,
  }).format(d);
  return `${datePart}, ${timePart} (MYT)`;
}

// ── Aggregation helpers ───────────────────────────────────────────────────────
// Placeholder values guests typed instead of real data — excluded from
// demographic breakdowns and message lists so the report reads cleanly.
const NULLISH = new Set([
  "", "-", "--", "---", ".", "..", "...", "n/a", "n.a", "n.a.", "na", "nil",
  "none", "tbd", "tba", "?", "x", "xx",
]);

function isNullish(raw: string | null | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^["']+|["']+$/g, "");
  return v === "" || NULLISH.has(v);
}

function cleanField(raw: string | null | undefined): string | null {
  return isNullish(raw) ? null : String(raw).trim();
}

function topCounts(
  rsvps: RSVP[],
  pick: (r: RSVP) => string | undefined | null,
  limit: number,
): { label: string; value: number }[] {
  // Group case-insensitively (so "CEO" and "Ceo" merge) but display the most
  // frequently used original spelling for each group.
  const groups = new Map<string, Map<string, number>>();
  for (const r of rsvps) {
    const raw = (pick(r) ?? "").trim();
    if (isNullish(raw)) continue;
    const key = raw.toLowerCase();
    if (!groups.has(key)) groups.set(key, new Map());
    const variants = groups.get(key)!;
    variants.set(raw, (variants.get(raw) ?? 0) + 1);
  }
  return [...groups.values()]
    .map((variants) => {
      let total = 0;
      let label = "";
      let best = -1;
      for (const [display, n] of variants) {
        total += n;
        if (n > best) {
          best = n;
          label = display;
        }
      }
      return { label, value: total };
    })
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

interface ReportStats {
  total: number;
  attending: number;
  declined: number;
  pending: number;
  allocated: number;
  checkedIn: number;
  plusOnes: number;
  noShows: number;
  attendanceRate: number; // checkedIn / allocated
  capacityUsed: number; // allocated / totalSeats
  notified: number;
  blasts: number;
}

function computeStats(event: Event, rsvps: RSVP[]): ReportStats {
  const total = rsvps.length;
  const declined = rsvps.filter(
    (r) => r.status === "not_attending" || r.attending === false,
  ).length;
  const attending = total - declined;
  const pending = rsvps.filter((r) => r.status === "pending").length;
  const allocated = rsvps.filter(
    (r) => r.status === "allocated" || r.status === "checked_in",
  ).length;
  const checkedIn = rsvps.filter((r) => r.status === "checked_in").length;
  const plusOnes = rsvps.filter((r) => r.plusOne).length;
  const noShows = Math.max(0, allocated - checkedIn);
  const notified = rsvps.filter((r) => !!r.notifiedAt).length;
  const blasts = rsvps.filter((r) => !!r.blastSentAt).length;
  return {
    total,
    attending,
    declined,
    pending,
    allocated,
    checkedIn,
    plusOnes,
    noShows,
    attendanceRate: allocated > 0 ? checkedIn / allocated : 0,
    capacityUsed: event.totalSeats > 0 ? allocated / event.totalSeats : 0,
    notified,
    blasts,
  };
}

// ── Asset loading ─────────────────────────────────────────────────────────────
function loadPublicPng(file: string): Buffer | null {
  try {
    const p = path.join(process.cwd(), "public", file);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Report builder
// ─────────────────────────────────────────────────────────────────────────────
class ReportBuilder {
  private doc: PDFDocument;
  private font: PDFFont;
  private bold: PDFFont;
  private logo: PDFImage | null;
  private mark: PDFImage | null;
  private page!: PDFPage;
  private y = 0;
  private generatedLabel: string;

  private constructor(
    doc: PDFDocument,
    font: PDFFont,
    bold: PDFFont,
    logo: PDFImage | null,
    mark: PDFImage | null,
    generatedLabel: string,
  ) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.logo = logo;
    this.mark = mark;
    this.generatedLabel = generatedLabel;
  }

  static async create(): Promise<ReportBuilder> {
    const doc = await PDFDocument.create();
    doc.setProducer("AuraPixel RSVP");
    doc.setCreator("AuraPixel RSVP");
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    let logo: PDFImage | null = null;
    let mark: PDFImage | null = null;
    // Current brand wordmark (same asset the login screen uses). It has white
    // lettering, so the cover renders it on a dark band — see cover().
    const logoBytes = loadPublicPng("aurapixel-tight.png");
    if (logoBytes) {
      try {
        logo = await doc.embedPng(logoBytes);
      } catch {
        logo = null;
      }
    }
    // Canonical blue "A" app icon for the footer mark (shows on white).
    const markBytes = loadPublicPng("android-chrome-512x512.png");
    if (markBytes) {
      try {
        mark = await doc.embedPng(markBytes);
      } catch {
        mark = null;
      }
    }
    return new ReportBuilder(doc, font, bold, logo, mark, fmtGeneratedAt(new Date()));
  }

  // ── Page lifecycle ────────────────────────────────────────────────────────
  private addPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  private ensure(h: number) {
    if (this.y - h < MARGIN + FOOTER_RESERVE) this.addPage();
  }

  gap(h: number) {
    this.y -= h;
  }

  // ── Primitive draw helpers (cursor = top of the element being drawn) ────────
  private text(
    str: string,
    x: number,
    size: number,
    opts: { font?: PDFFont; color?: RGB } = {},
  ) {
    const f = opts.font ?? this.font;
    this.page.drawText(safe(str), {
      x,
      y: this.y - size,
      size,
      font: f,
      color: opts.color ?? INK,
    });
  }

  private textAt(
    str: string,
    x: number,
    yTop: number,
    size: number,
    opts: { font?: PDFFont; color?: RGB } = {},
  ) {
    const f = opts.font ?? this.font;
    this.page.drawText(safe(str), {
      x,
      y: yTop - size,
      size,
      font: f,
      color: opts.color ?? INK,
    });
  }

  private textRight(
    str: string,
    rightX: number,
    yTop: number,
    size: number,
    opts: { font?: PDFFont; color?: RGB } = {},
  ) {
    const f = opts.font ?? this.font;
    const s = safe(str);
    const w = f.widthOfTextAtSize(s, size);
    this.page.drawText(s, {
      x: rightX - w,
      y: yTop - size,
      size,
      font: f,
      color: opts.color ?? INK,
    });
  }

  private textCenter(
    str: string,
    centerX: number,
    yTop: number,
    size: number,
    opts: { font?: PDFFont; color?: RGB } = {},
  ) {
    const f = opts.font ?? this.font;
    const s = safe(str);
    const w = f.widthOfTextAtSize(s, size);
    this.page.drawText(s, {
      x: centerX - w / 2,
      y: yTop - size,
      size,
      font: f,
      color: opts.color ?? INK,
    });
  }

  private ellipsize(str: string, f: PDFFont, size: number, maxW: number): string {
    let s = safe(str);
    if (f.widthOfTextAtSize(s, size) <= maxW) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + "...", size) > maxW) {
      s = s.slice(0, -1);
    }
    return s + "...";
  }

  private wrap(str: string, f: PDFFont, size: number, maxW: number): string[] {
    const words = safe(str).replace(/\s+/g, " ").trim().split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) <= maxW || !cur) cur = test;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  // ── Section heading ─────────────────────────────────────────────────────────
  // `reserve` = vertical space the first body block needs, so the heading
  // isn't stranded at the bottom of a page with its content on the next.
  sectionHeading(title: string, reserve = 30) {
    this.ensure(44 + reserve);
    this.gap(8);
    // brand accent bar
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 14,
      width: 3.5,
      height: 14,
      color: BRAND,
    });
    this.textAt(title, MARGIN + 11, this.y, 13, { font: this.bold, color: INK });
    this.gap(20);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 4 },
      end: { x: PAGE_W - MARGIN, y: this.y + 4 },
      thickness: 0.75,
      color: LINE,
    });
    this.gap(10);
  }

  // Bold sub-heading used to label sub-blocks within a section.
  subLabel(str: string) {
    this.ensure(16);
    this.text(str, MARGIN, 9.5, { font: this.bold, color: SUB });
    this.gap(16);
  }

  // Hairline divider between sub-blocks within a section.
  divider() {
    this.gap(9);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.5,
      color: LINE,
    });
    this.gap(11);
  }

  paragraph(str: string, size = 9.5, color: RGB = SUB) {
    const lines = this.wrap(str, this.font, size, CONTENT_W);
    const lh = size + 4;
    for (const ln of lines) {
      this.ensure(lh);
      this.text(ln, MARGIN, size, { color });
      this.gap(lh);
    }
  }

  // ── Cover header ─────────────────────────────────────────────────────────────
  cover(event: Event) {
    this.addPage();

    // Full-bleed dark header band. The brand wordmark has white lettering +
    // a light tagline, so it needs a dark backdrop to read — this mirrors how
    // the logo appears on the (dark) login screen.
    const BAND_H = 132;
    this.page.drawRectangle({
      x: 0,
      y: PAGE_H - BAND_H,
      width: PAGE_W,
      height: BAND_H,
      color: rgb(0.043, 0.043, 0.055),
    });
    // brand accent line along the band's lower edge
    this.page.drawRectangle({
      x: 0,
      y: PAGE_H - BAND_H,
      width: PAGE_W,
      height: 3,
      color: BRAND,
    });

    if (this.logo) {
      const lw = 152;
      const lh = (lw * this.logo.height) / this.logo.width;
      const ly = PAGE_H - BAND_H + (BAND_H - lh) / 2 + 4;
      this.page.drawImage(this.logo, { x: MARGIN, y: ly, width: lw, height: lh });
    } else {
      this.textAt("AURAPIXEL", MARGIN, PAGE_H - 54, 22, {
        font: this.bold,
        color: rgb(1, 1, 1),
      });
    }

    this.y = PAGE_H - BAND_H - 30;

    // ── Title + event-details card ──────────────────────────────────────────
    const P = 18;
    const stripeW = 5;
    const innerX = MARGIN + P + stripeW;
    const innerW = CONTENT_W - P * 2 - stripeW;

    const titleLines = this.wrap(event.title, this.bold, 22, innerW);

    const details: { label: string; value: string }[] = [];
    if (event.date) details.push({ label: "DATE", value: fmtEventDate(event.date) });
    if (event.time) details.push({ label: "TIME", value: fmtTime12(event.time) });
    if (event.venue) details.push({ label: "VENUE", value: event.venue });
    if (event.address) details.push({ label: "ADDRESS", value: event.address });

    const labelW = 66;
    const valueW = innerW - labelW;
    const detailLines = details.map((d) => this.wrap(d.value, this.font, 9.5, valueW));
    const detailH = detailLines.reduce((h, lines) => h + Math.max(1, lines.length) * 13 + 6, 0);

    // Height computed to match the exact draw sequence below.
    const cardH = 2 * P + 22 + titleLines.length * 26 + 8 + 16 + detailH;

    this.ensure(cardH + 18);
    const cardTop = this.y;
    const cardBottom = cardTop - cardH;
    this.page.drawRectangle({
      x: MARGIN,
      y: cardBottom,
      width: CONTENT_W,
      height: cardH,
      color: rgb(0.985, 0.988, 0.994),
      borderColor: LINE,
      borderWidth: 0.75,
    });
    this.page.drawRectangle({
      x: MARGIN,
      y: cardBottom,
      width: stripeW,
      height: cardH,
      color: BRAND,
    });

    this.y = cardTop - P;
    this.textAt("POST-EVENT REPORT", innerX, this.y, 10, { font: this.bold, color: BRAND_DK });
    this.gap(22);
    for (const ln of titleLines) {
      this.textAt(ln, innerX, this.y, 22, { font: this.bold, color: INK });
      this.gap(26);
    }
    this.gap(8);
    this.page.drawLine({
      start: { x: innerX, y: this.y },
      end: { x: PAGE_W - MARGIN - P, y: this.y },
      thickness: 0.75,
      color: LINE,
    });
    this.gap(16);
    details.forEach((d, i) => {
      const lines = detailLines[i];
      this.textAt(d.label, innerX, this.y, 8, { font: this.bold, color: MUTED });
      lines.forEach((ln, li) => {
        this.textAt(ln, innerX + labelW, this.y - li * 13, 9.5, { color: INK });
      });
      this.gap(Math.max(1, lines.length) * 13 + 6);
    });

    this.y = cardBottom - 14;
    this.textRight(`Generated ${this.generatedLabel}`, PAGE_W - MARGIN, this.y, 8.5, {
      color: MUTED,
    });
    this.gap(16);
  }

  // ── KPI cards — two-tone tiles (colored value panel + label panel) ─────────────
  kpiGrid(cards: { label: string; value: string; sub?: string; accent?: RGB }[]) {
    const perRow = 4;
    const gap = 11;
    const cardW = (CONTENT_W - gap * (perRow - 1)) / perRow;
    const cardH = 62;
    const valW = 47; // colored value panel width

    for (let i = 0; i < cards.length; i += perRow) {
      this.ensure(cardH + gap);
      const rowTopY = this.y;
      const row = cards.slice(i, i + perRow);
      row.forEach((c, j) => {
        const x = MARGIN + j * (cardW + gap);
        const yBottom = rowTopY - cardH;
        const accent = c.accent ?? BRAND;

        // card body (white, hairline border)
        this.page.drawRectangle({
          x,
          y: yBottom,
          width: cardW,
          height: cardH,
          color: rgb(1, 1, 1),
          borderColor: LINE,
          borderWidth: 0.75,
        });
        // colored value panel (left)
        this.page.drawRectangle({
          x,
          y: yBottom,
          width: valW,
          height: cardH,
          color: accent,
        });
        // value centered in the colored panel (white)
        this.textCenter(c.value, x + valW / 2, rowTopY - cardH / 2 + 8, 16, {
          font: this.bold,
          color: rgb(1, 1, 1),
        });

        // label (up to 2 lines) + sub on the right
        const tx = x + valW + 9;
        const tw = cardW - valW - 13;
        const labelLines = this.wrap(c.label.toUpperCase(), this.bold, 7.5, tw)
          .slice(0, 2)
          .map((ln) => this.ellipsize(ln, this.bold, 7.5, tw));
        labelLines.forEach((ln, k) => {
          this.textAt(ln, tx, rowTopY - 14 - k * 9, 7.5, { font: this.bold, color: INK });
        });
        if (c.sub) {
          const subY = rowTopY - 14 - labelLines.length * 9 - 3;
          for (const [k, ln] of this.wrap(c.sub, this.font, 7, tw).slice(0, 2).entries()) {
            this.textAt(ln, tx, subY - k * 9, 7, { color: MUTED });
          }
        }
      });
      this.gap(cardH + gap);
    }
  }

  // ── Generic horizontal-bar block ─────────────────────────────────────────────
  bars(
    rows: { label: string; value: number; color?: RGB; valueText?: string }[],
    opts: { labelW?: number; max?: number } = {},
  ) {
    if (!rows.length) {
      this.paragraph("No data available.", 9, MUTED);
      return;
    }
    const labelW = opts.labelW ?? 150;
    const valueW = 46;
    const barX = MARGIN + labelW + 8;
    const barW = CONTENT_W - labelW - 8 - valueW;
    const max = opts.max ?? Math.max(...rows.map((r) => r.value), 1);
    const rowH = 20;

    for (const r of rows) {
      this.ensure(rowH);
      const midY = this.y - rowH / 2;
      // label
      this.textAt(
        this.ellipsize(r.label, this.font, 9, labelW),
        MARGIN,
        midY + 4.5,
        9,
        { color: SUB },
      );
      // track
      this.page.drawRectangle({
        x: barX,
        y: midY - 5,
        width: barW,
        height: 10,
        color: rgb(0.93, 0.94, 0.955),
      });
      // fill
      const fillW = max > 0 ? Math.max(r.value > 0 ? 2 : 0, (r.value / max) * barW) : 0;
      if (fillW > 0) {
        this.page.drawRectangle({
          x: barX,
          y: midY - 5,
          width: fillW,
          height: 10,
          color: r.color ?? BRAND,
        });
      }
      // value
      this.textRight(r.valueText ?? String(r.value), PAGE_W - MARGIN, midY + 4.5, 9, {
        font: this.bold,
        color: INK,
      });
      this.gap(rowH);
    }
  }

  // ── Donut chart + legend (status breakdown) ──────────────────────────────────
  donutWithLegend(
    segments: { label: string; value: number; color: RGB }[],
    center: { big: string; small?: string },
  ) {
    const total = segments.reduce((a, s) => a + s.value, 0);
    const H = 150;
    this.ensure(H);
    const top = this.y;
    const rO = 56;
    const rI = 33;
    const cx = MARGIN + rO + 12;
    const cy = top - H / 2 + 4;

    // wedges
    if (total <= 0) {
      this.page.drawEllipse({ x: cx, y: cy, xScale: rO, yScale: rO, color: rgb(0.93, 0.94, 0.955) });
    } else {
      let a0 = 0;
      for (const s of segments) {
        if (s.value <= 0) continue;
        const sweep = (s.value / total) * Math.PI * 2;
        const steps = Math.max(2, Math.ceil((sweep / (Math.PI * 2)) * 80));
        let d = "M 0 0";
        for (let i = 0; i <= steps; i++) {
          const a = a0 + (sweep * i) / steps;
          const px = rO * Math.sin(a);
          const py = -rO * Math.cos(a);
          d += ` L ${px.toFixed(2)} ${py.toFixed(2)}`;
        }
        d += " Z";
        this.page.drawSvgPath(d, { x: cx, y: cy, color: s.color, borderWidth: 0 });
        a0 += sweep;
      }
    }
    // donut hole + center label
    this.page.drawEllipse({ x: cx, y: cy, xScale: rI, yScale: rI, color: rgb(1, 1, 1) });
    this.textCenter(center.big, cx, cy + 9, 19, { font: this.bold, color: INK });
    if (center.small) {
      this.textCenter(center.small, cx, cy - 9, 7, { font: this.bold, color: MUTED });
    }

    // legend (right of the donut)
    const lx = cx + rO + 26;
    const rowH = 26;
    let ly = top - 18;
    for (const s of segments) {
      const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
      this.page.drawRectangle({ x: lx, y: ly - 10, width: 11, height: 11, color: s.color });
      this.textAt(s.label, lx + 18, ly, 9.5, { font: this.bold, color: INK });
      this.textRight(`${s.value}  ·  ${pct}%`, PAGE_W - MARGIN, ly, 9.5, { color: SUB });
      ly -= rowH;
    }

    this.y = top - H;
  }

  // ── Stat columns (e.g. funnel stages) — centered, no bars ─────────────────────
  statColumns(cols: { label: string; value: string; sub?: string }[]) {
    if (!cols.length) return;
    const rowH = 50;
    this.ensure(rowH);
    const top = this.y;
    const colW = CONTENT_W / cols.length;
    cols.forEach((c, i) => {
      const cx = MARGIN + i * colW + colW / 2;
      if (i > 0) {
        // light separator between columns
        this.page.drawLine({
          start: { x: MARGIN + i * colW, y: top - 8 },
          end: { x: MARGIN + i * colW, y: top - rowH + 10 },
          thickness: 0.75,
          color: LINE,
        });
      }
      this.textCenter(c.label.toUpperCase(), cx, top - 4, 7.5, { font: this.bold, color: MUTED });
      this.textCenter(c.value, cx, top - 18, 18, { font: this.bold, color: INK });
      if (c.sub) {
        this.textCenter(c.sub, cx, top - 38, 7.5, { color: BRAND_DK });
      }
    });
    this.y = top - rowH;
  }

  // ── Key/value rows (e.g. seating, comms) ─────────────────────────────────────
  keyValues(rows: { label: string; value: string }[]) {
    const lh = 17;
    for (const r of rows) {
      this.ensure(lh);
      this.text(r.label, MARGIN, 9.5, { color: MUTED });
      this.textRight(r.value, PAGE_W - MARGIN, this.y, 9.5, { font: this.bold, color: INK });
      this.gap(lh);
    }
  }

  // ── Table (header + rows, repeats header across pages) ────────────────────────
  table(
    columns: { header: string; width: number; align?: "left" | "right" }[],
    rows: { cells: string[]; color?: RGB }[],
  ) {
    const headerH = 20;
    const rowH = 16;
    const drawHeader = () => {
      this.ensure(headerH + rowH);
      const top = this.y;
      this.page.drawRectangle({
        x: MARGIN,
        y: top - headerH,
        width: CONTENT_W,
        height: headerH,
        color: rgb(0.12, 0.13, 0.16),
      });
      let x = MARGIN + 8;
      columns.forEach((c) => {
        if (c.align === "right") {
          this.textRight(c.header, x + c.width - 16, top - 5.5, 8, {
            font: this.bold,
            color: rgb(1, 1, 1),
          });
        } else {
          this.textAt(c.header, x, top - 5.5, 8, { font: this.bold, color: rgb(1, 1, 1) });
        }
        x += c.width;
      });
      this.gap(headerH);
    };

    drawHeader();
    rows.forEach((r, idx) => {
      if (this.y - rowH < MARGIN + FOOTER_RESERVE) {
        this.addPage();
        drawHeader();
      }
      const top = this.y;
      if (idx % 2 === 1) {
        this.page.drawRectangle({
          x: MARGIN,
          y: top - rowH,
          width: CONTENT_W,
          height: rowH,
          color: TABLE_ALT,
        });
      }
      let x = MARGIN + 8;
      columns.forEach((c, ci) => {
        const cell = r.cells[ci] ?? "";
        const cellColor = ci === columns.length - 1 && r.color ? r.color : INK;
        const txt = this.ellipsize(cell, this.font, 8.5, c.width - 16);
        if (c.align === "right") {
          this.textRight(txt, x + c.width - 16, top - 4.5, 8.5, { color: cellColor });
        } else {
          this.textAt(txt, x, top - 4.5, 8.5, { color: cellColor });
        }
        x += c.width;
      });
      this.gap(rowH);
    });
  }

  // ── Footer strip on every page ────────────────────────────────────────────────
  private paintFooters(eventTitle: string) {
    const pages = this.doc.getPages();
    const n = pages.length;
    pages.forEach((pg, i) => {
      pg.drawLine({
        start: { x: MARGIN, y: MARGIN + 22 },
        end: { x: PAGE_W - MARGIN, y: MARGIN + 22 },
        thickness: 0.5,
        color: LINE,
      });
      let leftX = MARGIN;
      if (this.mark) {
        const s = 12;
        pg.drawImage(this.mark, { x: MARGIN, y: MARGIN + 6, width: s, height: s });
        leftX = MARGIN + s + 6;
      }
      pg.drawText(safe(`AuraPixel  ·  ${eventTitle}  ·  Confidential`), {
        x: leftX,
        y: MARGIN + 9,
        size: 7.5,
        font: this.font,
        color: MUTED,
      });
      const pageLabel = `Page ${i + 1} of ${n}`;
      const w = this.font.widthOfTextAtSize(pageLabel, 7.5);
      pg.drawText(pageLabel, {
        x: PAGE_W - MARGIN - w,
        y: MARGIN + 9,
        size: 7.5,
        font: this.font,
        color: MUTED,
      });
    });
  }

  async finish(eventTitle: string): Promise<Uint8Array> {
    this.paintFooters(eventTitle);
    return this.doc.save();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────
export interface ReportSections {
  funnel?: boolean;
  attendance?: boolean;
  demographics?: boolean;
  dietary?: boolean;
  seating?: boolean;
  comms?: boolean;
  feedback?: boolean;
  guestList?: boolean;
}

const ALL_SECTIONS: Required<ReportSections> = {
  funnel: true,
  attendance: true,
  demographics: true,
  dietary: true,
  seating: true,
  comms: true,
  feedback: true,
  guestList: true,
};

const STATUS_LABEL: Record<RSVP["status"], string> = {
  pending: "Pending",
  allocated: "Allocated",
  checked_in: "Checked-in",
  not_attending: "Declined",
};

const STATUS_COLOR: Record<RSVP["status"], RGB> = {
  pending: AMBER,
  allocated: BRAND,
  checked_in: GREEN,
  not_attending: RED,
};

export async function buildEventReportPdf(
  event: Event,
  rsvps: RSVP[],
  sections: ReportSections = ALL_SECTIONS,
): Promise<Uint8Array> {
  const want = { ...ALL_SECTIONS, ...sections };
  const s = computeStats(event, rsvps);
  const b = await ReportBuilder.create();

  // ── Cover ───────────────────────────────────────────────────────────────────
  b.cover(event);

  // ── Executive summary KPI cards ───────────────────────────────────────────────
  b.sectionHeading("Executive Summary");
  b.kpiGrid([
    { label: "Registered", value: String(s.total), sub: "Total RSVP records" },
    { label: "Attending", value: String(s.attending), sub: "Confirmed yes", accent: GREEN },
    { label: "Allocated", value: String(s.allocated), sub: "Seats assigned", accent: BRAND },
    { label: "Checked-in", value: String(s.checkedIn), sub: "Scanned at door", accent: GREEN },
    {
      label: "Attendance Rate",
      value: `${Math.round(s.attendanceRate * 100)}%`,
      sub: "Checked-in / allocated",
      accent: VIOLET,
    },
    { label: "No-shows", value: String(s.noShows), sub: "Allocated, no scan", accent: RED },
    {
      label: "Capacity Used",
      value: `${Math.round(s.capacityUsed * 100)}%`,
      sub: `${s.allocated} / ${event.totalSeats} seats`,
      accent: BRAND,
    },
    { label: "Plus-ones", value: String(s.plusOnes), sub: "Guests +1", accent: AMBER },
  ]);

  // ── RSVP funnel + status breakdown ────────────────────────────────────────────
  if (want.funnel) {
    b.sectionHeading("RSVP Funnel & Status", 200);
    // Donut chart of the status mix (the "circle chart").
    b.donutWithLegend(
      [
        { label: "Checked-in", value: s.checkedIn, color: STATUS_COLOR.checked_in },
        { label: "Allocated (no-show)", value: s.noShows, color: STATUS_COLOR.allocated },
        { label: "Pending", value: s.pending, color: STATUS_COLOR.pending },
        { label: "Declined", value: s.declined, color: STATUS_COLOR.not_attending },
      ],
      { big: String(s.total), small: "TOTAL RSVPS" },
    );
    // Funnel stages as centered stat columns (no bars).
    b.statColumns([
      { label: "Registered", value: String(s.total) },
      {
        label: "Attending",
        value: String(s.attending),
        sub: s.total ? `${Math.round((s.attending / s.total) * 100)}% of reg.` : undefined,
      },
      {
        label: "Allocated",
        value: String(s.allocated),
        sub: s.attending ? `${Math.round((s.allocated / s.attending) * 100)}% of att.` : undefined,
      },
      {
        label: "Checked-in",
        value: String(s.checkedIn),
        sub: s.allocated ? `${Math.round((s.checkedIn / s.allocated) * 100)}% of alloc.` : undefined,
      },
    ]);
  }

  // ── Attendance & check-in timeline ────────────────────────────────────────────
  if (want.attendance) {
    b.sectionHeading("Attendance & Check-in Timeline");
    const checkins = rsvps
      .filter((r) => r.status === "checked_in" && r.checkedInAt)
      .map((r) => klMinutes(r.checkedInAt as string))
      .filter((m): m is number => m != null)
      .sort((a, z) => a - z);

    if (checkins.length === 0) {
      b.paragraph(
        "No check-in scans were recorded for this event, so an arrival timeline is unavailable.",
        9.5,
        MUTED,
      );
    } else {
      const SLOT = 30; // minutes
      const first = Math.floor(checkins[0] / SLOT) * SLOT;
      const last = Math.floor(checkins[checkins.length - 1] / SLOT) * SLOT;
      const buckets: { label: string; value: number }[] = [];
      for (let t = first; t <= last; t += SLOT) {
        const count = checkins.filter((m) => m >= t && m < t + SLOT).length;
        const hh = String(Math.floor(t / 60)).padStart(2, "0");
        const mm = String(t % 60).padStart(2, "0");
        buckets.push({ label: `${hh}:${mm}`, value: count });
      }
      const peak = buckets.reduce((a, x) => (x.value > a.value ? x : a), buckets[0]);
      b.paragraph(
        `First scan at ${klTime(rsvps.find((r) => r.checkedInAt && klMinutes(r.checkedInAt) === checkins[0])?.checkedInAt)} MYT, ` +
          `last at ${klTime(
            [...rsvps]
              .filter((r) => r.checkedInAt)
              .sort(
                (a, z) =>
                  (klMinutes(z.checkedInAt as string) ?? 0) -
                  (klMinutes(a.checkedInAt as string) ?? 0),
              )[0]?.checkedInAt,
          )} MYT. Busiest 30-min window: ${peak.label} (${peak.value} guests).`,
        9.5,
        SUB,
      );
      b.gap(4);
      b.bars(
        buckets.map((x) => ({ label: x.label, value: x.value, color: BRAND })),
        { labelW: 70 },
      );
    }
  }

  // ── Demographics ────────────────────────────────────────────────────────────
  if (want.demographics) {
    b.sectionHeading("Guest Demographics");
    const companies = topCounts(rsvps, (r) => r.company, 10);
    const titles = topCounts(rsvps, (r) => r.jobTitle, 8);
    const industries = topCounts(rsvps, (r) => r.industry, 8);
    const groups = topCounts(rsvps, (r) => r.partOf, 8);

    const subs = [
      { label: "Top Organisations", data: companies, color: BRAND },
      { label: "By Industry", data: industries, color: BRAND_DK },
      { label: "By Job Title", data: titles, color: VIOLET },
      { label: "By Guest Group", data: groups, color: rgb(0.62, 0.66, 0.72) },
    ].filter((x) => x.data.length);

    if (!subs.length) {
      b.paragraph(
        "No company, industry, job-title or group data was captured for these guests.",
        9.5,
        MUTED,
      );
    } else {
      subs.forEach((sub, i) => {
        if (i > 0) b.divider();
        b.subLabel(sub.label);
        b.bars(
          sub.data.map((c) => ({ label: c.label, value: c.value, color: sub.color })),
          { labelW: 230 },
        );
      });
    }
  }

  // ── Dietary requirements ──────────────────────────────────────────────────────
  if (want.dietary) {
    b.sectionHeading("Dietary Requirements");
    const diet = topCounts(rsvps, (r) => r.dietaryRestrictions, 20);
    const totalDiet = diet.reduce((a, d) => a + d.value, 0);
    if (!diet.length) {
      b.paragraph("No dietary requirements were submitted by guests.", 9.5, MUTED);
    } else {
      b.paragraph(
        `${totalDiet} guest(s) submitted dietary requirements — catering-relevant summary below.`,
        9.5,
        SUB,
      );
      b.gap(4);
      b.bars(
        diet.map((d) => ({ label: d.label, value: d.value, color: GREEN })),
        { labelW: 260 },
      );
    }
  }

  // ── Seating occupancy ─────────────────────────────────────────────────────────
  if (want.seating) {
    b.sectionHeading("Seating & Capacity");
    const cfg = event.seatingConfig;
    const allocatedRsvps = rsvps.filter(
      (r) => (r.status === "allocated" || r.status === "checked_in") && r.seatNumber != null,
    );
    const tablesUsed = new Set<string>();
    for (const r of allocatedRsvps) {
      const a = formatAssignment(r.seatNumber, event);
      if (a) tablesUsed.add(a.short.split("-")[0]); // table-level key (T1, V1, A …)
    }
    const rows: { label: string; value: string }[] = [
      { label: "Seating style", value: cfg?.style ? cfg.style : "Not configured" },
      { label: "Assignment mode", value: event.assignmentMode === "table" ? "By table" : "By seat" },
      { label: "Total capacity", value: `${event.totalSeats} seats` },
      { label: "Seats allocated", value: `${s.allocated} (${Math.round(s.capacityUsed * 100)}%)` },
      { label: "Seats remaining", value: String(Math.max(0, event.totalSeats - s.allocated)) },
    ];
    if (cfg?.seatsPerTable) {
      rows.push({ label: "Seats per table", value: String(cfg.seatsPerTable) });
      rows.push({ label: "Tables occupied", value: String(tablesUsed.size) });
    }
    if (cfg?.vipTables?.length) {
      const vipSeats = cfg.vipTables.reduce((a, t) => a + t.seats, 0);
      rows.push({
        label: "VIP tables",
        value: `${cfg.vipTables.length} (${vipSeats} seats)`,
      });
    }
    b.keyValues(rows);
  }

  // ── Communications log ────────────────────────────────────────────────────────
  if (want.comms) {
    b.sectionHeading("Communications");
    b.keyValues([
      { label: "Guests notified (entry pass / thank-you)", value: String(s.notified) },
      { label: "Email blasts delivered", value: String(s.blasts) },
      {
        label: "Allocated but not yet notified",
        value: String(Math.max(0, s.allocated - s.notified)),
      },
    ]);
  }

  // ── Full guest list appendix ──────────────────────────────────────────────────
  if (want.guestList) {
    b.sectionHeading("Appendix — Full Guest List");
    const sorted = [...rsvps].sort((a, z) => a.name.localeCompare(z.name));
    b.table(
      [
        { header: "Name", width: 148 },
        { header: "Company", width: 186 },
        { header: "Seat / Table", width: 75 },
        { header: "Status", width: 90 },
      ],
      sorted.map((r) => {
        const a = formatAssignment(r.seatNumber, event);
        return {
          cells: [
            r.name,
            cleanField(r.company) ?? "—",
            a ? a.short : "—",
            STATUS_LABEL[r.status],
          ],
          color: STATUS_COLOR[r.status],
        };
      }),
    );
  }

  return b.finish(event.title);
}
