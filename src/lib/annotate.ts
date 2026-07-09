"use client";

import { PDFDocument, rgb } from "pdf-lib";
import type { Verdict } from "./types";
import type { TextItemBox } from "./pdf";

export interface HighlightSpan {
  verdict: Verdict;
  boxes: TextItemBox[];
}

const COLORS: Record<Verdict, { r: number; g: number; b: number }> = {
  good: { r: 0.72, g: 0.85, b: 0.55 },
  caution: { r: 0.98, g: 0.78, b: 0.42 },
  warn: { r: 0.95, g: 0.55, b: 0.55 },
};

/** 元PDFにハイライトを焼き込み、Uint8Arrayで返す */
export async function annotatePdf(
  original: ArrayBuffer,
  spans: HighlightSpan[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original);
  const pages = doc.getPages();

  for (const span of spans) {
    const col = COLORS[span.verdict];
    for (const box of span.boxes) {
      const page = pages[box.page];
      if (!page) continue;
      const pad = box.h * 0.12;
      page.drawRectangle({
        x: box.x - pad,
        y: box.y - pad,
        width: box.w + pad * 2,
        height: box.h + pad * 2,
        color: rgb(col.r, col.g, col.b),
        opacity: 0.4,
      });
    }
  }

  return doc.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
