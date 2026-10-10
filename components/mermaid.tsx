"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

type Mermaid = typeof import("mermaid").default;
type RenderResult = Awaited<ReturnType<Mermaid["render"]>>;

let mermaidLoader: Promise<Mermaid> | null = null;
function loadMermaid(): Promise<Mermaid> {
  mermaidLoader ??= import("mermaid").then((mod) => mod.default);
  return mermaidLoader;
}

let idCounter = 0;

export interface MermaidProps {
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
        if (container) result.bindFunctions?.(container);
      }}
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
}
