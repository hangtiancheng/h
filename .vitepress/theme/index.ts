/// <reference types="vitepress/client" />

import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme-without-fonts";
import Mermaid from "./Mermaid.vue";
import "./style.css";

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("Mermaid", Mermaid);
  },
};

export default theme;
