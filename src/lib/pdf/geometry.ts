// Text geometry for the PDF path.
//
// pdf.js gives each text item a 6-element affine matrix. The old code combined
// it with the viewport transform and then used only the `e`/`f` translation,
// throwing `a,b,c,d` away — so a rotated page, rotated text, or a
// non-uniformly-scaled run got an axis-aligned box placed at the correct
// origin but pointing the wrong way. The box missed the text while the summary
// reported the value as redacted, which is the worst possible outcome for a
// redaction tool.
//
// This module recovers the full frame (where the text starts, which way it
// advances, which way is "up") so a box can be drawn as a rotated quad, and so
// spacing decisions can be made from real distances rather than from
// `item.height * scale`, which also ignores rotation.

export type Vec2 = readonly [number, number];

/** x0,y0, x1,y1, x2,y2, x3,y3 — a rotated rectangle, in canvas pixels. */
export type Quad = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface ItemFrame {
  /** Baseline pen start, in canvas pixels. */
  origin: Vec2;
  /** Unit vector along the text advance direction. */
  advance: Vec2;
  /** Unit vector perpendicular to the advance, pointing to the glyph tops. */
  up: Vec2;
  /** The item's advance width, in canvas pixels. */
  widthDev: number;
  /**
   * The true transformed em height in canvas pixels. Derived from the combined
   * matrix rather than `item.height * viewport.scale`, which is wrong for any
   * rotated or non-uniformly scaled text.
   */
  emDev: number;
}

function magnitude(x: number, y: number): number {
  return Math.hypot(x, y);
}

function normalize(x: number, y: number, fallback: Vec2): Vec2 {
  const length = magnitude(x, y);
  if (!Number.isFinite(length) || length < 1e-9) return fallback;
  return [x / length, y / length];
}

/**
 * Build a frame from a combined (viewport x item) matrix and the item's
 * unscaled advance width.
 *
 * In canvas space y grows downward, so the "up" direction derived from the
 * matrix's `c,d` column already points from the baseline toward the glyph tops.
 */
export function frameFromMatrix(
  combined: readonly number[],
  itemWidth: number,
  viewportScale: number
): ItemFrame {
  const [a, b, c, d, e, f] = combined;

  const advance = normalize(a, b, [1, 0]);
  const up = normalize(c, d, [0, -1]);
  const emDev = magnitude(c, d) || magnitude(a, b) || 1;

  return {
    origin: [e, f],
    advance,
    up,
    widthDev: itemWidth * viewportScale,
    emDev,
  };
}

export interface ItemGap {
  /** Distance from the end of `prev` to the start of `next`, along the text. */
  along: number;
  /** Perpendicular distance — non-zero means the baseline changed. */
  across: number;
}

/**
 * Where `next` begins relative to where `prev` ended, measured in `prev`'s own
 * frame. This is what lets us tell "these two runs are the same word" from
 * "there is a space here" and from "this is a new line", without guessing from
 * character counts.
 */
export function itemGap(prev: ItemFrame, next: ItemFrame): ItemGap {
  const prevEnd: Vec2 = [
    prev.origin[0] + prev.advance[0] * prev.widthDev,
    prev.origin[1] + prev.advance[1] * prev.widthDev,
  ];

  const dx = next.origin[0] - prevEnd[0];
  const dy = next.origin[1] - prevEnd[1];

  return {
    along: dx * prev.advance[0] + dy * prev.advance[1],
    across: Math.abs(dx * prev.up[0] + dy * prev.up[1]),
  };
}

/**
 * A rotated rectangle covering the run from `startPx` to `endPx` along the
 * advance direction, extended above the baseline by the ascent and below by the
 * descent.
 */
export function quadFor(
  frame: ItemFrame,
  startPx: number,
  endPx: number,
  ascent: number,
  descent: number
): Quad {
  const [ax, ay] = frame.advance;
  const [ux, uy] = frame.up;
  const [ox, oy] = frame.origin;

  const startX = ox + ax * startPx;
  const startY = oy + ay * startPx;
  const endX = ox + ax * endPx;
  const endY = oy + ay * endPx;

  return [
    startX + ux * ascent,
    startY + uy * ascent,
    endX + ux * ascent,
    endY + uy * ascent,
    endX - ux * descent,
    endY - uy * descent,
    startX - ux * descent,
    startY - uy * descent,
  ];
}

/**
 * Fill a quad. `fillRect` cannot express a rotated box at all — replacing it
 * with a filled path is the actual fix for the rotated-page leak.
 */
export function fillQuad(ctx: CanvasRenderingContext2D, quad: Quad): void {
  ctx.beginPath();
  ctx.moveTo(quad[0], quad[1]);
  ctx.lineTo(quad[2], quad[3]);
  ctx.lineTo(quad[4], quad[5]);
  ctx.lineTo(quad[6], quad[7]);
  ctx.closePath();
  ctx.fill();
}

// Scripts written right-to-left, plus the Arabic/Hebrew presentation forms.
// Detecting these matters because the measureText-based slicing used to place a
// sub-run box assumes text accumulates left-to-right from the pen origin; for a
// bidi run it does not, and the box lands beside the text rather than over it.
const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;

export function containsRtl(text: string): boolean {
  return RTL_RE.test(text);
}
