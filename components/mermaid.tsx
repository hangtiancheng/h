"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

// Mermaid is heavy and DOM-only: load it lazily on the client and share one
// instance across every diagram on the page.
type Mermaid = typeof import("mermaid").default;
type RenderResult = Awaited<ReturnType<Mermaid["render"]>>;

let mermaidLoader: Promise<Mermaid> | null = null;
function loadMermaid(): Promise<Mermaid> {
  mermaidLoader ??= import("mermaid").then((mod) => mod.default);
  return mermaidLoader;
}

let idCounter = 0;

export interface MermaidProps {
  /** raw mermaid diagram source, injected by `remarkMdxMermaid` */
  chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
  const { resolvedTheme } = useTheme();
  const [result, setResult] = useState<RenderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const idRef = useRef<string | null>(null);
  if (idRef.current === null) {
    idCounter += 1;
    idRef.current = `mermaid-${idCounter}`;
  }

  useEffect(() => {
    // Wait for next-themes to resolve so we render once with the right theme
    // instead of flashing light -> dark.
    if (resolvedTheme === undefined) return;

    let cancelled = false;
    loadMermaid()
      .then(async (m) => {
        m.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: resolvedTheme === "dark" ? "dark" : "default",
          fontFamily: "inherit",
        });
        const rendered = await m.render(
          idRef.current ?? "mermaid",
          // unescape literal "\n" so direct <Mermaid chart="..." /> usage works too
          chart.replaceAll("\\n", "\n"),
        );
        if (cancelled) return;
        setResult(rendered);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [chart, resolvedTheme]);

  // Parse/render failure: fall back to the raw source so content is never lost.
  if (error !== null) {
    return (
      <div className="not-prose my-4 rounded-lg border border-red-500/40 bg-red-500/5 p-4">
        <p className="mb-2 text-sm text-red-600 dark:text-red-400">
          Mermaid rendering failed: {error}
        </p>
        <pre className="overflow-x-auto text-xs">
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  // Before the diagram is ready (SSR / lazy load), show the source as a
  // placeholder to avoid an empty gap.
  if (result === null) {
    return (
      <pre className="not-prose my-4 overflow-x-auto rounded-lg border bg-fd-muted/40 p-4 text-xs">
        <code>{chart}</code>
      </pre>
    );
  }

  return (
    <div
      className="mermaid-diagram not-prose my-4 flex justify-center overflow-x-auto"
      ref={(container) => {
        // attach click/interaction handlers after the svg is in the DOM
        if (container) result.bindFunctions?.(container);
      }}
      // The SVG is produced locally by mermaid from our own MDX source.
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
}
