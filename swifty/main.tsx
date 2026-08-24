/// <reference types="@swifty.js/docs/client" />
/// <reference types="vite/client" />

import { createRoot } from "react-dom/client";
import {
  createContentGuard,
  DocsProvider,
  DocsLayout,
  LocationProvider,
} from "@swifty.js/docs";
import { AntiCopy } from "@swifty.js/anti-copy/swifty-docs";
import { init as initSentry, enablePlugin } from "@swifty.js/sentry";
import {
  ScreenRecordPlugin,
  ExposurePlugin,
  PerformancePlugin,
} from "@swifty.js/sentry/plugins";
import {
  docsConfig,
  loadContent,
  getSearchIndex,
  onContentUpdate,
} from "@swifty-docs/generated";
import "./main.css";

const exposurePlugin = new ExposurePlugin();

if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
  initSentry({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    projectId: "homepage",
  });
  enablePlugin(
    new PerformancePlugin(),
    new ScreenRecordPlugin(),
    exposurePlugin,
  );
}

// export function useExposure(
//   params: Record<string, unknown>,
//   threshold = 0.5,
// ): (node: Element | null) => void {
//   const paramsRef = useRef(params);
//   const cleanupRef = useRef<(() => void) | null>(null);

//   useEffect(() => {
//     paramsRef.current = params;
//   });

//   return useCallback(
//     (node: Element | null) => {
//       cleanupRef.current?.();
//       cleanupRef.current = null;
//       if (node) {
//         exposurePlugin.observe({
//           target: node,
//           threshold,
//           params: paramsRef.current,
//         });
//         cleanupRef.current = () => exposurePlugin.unobserve(node);
//       }
//     },
//     [threshold],
//   );
// }

// Pages encrypted by docsGuardPlugin (frontmatter `protected: true` +
// DOCS_PASSWORD env) prompt for a password; everything else passes through.
const Guard = createContentGuard(loadContent);

const container = document.getElementById("app");
if (container) {
  createRoot(container).render(
    <>
      <Guard.ContentGuard />
      <DocsProvider
        config={docsConfig}
        loadContent={Guard.loadContent}
        getSearchIndex={getSearchIndex}
        onContentUpdate={onContentUpdate}
      >
        <LocationProvider>
          {import.meta.env.PROD && (
            <AntiCopy
              mode="replace"
              replaceText={(selection) =>
                `${selection}\n\n— Copyright © ${new Date().getFullYear()} hangtiancheng. All rights reserved.
Unauthorized reproduction or distribution of this content is prohibited without prior written permission.`
              }
              devtools
            />
          )}
          <DocsLayout />
        </LocationProvider>
      </DocsProvider>
    </>,
  );
}
