/// <reference types="vitepress/client" />

import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme-without-fonts";
import { applyAntiCopy } from "@swifty.js/anti-copy/vitepress";
import Mermaid from "./mermaid";
import "./main.css";

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp(ctx) {
    ctx.app.component("Mermaid", Mermaid);
    applyAntiCopy(ctx, {
      mode: "replace",
      replaceText: (selection) =>
        `${selection}\n\n— Copyright © ${new Date().getFullYear()} hangtiancheng. All rights reserved.
Unauthorized reproduction or distribution of this content is prohibited without prior written permission.`,
      devtools: true,
      onViolation: (e) => console.warn("[anti-copy]", e.type, e.key ?? ""),
    });
  },
};

export default theme;
