"use client";

import { useEffect, useRef, useState } from "react";
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
  maxScale = 1.5,
  scrollToSpan,
  verdictFilter = "all",
}: {
  doc: PDFDocumentProxy;
  pages: PageSize[];
  spans: HighlightSpan[];
  maxScale?: number;
  scrollToSpan?: number | null;
  verdictFilter?: "all" | "good" | "concern";
}) {
  const spanVisible = (v: Verdict) =>
    verdictFilter === "all" ||
    (verdictFilter === "good" ? v === "good" : v !== "good");
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [scale, setScale] = useState(1);

  // コンテナ幅に合わせてスケールを自動調整（横見切れ防止・スマホ対応）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxPageW = Math.max(...pages.map((p) => p.width), 1);
    const compute = () => {
      const w = el.clientWidth;
      if (w > 0) {
        setScale(Math.min(maxScale, Math.max(0.2, w / maxPageW)));
      }
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pages, maxScale]);

  useEffect(() => {
    let cancelled = false;
    const tasks: { cancel: () => void }[] = [];

    (async () => {
      for (let p = 0; p < doc.numPages; p++) {
        if (cancelled) return;
        const page = await doc.getPage(p + 1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRefs.current[p];
        if (!canvas) continue;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const task = page.render({ canvas, canvasContext: ctx, viewport });
        tasks.push(task);
        try {
          await task.promise;
        } catch {
          // レンダリングがキャンセルされた場合は無視
        }
      }
    })();

    // 開発モードの二重実行や再マウント時は、進行中の描画をキャンセルして再描画できるようにする
    return () => {
      cancelled = true;
      for (const t of tasks) t.cancel();
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
    <div ref={containerRef} className="flex w-full flex-col items-center gap-4">
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
            (spanVisible(span.verdict) ? span.boxes : [])
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
