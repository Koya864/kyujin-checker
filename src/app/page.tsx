"use client";

import { useCallback, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { AnalysisResult, Verdict, Finding } from "@/lib/types";
import type { ExtractedPdf } from "@/lib/pdf";
import type { HighlightSpan } from "@/lib/annotate";
import PdfViewer from "@/components/PdfViewer";

const VERDICT_META: Record<Verdict, { label: string; badge: string; dot: string }> = {
  good: { label: "好条件", badge: "bg-lime-100 text-lime-800", dot: "bg-lime-400" },
  caution: { label: "要確認", badge: "bg-amber-100 text-amber-800", dot: "bg-amber-400" },
  warn: { label: "要注意", badge: "bg-red-100 text-red-700", dot: "bg-red-400" },
};

const GRADE_META: Record<string, { badge: string; text: string }> = {
  A: { badge: "bg-lime-100 text-lime-800", text: "好条件" },
  B: { badge: "bg-amber-100 text-amber-800", text: "要確認あり" },
  C: { badge: "bg-red-100 text-red-700", text: "要注意が多い" },
};

type Phase = "idle" | "reading" | "analyzing" | "done" | "error";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [ext, setExt] = useState<ExtractedPdf | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [spans, setSpans] = useState<HighlightSpan[]>([]);
  const [activeSpan, setActiveSpan] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "good" | "concern">("all");
  const bufRef = useRef<ArrayBuffer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setResult(null);
    setSpans([]);
    setActiveSpan(null);
    setFilter("all");
    setFileName(file.name);
    setPhase("reading");
    try {
      const pdfmod = await import("@/lib/pdf");
      const buf = await file.arrayBuffer();
      bufRef.current = buf;
      const loaded = await pdfmod.loadPdf(buf);
      const extracted = await pdfmod.extractPdf(loaded);
      setDoc(loaded);
      setExt(extracted);

      setPhase("analyzing");
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: extracted.fullText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "判定に失敗しました。");
      const analysis = data as AnalysisResult;

      const builtSpans: HighlightSpan[] = analysis.findings.map((f) => {
        const boxes = f.evidence
          .flatMap((ev) => pdfmod.locateEvidence(extracted, ev))
          .map((i) => extracted.items[i]);
        return { verdict: f.verdict, boxes };
      });
      setResult(analysis);
      setSpans(builtSpans);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました。");
      setPhase("error");
    }
  }, []);

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === "application/pdf") handleFile(f);
  };

  const downloadAnnotated = async () => {
    if (!bufRef.current || !spans.length) return;
    const { annotatePdf, downloadBytes } = await import("@/lib/annotate");
    const bytes = await annotatePdf(bufRef.current.slice(0), spans);
    const base = fileName.replace(/\.pdf$/i, "");
    downloadBytes(bytes, `${base}_判定マーカー付き.pdf`);
  };

  const busy = phase === "reading" || phase === "analyzing";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">求人チェッカー</h1>
        <p className="mt-1 text-sm text-gray-500">
          求人票PDFを取り込み、業界基準で条件を判定してマーカーを引きます。
        </p>
      </header>

      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="mb-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center"
      >
        <p className="text-sm text-gray-600">求人票PDFをここにドラッグ、または</p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          ファイルを選択
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={onInput}
        />
        {fileName && <p className="mt-3 text-xs text-gray-500">{fileName}</p>}
      </div>

      {busy && (
        <div className="mb-6 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {phase === "reading" ? "PDFを読み込み中…" : "業界基準と照合して判定中…"}
        </div>
      )}
      {phase === "error" && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && doc && ext && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          <div className="order-2 max-h-[80vh] overflow-auto rounded-xl border border-gray-200 bg-gray-100 p-4 lg:order-1">
            <PdfViewer
              doc={doc}
              pages={ext.pages}
              spans={spans}
              scrollToSpan={activeSpan}
              verdictFilter={filter}
            />
          </div>

          <aside className="order-1 lg:order-2">
            <div className="sticky top-4 space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">総合判定</p>
                    <p className="truncate text-lg font-semibold">
                      {result.company || "―"}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {result.jobTitle}
                    </p>
                  </div>
                  <div
                    className={`shrink-0 rounded-lg px-3 py-2 text-center ${
                      GRADE_META[result.grade]?.badge || "bg-gray-100"
                    }`}
                  >
                    <div className="text-2xl font-bold leading-none">
                      {result.grade}
                    </div>
                    <div className="mt-1 text-[11px]">
                      {GRADE_META[result.grade]?.text}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-700">{result.overall}</p>
                <button
                  onClick={downloadAnnotated}
                  className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  マーカー付きPDFをダウンロード
                </button>
              </div>

              {(result.jobSummary ||
                (result.jobDuties?.length ?? 0) > 0 ||
                result.companyProfile) && (
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  {result.jobSummary && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-500">
                        どんな仕事？
                      </p>
                      <p className="mt-1 text-sm text-gray-800">
                        {result.jobSummary}
                      </p>
                    </div>
                  )}
                  {(result.jobDuties?.length ?? 0) > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-500">
                        具体的な仕事内容
                      </p>
                      <ul className="mt-1 list-disc pl-5 text-sm text-gray-800">
                        {result.jobDuties!.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.companyProfile && (
                    <div>
                      <p className="text-xs font-medium text-gray-500">
                        勤務先について
                      </p>
                      <p className="mt-1 text-sm text-gray-800">
                        {result.companyProfile}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {(() => {
                const indexed = result.findings.map((f, i) => ({ f, i }));
                const goods = indexed.filter((x) => x.f.verdict === "good");
                const concerns = [
                  ...indexed.filter((x) => x.f.verdict === "warn"),
                  ...indexed.filter((x) => x.f.verdict === "caution"),
                ];
                const tabs: { key: typeof filter; label: string }[] = [
                  { key: "all", label: `すべて（${indexed.length}）` },
                  { key: "good", label: `好条件（${goods.length}）` },
                  { key: "concern", label: `要注意・要確認（${concerns.length}）` },
                ];
                const showGood = filter === "all" || filter === "good";
                const showConcern = filter === "all" || filter === "concern";

                const card = (
                  { f, i }: { f: Finding; i: number },
                  n: number
                ) => {
                  const meta = VERDICT_META[f.verdict];
                  const active = activeSpan === i;
                  const hasBoxes = (spans[i]?.boxes.length ?? 0) > 0;
                  return (
                    <li key={i}>
                      <button
                        onClick={() => setActiveSpan(active ? null : i)}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          active
                            ? "border-gray-900 bg-gray-50"
                            : "border-gray-200 bg-white hover:border-gray-400"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-medium text-white">
                            {n}
                          </span>
                          <span className="text-sm font-medium">{f.label}</span>
                          <span
                            className={`ml-auto rounded px-2 py-0.5 text-[11px] ${meta.badge}`}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-gray-800">{f.summary}</p>
                        {f.comment && (
                          <p className="mt-1 text-xs text-gray-500">{f.comment}</p>
                        )}
                        {!hasBoxes && (
                          <p className="mt-1 text-[11px] text-gray-400">
                            （該当箇所の自動特定なし）
                          </p>
                        )}
                      </button>
                    </li>
                  );
                };

                return (
                  <div className="space-y-4">
                    <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                      {tabs.map((t) => (
                        <button
                          key={t.key}
                          onClick={() => setFilter(t.key)}
                          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                            filter === t.key
                              ? "bg-white text-gray-900 shadow-sm"
                              : "text-gray-500 hover:text-gray-800"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {showGood && goods.length > 0 && (
                      <div>
                        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-lime-700">
                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-lime-400" />
                          好条件（{goods.length}件）
                        </p>
                        <ul className="space-y-2">
                          {goods.map((x, idx) => card(x, idx + 1))}
                        </ul>
                      </div>
                    )}
                    {showConcern && concerns.length > 0 && (
                      <div>
                        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-red-700">
                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400" />
                          要注意・要確認（{concerns.length}件）
                        </p>
                        <ul className="space-y-2">
                          {concerns.map((x, idx) => card(x, idx + 1))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
