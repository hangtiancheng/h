import { AntiCopy } from "@swifty.js/anti-copy/rspress";

/** Global UI component registered via `globalUIComponents` in rspress.config.ts. */
export default function GlobalAntiCopy() {
  return (
    <AntiCopy
      mode="replace"
      replaceText={(selection) =>
        `${selection}\n\n— Copyright © ${new Date().getFullYear()} hangtiancheng. All rights reserved.
Unauthorized reproduction or distribution of this content is prohibited without prior written permission.`
      }
      devtools
      onViolation={(e) => console.warn("[anti-copy]", e.type, e.key ?? "")}
    />
  );
}
