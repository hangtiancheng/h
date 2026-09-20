import enData from "./en.json";
import zhData from "./zh.json";
import type { Resume, TitledItem } from "./schema";

export type * from "./schema";

export type Lang = "en" | "zh";

export interface ResumeSection {
  title: string;
  items: (string | TitledItem)[];
}

const en = enData satisfies Resume;
const zh = zhData satisfies Resume;

/** Resume data keyed by the active language. */
export const resumeData: Record<Lang, Resume> = { en, zh };

/** Locale-agnostic section list derived from the resume data. */
export function buildSections(data: Resume): ResumeSection[] {
  return [
    { title: data.headers.skills, items: data.skills },
    { title: data.headers.works, items: data.works },
    { title: data.headers.projects, items: data.projects },
    { title: data.headers.research, items: [data.research] },
  ];
}
