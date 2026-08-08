import { describe, it, expect } from "vitest";
import { frameFromMatrix, itemGap, quadFor, containsRtl } from "./geometry";

// A pdf.js viewport transform at scale 1 for an unrotated page is
// [1, 0, 0, -1, 0, height]: PDF y grows up, canvas y grows down. Combined with
// an identity text matrix at font size 10 placed at (20, 700) on an 800-tall
// page, the combined matrix is [10, 0, 0, -10, 20, 100].
const UPRIGHT = [10, 0, 0, -10, 20, 100];
/** The same text rotated 90 degrees clockwise on the canvas. */
const ROTATED_90 = [0, 10, 10, 0, 20, 100];

const round = (n: number) => Math.round(n * 1000) / 1000;

describe("frameFromMatrix", () => {
  it("reads the advance and up directions for upright text", () => {
    const frame = frameFromMatrix(UPRIGHT, 5, 1);
    expect(frame.origin).toEqual([20, 100]);
    expect(frame.advance.map(round)).toEqual([1, 0]);
    // Canvas y grows downward, so "up" is negative y.
    expect(frame.up.map(round)).toEqual([0, -1]);
    expect(frame.emDev).toBe(10);
    expect(frame.widthDev).toBe(5);
  });

  it("recovers a rotated frame instead of discarding the rotation", () => {
    // This is the information the old code threw away, which is why the black
    // box was drawn in the wrong direction on rotated pages.
    const frame = frameFromMatrix(ROTATED_90, 5, 1);
    expect(frame.advance.map(round)).toEqual([0, 1]);
    expect(frame.up.map(round)).toEqual([1, 0]);
    expect(frame.emDev).toBe(10);
  });

  it("derives em height from the matrix, not from a scale multiplication", () => {
    // Non-uniform scale: 20 wide, 8 tall. `item.height * scale` would miss this.
    expect(frameFromMatrix([20, 0, 0, -8, 0, 0], 1, 1).emDev).toBe(8);
  });

  it("falls back to sane directions for a degenerate matrix", () => {
    const frame = frameFromMatrix([0, 0, 0, 0, 5, 6], 1, 1);
    expect(frame.advance).toEqual([1, 0]);
    expect(frame.up).toEqual([0, -1]);
    expect(frame.emDev).toBe(1);
  });

  it("scales the advance width by the viewport scale", () => {
    expect(frameFromMatrix(UPRIGHT, 5, 2).widthDev).toBe(10);
  });
});

describe("itemGap", () => {
  it("reports zero gap for two runs that abut", () => {
    const prev = frameFromMatrix([10, 0, 0, -10, 0, 100], 30, 1);
    const next = frameFromMatrix([10, 0, 0, -10, 30, 100], 10, 1);
    const gap = itemGap(prev, next);
    expect(round(gap.along)).toBe(0);
    expect(round(gap.across)).toBe(0);
  });

  it("measures a horizontal gap along the text direction", () => {
    const prev = frameFromMatrix([10, 0, 0, -10, 0, 100], 30, 1);
    const next = frameFromMatrix([10, 0, 0, -10, 34, 100], 10, 1);
    expect(round(itemGap(prev, next).along)).toBe(4);
  });

  it("reports a baseline change as an across gap", () => {
    const prev = frameFromMatrix([10, 0, 0, -10, 0, 100], 30, 1);
    const next = frameFromMatrix([10, 0, 0, -10, 0, 112], 10, 1);
    const gap = itemGap(prev, next);
    expect(round(gap.across)).toBe(12);
  });

  it("measures gaps in the rotated frame, not in screen axes", () => {
    // Rotated text advancing down the canvas: a 4px gap is a y offset.
    const prev = frameFromMatrix([0, 10, 10, 0, 20, 100], 30, 1);
    const next = frameFromMatrix([0, 10, 10, 0, 20, 134], 10, 1);
    expect(round(itemGap(prev, next).along)).toBe(4);
    expect(round(itemGap(prev, next).across)).toBe(0);
  });

  it("reports a negative gap for overlapping/kerned runs", () => {
    const prev = frameFromMatrix([10, 0, 0, -10, 0, 100], 30, 1);
    const next = frameFromMatrix([10, 0, 0, -10, 28, 100], 10, 1);
    expect(itemGap(prev, next).along).toBeLessThan(0);
  });
});

describe("quadFor", () => {
  it("produces an axis-aligned box for upright text", () => {
    const frame = frameFromMatrix(UPRIGHT, 40, 1);
    const quad = quadFor(frame, 0, 40, 8, 2);
    // Top edge 8px above the baseline, bottom edge 2px below it.
    expect(quad.map(round)).toEqual([20, 92, 60, 92, 60, 102, 20, 102]);
  });

  it("rotates the box with the text", () => {
    const frame = frameFromMatrix(ROTATED_90, 40, 1);
    const quad = quadFor(frame, 0, 40, 8, 2);
    // Advance is +y, up is +x: the box runs down the canvas and is offset in x.
    expect(quad.map(round)).toEqual([28, 100, 28, 140, 18, 140, 18, 100]);
  });

  it("covers exactly the requested sub-run", () => {
    const frame = frameFromMatrix(UPRIGHT, 40, 1);
    const quad = quadFor(frame, 10, 25, 8, 2);
    expect(round(quad[0])).toBe(30);
    expect(round(quad[2])).toBe(45);
  });

  it("keeps a positive area even for a zero-width run", () => {
    const frame = frameFromMatrix(UPRIGHT, 40, 1);
    const quad = quadFor(frame, 10, 10, 8, 2);
    expect(quad[1]).not.toBe(quad[5]);
  });
});

describe("containsRtl", () => {
  it("detects Hebrew and Arabic", () => {
    expect(containsRtl("שלום")).toBe(true);
    expect(containsRtl("مرحبا")).toBe(true);
  });

  it("detects a mixed run", () => {
    expect(containsRtl("Patient שם")).toBe(true);
  });

  it("does not flag Latin, Cyrillic or digits", () => {
    expect(containsRtl("Patient name")).toBe(false);
    expect(containsRtl("Привет")).toBe(false);
    expect(containsRtl("054-399-0303")).toBe(false);
  });
});
