import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import standards from "@/lib/standards";
import type { AnalysisResult, Verdict } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

function buildSystemPrompt(): string {
  const criteria = standards.criteria
    .map(
      (c) =>
        `- ${c.label}(key: ${c.key})\n    好条件: ${c.good}\n    要確認: ${c.caution}\n    要注意: ${c.warn}\n    観点: ${c.note}`
    )
    .join("\n");
  const traps = standards.trap_words
    .map((t) => `- 「${t.term}」: ${t.why}`)
    .join("\n");

  return `あなたは転職エージェント向けに求人票を精査する専門アナリストです。
求人票の本文（プレーンテキスト）を渡すので、以下の【業界基準ナレッジ】に照らして各項目を判定してください。

# 判定の原則
- 表面のキャッチコピー（「未経験歓迎」「月給25万円以上」等）と、実際の応募条件・給与内訳のギャップを必ず見抜く。
- 「月給◯万円」が固定残業込みかどうか、基本給の実額、試用期間中の減額を重視する。
- 記載が「ない」こと自体も判断材料（例: 残業時間の記載なし → 要確認）。
- 各判定には、必ず本文からの**逐語の抜粋**（evidence）を1つ以上添える。抜粋は渡された本文に一字一句そのまま存在する文字列にすること（要約・改変禁止）。短く要点だけを抜く。

# 業界基準ナレッジ
${criteria}

# 見落としやすい罠ワード
${traps}

# 出力
必ず次のJSONだけを出力（前後に説明文やコードフェンスを付けない）:
{
  "grade": "A" | "B" | "C",            // A=好条件, B=要確認あり, C=要注意多い
  "overall": "総合所見（2〜3文）",
  "company": "採用企業名（分かれば）",
  "jobTitle": "求人名（分かれば）",
  "findings": [
    {
      "key": "annual_holidays 等のkey。該当なしはother",
      "label": "項目名",
      "verdict": "good" | "caution" | "warn",
      "summary": "判定の一言サマリ",
      "comment": "求職者に伝えるべき補足・確認ポイント",
      "evidence": ["本文からの逐語抜粋", "..."]
    }
  ]
}
findingsは重要な項目を優先し、該当のある基準を網羅する。良い点・注意点の両方を挙げること。`;
}

function extractJson(text: string): AnalysisResult {
  let t = text.trim();
  // コードフェンスが付いた場合の保険
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t) as AnalysisResult;
}

/** APIキーなしでUIを検証するためのモック（MOCK_ANALYZE=1 のときのみ） */
function mockAnalyze(text: string): AnalysisResult {
  const probes: {
    key: string;
    label: string;
    verdict: Verdict;
    terms: string[];
    summary: string;
    comment: string;
  }[] = [
    { key: "annual_holidays", label: "年間休日", verdict: "good", terms: ["年間休日120日以上", "年間休日124日以上", "年休126日", "年間休日120", "年間休日"], summary: "年間休日が明記されており好条件", comment: "120日以上あれば休日は充実。日数の明記を確認。" },
    { key: "holiday_type", label: "休日区分", verdict: "good", terms: ["完全週休2日制"], summary: "完全週休2日制で毎週2日休める", comment: "『週休2日制』との違いに注意。ここは完全週休2日制。" },
    { key: "fixed_overtime", label: "固定残業代", verdict: "warn", terms: ["残業45h含む", "固定残業代", "固定時間外手当", "45時間相当分の固定残業代"], summary: "月給に固定残業代が含まれる", comment: "基本給の実額と超過分の支給有無を要確認。" },
    { key: "bonus", label: "賞与", verdict: "caution", terms: ["賞与"], summary: "賞与の記載を確認", comment: "『なし』の場合はインセンティブ設計を要説明。" },
    { key: "trial_period", label: "試用期間", verdict: "caution", terms: ["試用期間中は月給23.2万円以上", "試用期間"], summary: "試用期間の条件を確認", comment: "試用期間中の減額有無・期間を確認。" },
    { key: "work_location", label: "勤務地", verdict: "caution", terms: ["レンタルオフィスを借りる予定", "レンタルオフィス"], summary: "勤務地が未確定の可能性", comment: "拠点が実在・確定しているかを確認。" },
  ];
  const findings = probes
    .map((p) => {
      const ev = p.terms.find((t) => text.includes(t));
      if (!ev) return null;
      return { key: p.key, label: p.label, verdict: p.verdict, summary: p.summary, comment: p.comment, evidence: [ev] };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const warns = findings.filter((f) => f.verdict === "warn").length;
  const grade = warns >= 2 ? "C" : warns === 1 ? "B" : "A";
  return {
    grade,
    overall: "【モック判定】APIキー未設定のためサンプル判定を表示しています。本番ではClaudeが本文全体を精査します。",
    company: "(モック)",
    jobTitle: "(モック判定)",
    findings,
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const mock = process.env.MOCK_ANALYZE === "1";
  if (!apiKey && !mock) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が未設定です。.env.local に設定してください。" },
      { status: 500 }
    );
  }

  let text: string;
  try {
    const body = await req.json();
    text = (body?.text ?? "").toString();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400 });
  }
  if (!text.trim()) {
    return NextResponse.json({ error: "求人票のテキストが空です。" }, { status: 400 });
  }
  // 過度に長い場合の安全弁
  const clipped = text.slice(0, 24000);

  if (!apiKey && mock) {
    return NextResponse.json(mockAnalyze(clipped));
  }

  const client = new Anthropic({ apiKey: apiKey! });
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: `以下が求人票の本文です。JSONで判定を返してください。\n\n----- 求人票本文ここから -----\n${clipped}\n----- 求人票本文ここまで -----`,
        },
      ],
    });
    const textPart = msg.content.find((c) => c.type === "text");
    const raw = textPart && textPart.type === "text" ? textPart.text : "";
    const result = extractJson(raw);
    if (!Array.isArray(result.findings)) {
      throw new Error("findings がありません");
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "判定に失敗しました。";
    return NextResponse.json({ error: `判定エラー: ${message}` }, { status: 502 });
  }
}
