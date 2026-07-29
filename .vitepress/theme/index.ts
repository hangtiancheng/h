/// <reference types="vitepress/client" />

import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme-without-fonts";
import { applyAntiCopy } from "@swifty.js/anti-copy/vitepress";
import Mermaid from "./mermaid";
import "./style.css";

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp(ctx) {
    ctx.app.component("Mermaid", Mermaid);
    applyAntiCopy(ctx, {
      mode: "replace",
      replaceText: (selection) =>
        `${selection.slice(0, 60)}${selection.length > 60 ? "…" : ""}\n\n—— 内容来自 Swifty Homepage，转载请注明出处：https://hangtiancheng.github.io/h/`,
      devtools: true,
      onViolation: (e) => console.warn("[anti-copy]", e.type, e.key ?? ""),
    });
  },
};

export default theme;
