/**
 * Regions excluded from protection by default in @swifty.js/docs and
 * @lark.js/docs sites: code blocks (`.codeblock` chrome incl. the copy
 * button), dialogs such as the search palette, and editable controls.
 */
export const DOCS_DEFAULT_EXCLUDES = [
  ".codeblock",
  "[role='dialog']",
  "input",
  "textarea",
  "[contenteditable='true']",
];

function stripTrailingSlash(path: string): string {
  const stripped = path.replace(/\/+$/, "");
  return stripped === "" ? "/" : stripped;
}

/**
 * Whether `path` matches one of the exempt route patterns. A string matches
 * when the current path equals it or starts with it followed by `/` (trailing
 * slashes on either side are ignored); a RegExp is tested against the full
 * path.
 */
export function isPathExcluded(
  path: string,
  patterns: (string | RegExp)[],
): boolean {
  const current = stripTrailingSlash(path);
  return patterns.some((pattern) => {
    if (typeof pattern !== "string") return pattern.test(path);
    const prefix = stripTrailingSlash(pattern);
    return current === prefix || current.startsWith(`${prefix}/`);
  });
}
