import data from "./standards.json";

export interface Criterion {
  key: string;
  label: string;
  good: string;
  caution: string;
  warn: string;
  note: string;
}
export interface TrapWord {
  term: string;
  why: string;
}
export interface Standards {
  version: string;
  description: string;
  criteria: Criterion[];
  trap_words: TrapWord[];
}

const standards = data as Standards;
export default standards;
