"use client";

import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageSize } from "@/lib/pdf";
import type { HighlightSpan } from "@/lib/annotate";
import type { Verdict } from "@/lib/types";

const FILL: Record<Verdict, string> = {
  good: "rgba(151, 196, 89, 0.42)",
  caution: "rgba(239, 159, 39, 0.42)",
  warn: "rgba(226, 75, 74, 0.40)",
};

export default function PdfViewer({
  doc,
  pages,
  spans,
  scale = 1.4,
  scrollToSpan,
}: {
  doc: PDFDocumentProxy;
  pages: PageSize[];
  spans: HighlightSpan[];
  scale?: number;
  scrollToSpan?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const renderedRef = useRef(false);

  useEffect(() => {
    if (renderedRef.current) return;
    renderedRef.current = true;
    let cancelled = false;

    (async () => {
      for (let p = 0; p < doc.numPages; p++) {
        if (cancelled) return;
        const page = await doc.getPage(p + 1);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRefs.current[p];
        if (!canvas) continue;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, scale]);

  // 指定spanの最初のボックスへスクロール
  useEffect(() => {
    if (scrollToSpan == null) return;
    const span = spans[scrollToSpan];
    const box = span?.boxes[0];
    if (!box) return;
    const pageEl = containerRef.current?.querySelector<HTMLElement>(
      `[data-page="${box.page}"]`
    );
    pageEl?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scrollToSpan, spans]);

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-4">
      {pages.map((pg, p) => (
        <div
          key={p}
          data-page={p}
          className="relative shadow-sm ring-1 ring-black/10"
          style={{ width: pg.width * scale, height: pg.height * scale }}
        >
          <canvas
            ref={(el) => {
              canvasRefs.current[p] = el;
            }}
          />
          {spans.map((span, si) =>
            span.boxes
              .filter((b) => b.page === p)
              .map((b, bi) => {
                const left = b.x * scale;
                const top = (pg.height - (b.y + b.h)) * scale;
                const isActive = scrollToSpan === si;
                return (
                  <div
                    key={`${si}-${bi}`}
                    className="pointer-events-none absolute rounded-[2px]"
                    style={{
                      left,
                      top,
                      width: b.w * scale,
                      height: b.h * scale,
                      background: FILL[span.verdict],
                      outline: isActive ? "2px solid rgba(0,0,0,0.55)" : "none",
                    }}
                  />
                );
              })
          )}
        </div>
      ))}
    </div>
  );
}
