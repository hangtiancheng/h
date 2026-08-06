---
name: update-docs
description: Review all documentation under /Users/hangtiancheng/github/h/docs by delegating parallel subagents, then fix only clear factual/technical errors following a minimal-fix principle. Before any work, ask the user which files or directories to exclude from fixing. Use when the user asks to review, audit, proofread, or fix the docs directory, or invokes /update-docs.
---

# Update Docs

## Overview

Orchestrate a parallel, multi-subagent review of every document under
`/Users/hangtiancheng/github/h/docs`, then apply minimal fixes for clear errors
only. Paths excluded by the user are skipped entirely for the round.

## Workflow

Follow these phases strictly in order.

### Phase 1: Ask for exclusions (MANDATORY, before any review)

Use `AskUserQuestion` to ask the user whether there are any documents or
directories they do NOT want fixed in this round. Offer at least:

- "No exclusions — review and fix everything"
- "Let me specify paths to exclude" (user supplies paths via Other/notes)

If the user specifies exclusions, record them as a skip list. Excluded files
and directories MUST be skipped entirely this round: do not modify them and do
not delegate review work for them.

### Phase 2: Inventory and partition

1. Enumerate all documentation files under `/Users/hangtiancheng/github/h/docs`
   (typically `**/*.md` and `**/*.mdx`), e.g. with Glob or
   `find docs -type f \( -name "*.md" -o -name "*.mdx" \)`.
2. Remove every file matching the skip list from Phase 1.
3. Partition the remaining files into balanced batches — group by subdirectory
   when possible so each subagent works within one topic area. Aim for roughly
   3–8 batches depending on file count.

### Phase 3: Parallel review and fix via subagents

Launch one subagent per batch using the `Agent` tool (subagent_type:
`general-purpose`), all in a SINGLE message so they run concurrently.

Each subagent prompt MUST include:

- The exact list of file paths in its batch (never "the docs directory").
- The instruction to read each file fully, verify the technical knowledge it
  states, and fix only clear errors by editing the file in place.
- The minimal-fix principle stated verbatim (see below).
- The instruction to report back a short list of `file: what was fixed and why`
  entries, or "no clear errors found" per file — under 300 words total.

### Phase 4: Consolidate and report

1. Collect all subagent reports.
2. Check `git status` / `git diff --stat` for changes under excluded paths.
   Never revert them — the user may have edited those files themselves.
   Simply ignore excluded paths; do not touch them in any way.
3. Present a summary to the user: files reviewed, files fixed with one-line
   reasons, files skipped due to exclusions, and files with no issues.
4. Do NOT commit unless the user explicitly asks.

## Minimal-Fix Principle (MUST follow)

Include this verbatim in every subagent prompt:

> Apply the minimal-fix principle. Only fix statements that are CLEARLY and
> unambiguously wrong — factual/technical errors such as incorrect API names,
> wrong code that would not run as described, false claims about behavior,
> broken internal logic, or contradictions within the document. Do NOT rewrite
> for style, tone, wording, formatting, or completeness. Do NOT restructure
> content, add new sections, or "improve" explanations. When correctness is
> debatable or depends on version/context, leave the text unchanged and report
> it instead of editing. Keep each edit as small as possible.

## Constraints

- Never skip Phase 1. If the user has already stated exclusions in their
  request, confirm them instead of re-asking from scratch.
- Subagents edit files directly; the orchestrator does not re-do their edits,
  only spot-checks via `git diff` when reports look suspicious.
- If the docs tree is very small (fewer than ~5 files), a single subagent or
  direct review is acceptable; parallelism is a means, not the goal.
