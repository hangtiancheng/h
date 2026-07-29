import { AntiCopy } from "@swifty.js/anti-copy/rspress";

/** Global UI component registered via `globalUIComponents` in rspress.config.ts. */
export default function GlobalAntiCopy() {
  return (
    <AntiCopy
      mode="replace"
      replaceText={(selection) =>
        `${selection.slice(0, 60)}${selection.length > 60 ? "…" : ""}\n\n— Source: Swifty Homepage (https://hangtiancheng.github.io/h/). Please attribute when sharing.`
      }
      devtools
      onViolation={(e) => console.warn("[anti-copy]", e.type, e.key ?? "")}
    />
  );
}
