"use client";

import { useState, type ReactNode } from "react";
import type { Labels } from "@/lib/resume/schema";

// Public asset URLs are not resolved against basePath, so carry /h manually
const AVATAR_URL = "/h/avatar.jpeg";

interface ResumeHeaderProps {
  name: string;
  about: string;
  tel: string;
  email: string;
  github: string;
  /** Locale-aware chrome labels (contact chips, language toggle button). */
  labels: Labels;
  /** Fired when the language toggle button is clicked. */
  onToggleLocale: () => void;
}

function ContactChip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * Resume header. Data arrives through props; the language toggle is
 * delegated to the parent via `onToggleLocale`. Keeps its own state only
 * for the enlarged avatar overlay.
 */
export function ResumeHeader({
  name,
  about,
  tel,
  email,
  github,
  labels,
  onToggleLocale,
}: ResumeHeaderProps) {
  const [previewing, setPreviewing] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border bg-fd-card p-4 shadow-lg">
        <img
          src={AVATAR_URL}
          alt={name}
          width={64}
          height={64}
          className="size-16 shrink-0 cursor-zoom-in rounded-md border object-cover"
          fetchPriority="low"
          onClick={() => setPreviewing(true)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-semibold text-fd-foreground">{name}</h1>
            <button
              type="button"
              className="rounded-md border bg-fd-secondary px-2 py-0.5 text-xs font-medium text-fd-secondary-foreground transition-colors hover:bg-fd-accent print:hidden"
              onClick={onToggleLocale}
            >
              {labels.switch}
            </button>
          </div>
          <p className="mt-1 text-xs text-fd-muted-foreground">{about}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <ContactChip label={labels.tel}>
              <a
                href={`tel:${tel}`}
                className="text-fd-foreground hover:text-brand hover:underline"
              >
                {tel}
              </a>
            </ContactChip>
            <ContactChip label={labels.email}>
              <a
                href={`mailto:${email}`}
                className="text-fd-foreground hover:text-brand hover:underline"
              >
                {email}
              </a>
            </ContactChip>
            <ContactChip label={labels.github}>
              <a
                href={`https://github.com/${github}`}
                className="text-fd-foreground hover:text-brand hover:underline"
                target="_blank"
                rel="noopener"
              >
                https://github.com/{github}
              </a>
            </ContactChip>
          </div>
        </div>
      </div>

      {previewing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(event) => {
            // Clicking the enlarged image itself must not dismiss.
            if (
              event.target instanceof HTMLElement &&
              event.target.tagName === "IMG"
            )
              return;
            setPreviewing(false);
          }}
        >
          <img
            src={AVATAR_URL}
            alt={name}
            className="max-h-[80vh] max-w-[80vw] rounded-lg shadow-2xl"
          />
        </div>
      ) : null}
    </>
  );
}
