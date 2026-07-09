export type Verdict = "good" | "caution" | "warn";

export interface Finding {
  /** standards.json の criteria.key（未対応なら "other"） */
  key: string;
  /** 項目名（例: 年間休日） */
  label: string;
  verdict: Verdict;
  /** 判定の一言サマリ（例: 120日で好条件） */
  summary: string;
  /** 求職者に伝えるべき補足・確認ポイント */
  comment: string;
  /** 判定根拠になった原文の抜粋（本文からの逐語コピー） */
  evidence: string[];
}

export interface AnalysisResult {
  /** A/B/C の総合判定 */
  grade: "A" | "B" | "C";
  /** 総合所見 */
  overall: string;
  company?: string;
  jobTitle?: string;
  findings: Finding[];
}
