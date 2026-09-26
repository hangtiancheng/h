import React from "react";
import { createComponent, type EventName } from "@lit/react";
import { WcResumeElement } from "./wc-resume";
import type { ToggleLocaleEvent } from "./resume-header";

export const ReactResume = createComponent({
  tagName: "wc-resume",
  elementClass: WcResumeElement,
  react: React,
  events: {
    onToggleLocale: "toggle-locale" as EventName<ToggleLocaleEvent>,
  },
});
