"use client";

import { useEffect, useState } from "react";
import { createAntiCopy } from "@yukino.js/anti-copy";
import { buildSections, resumeData, type Lang } from "@/lib/resume";
import { ArtPlum } from "./art-plum";
import { ResumeHeader } from "./resume-header";
import { SectionEdu } from "./section-edu";
import { SectionList } from "./section-list";

/** Root resume view: locale state, copy protection and section layout. */
export function Resume() {
  const [lang, setLang] = useState<Lang>("en");
  const data = resumeData[lang];

  useEffect(() => {
    // Copy protection is scoped to the resume page; it detaches on unmount
    // so the rest of the site (e.g. MDX copy buttons) stays unaffected.
    const antiCopy = createAntiCopy({
      mode: "replace",
      print: false,
      devtools: true,
      copy: false,
    });
    antiCopy.enable();

    return () => antiCopy.destroy();
  }, []);

  return (
    // `id` anchors the print rule in global.css that hides the site nav
    <div id="resume" className="w-full text-fd-foreground">
      <ArtPlum />
      {/* `relative` stacks the content above the fixed <ArtPlum/> canvas. */}
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 pt-4 pb-8 md:px-8 md:pb-12">
        <ResumeHeader
          name={data.name}
          about={data.about}
          tel={data.tel}
          email={data.email}
          github={data.github}
          labels={data.labels}
          onToggleLocale={() =>
            setLang((prev) => (prev === "en" ? "zh" : "en"))
          }
        />

        <SectionEdu header={data.headers.edu} edu={data.edu} />

        {buildSections(data).map((section) => (
          <SectionList
            key={section.title}
            heading={section.title}
            items={section.items}
          />
        ))}
      </div>
    </div>
  );
}
