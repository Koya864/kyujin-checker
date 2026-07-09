"use client";

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export interface TextItemBox {
  page: number; // 0-based
  str: string;
  /** PDF座標系(左下原点・未スケール) */
  x: number;
  y: number; // ベースライン
  w: number;
  h: number; // 文字高
}

export interface PageSize {
  width: number;
  height: number;
}

export interface ExtractedPdf {
  numPages: number;
  pages: PageSize[];
  items: TextItemBox[];
  fullText: string;
  /** fullTextから空白・改行を除いた文字列 */
  compact: string;
  /** compactの各文字 -> items配列のindex */
  compactMap: number[];
}

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  // pdf.jsは渡したbufferをdetachするため複製して使う
  const copy = data.slice(0);
  return pdfjs.getDocument({ data: copy }).promise;
}

export async function extractPdf(doc: PDFDocumentProxy): Promise<ExtractedPdf> {
  const items: TextItemBox[] = [];
  const pages: PageSize[] = [];
  let fullText = "";
  const compactChars: string[] = [];
  const compactMap: number[] = [];

  for (let p = 0; p < doc.numPages; p++) {
    const page = await doc.getPage(p + 1);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ width: viewport.width, height: viewport.height });

    const content = await page.getTextContent();
    for (const raw of content.items) {
      if (!("str" in raw)) continue;
      const it = raw as {
        str: string;
        transform: number[];
        width: number;
        height: number;
        hasEOL?: boolean;
      };
      const [a, b, c, d, e, f] = it.transform;
      const h = Math.hypot(c, d) || it.height || Math.abs(d) || 8;
      const w = it.width || Math.hypot(a, b) || it.str.length * h * 0.5;

      const index = items.length;
      items.push({ page: p, str: it.str, x: e, y: f, w, h });

      // fullText / compact を構築
      fullText += it.str;
      for (const ch of it.str) {
        if (ch.trim() === "") continue;
        compactChars.push(ch);
        compactMap.push(index);
      }
      if (it.hasEOL) fullText += "\n";
    }
  }

  return {
    numPages: doc.numPages,
    pages,
    items,
    fullText,
    compact: compactChars.join(""),
    compactMap,
  };
}

/** evidence文字列に対応する item index の集合を返す（空白・改行を無視して照合） */
export function locateEvidence(ext: ExtractedPdf, evidence: string): number[] {
  const needle = evidence.replace(/\s+/g, "");
  if (!needle) return [];
  const idx = ext.compact.indexOf(needle);
  if (idx < 0) return [];
  const set = new Set<number>();
  for (let i = idx; i < idx + needle.length; i++) {
    set.add(ext.compactMap[i]);
  }
  return [...set].sort((a, b) => a - b);
}
