/**
 * Detect full-width punctuation and emoji in Git-tracked files.
 *
 * Usage:
 *   node scripts/check-fullwidth-emoji.js [--exclude "「」·、"] [--write]
 *
 * The --exclude flag accepts a string of characters to skip.
 * The --write flag replaces full-width punctuation with half-width + space in place.
 * Default exclusions: 「 」 · 、
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/** @typedef {{ file: string, line: number, col: number, char: string, codePoint: string, kind: 'fullwidth' | 'emoji' }} Violation */

/**
 * Characters excluded from detection by default.
 * @type {Set<string>}
 */
const DEFAULT_EXCLUDES = new Set(["「", "」", "·", "、"]);

/**
 * Mapping from full-width punctuation to its half-width equivalent.
 * Used by --write mode. Characters not listed here are removed with a space.
 * @type {Record<string, string>}
 */
const FULLWIDTH_TO_HALFWIDTH = {
  "　": " ", // Ideographic Space
  "！": "!",
  "＂": '"',
  "＃": "#",
  "＄": "$",
  "％": "%",
  "＆": "&",
  "＇": "'",
  "（": "(",
  "）": ")",
  "＊": "*",
  "＋": "+",
  "，": ",",
  "－": "-",
  "．": ".",
  "／": "/",
  "：": ":",
  "；": ";",
  "＜": "<",
  "＝": "=",
  "＞": ">",
  "？": "?",
  "＠": "@",
  "［": "[",
  "＼": "\\",
  "］": "]",
  "＾": "^",
  "＿": "_",
  "｀": "`",
  "｛": "{",
  "｜": "|",
  "｝": "}",
  "～": "~",
  "。": ".",
  "、": ",",
  "「": '"',
  "」": '"',
  "『": '"',
  "』": '"',
  "【": "[",
  "】": "]",
  "〔": "[",
  "〕": "]",
  "〖": "[",
  "〗": "]",
  "《": "<",
  "》": ">",
  "〈": "<",
  "〉": ">",
  "﹑": ",",
  "﹔": ";",
  "﹕": ":",
  "﹖": "?",
  "﹗": "!",
  "﹙": "(",
  "﹚": ")",
  "﹛": "{",
  "﹜": "}",
  "﹝": "[",
  "﹞": "]",
  "〜": "~",
  "〃": '"',
  〇: "0",
  "・": "·",
  ー: "-",
  ｰ: "-",
  "｡": ".",
  "｢": '"',
  "｣": '"',
  "､": ",",
  "･": "·",
};

/**
 * Replace all full-width punctuation in content with half-width + trailing space.
 * Emoji are left untouched (cannot be meaningfully converted).
 * @param {string} content - File content
 * @param {Set<string>} excludes - Characters to skip
 * @returns {{ result: string, count: number }}
 */
function replaceFullWidth(content, excludes) {
  let count = 0;
  let result = "";
  for (const ch of content) {
    if (excludes.has(ch)) {
      result += ch;
      continue;
    }
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isFullWidthPunctuation(cp)) {
      const half = FULLWIDTH_TO_HALFWIDTH[ch];
      result += (half !== undefined ? half : "") + " ";
      count++;
    } else {
      result += ch;
    }
  }
  return { result, count };
}

/**
 * Parse CLI arguments and return the exclusion set.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {Set<string>}
 */
function parseExcludes(argv) {
  const excludes = new Set(DEFAULT_EXCLUDES);
  const idx = argv.indexOf("--exclude");
  if (idx !== -1 && argv[idx + 1]) {
    for (const ch of argv[idx + 1]) {
      excludes.add(ch);
    }
  }
  return excludes;
}

/**
 * Get the list of Git-tracked files (relative paths).
 * @returns {string[]}
 */
function getTrackedFiles() {
  const output = execSync("git ls-files", {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split("\n").filter(Boolean);
}

/**
 * Check whether a code point falls in full-width punctuation ranges.
 * Covers CJK symbols, fullwidth forms, halfwidth forms, and CJK compatibility forms.
 * @param {number} cp - Unicode code point
 * @returns {boolean}
 */
function isFullWidthPunctuation(cp) {
  return (
    (cp >= 0x3000 && cp <= 0x303f) || // CJK Symbols and Punctuation
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK Compatibility Forms
    (cp >= 0xfe50 && cp <= 0xfe6f) || // Small Form Variants
    (cp >= 0xff01 && cp <= 0xff0f) || // Fullwidth ! to /
    (cp >= 0xff1a && cp <= 0xff20) || // Fullwidth : to @
    (cp >= 0xff3b && cp <= 0xff40) || // Fullwidth [ to `
    (cp >= 0xff5b && cp <= 0xff65) // Fullwidth { to ･
  );
}

/**
 * Check whether a code point is an emoji.
 * @param {number} cp - Unicode code point
 * @returns {boolean}
 */
function isEmoji(cp) {
  return (
    (cp >= 0x1f600 && cp <= 0x1f64f) || // Emoticons
    (cp >= 0x1f300 && cp <= 0x1f5ff) || // Misc Symbols and Pictographs
    (cp >= 0x1f680 && cp <= 0x1f6ff) || // Transport and Map
    (cp >= 0x1f900 && cp <= 0x1f9ff) || // Supplemental Symbols and Pictographs
    (cp >= 0x1fa00 && cp <= 0x1fa6f) || // Chess Symbols
    (cp >= 0x1fa70 && cp <= 0x1faff) || // Symbols and Pictographs Extended-A
    (cp >= 0x2600 && cp <= 0x26ff) || // Misc Symbols
    (cp >= 0x2700 && cp <= 0x27bf) || // Dingbats
    (cp >= 0xfe00 && cp <= 0xfe0f) || // Variation Selectors
    (cp >= 0x1f1e6 && cp <= 0x1f1ff) || // Regional Indicators (flags)
    (cp >= 0x200d && cp <= 0x200d) || // Zero Width Joiner
    (cp >= 0x231a && cp <= 0x231b) || // Watch / Hourglass
    (cp >= 0x23e9 && cp <= 0x23f3) || // Media control symbols
    (cp >= 0x23f8 && cp <= 0x23fa) || // Media control symbols
    (cp >= 0x25aa && cp <= 0x25ab) || // Small squares
    (cp >= 0x25b6 && cp <= 0x25c0) || // Play buttons
    (cp >= 0x25fb && cp <= 0x25fe) || // Medium squares
    (cp >= 0x2934 && cp <= 0x2935) || // Arrows
    (cp >= 0x2b05 && cp <= 0x2b07) || // Arrows
    (cp >= 0x2b1b && cp <= 0x2b1c) || // Large squares
    (cp >= 0x2b50 && cp <= 0x2b50) || // Star
    (cp >= 0x2b55 && cp <= 0x2b55) || // Circle
    (cp >= 0x3030 && cp <= 0x3030) || // Wavy Dash
    (cp >= 0x303d && cp <= 0x303d) || // Part Alternation Mark
    (cp >= 0x3297 && cp <= 0x3297) || // Circled Ideograph Congratulation
    (cp >= 0x3299 && cp <= 0x3299) || // Circled Ideograph Secret
    (cp >= 0xe0020 && cp <= 0xe007f) // Tags (flag sequences)
  );
}

/**
 * Scan file content for violations.
 * @param {string} filePath - Relative file path
 * @param {string} content - File content
 * @param {Set<string>} excludes - Characters to skip
 * @returns {Violation[]}
 */
function scanContent(filePath, content, excludes) {
  /** @type {Violation[]} */
  const violations = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let col = 0;
    for (const ch of line) {
      col++;
      if (excludes.has(ch)) continue;
      const cp = ch.codePointAt(0);
      if (cp === undefined) continue;

      if (isFullWidthPunctuation(cp)) {
        violations.push({
          file: filePath,
          line: i + 1,
          col,
          char: ch,
          codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
          kind: "fullwidth",
        });
      } else if (isEmoji(cp)) {
        violations.push({
          file: filePath,
          line: i + 1,
          col,
          char: ch,
          codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
          kind: "emoji",
        });
      }
    }
  }
  return violations;
}

/**
 * Determine if a file is likely binary by checking for null bytes.
 * @param {Buffer} buf
 * @returns {boolean}
 */
function isBinary(buf) {
  return buf.includes(0);
}

function main() {
  const argv = process.argv.slice(2);
  const excludes = parseExcludes(argv);
  const write = argv.includes("--write");
  const files = getTrackedFiles();
  /** @type {Violation[]} */
  const allViolations = [];
  let scanned = 0;
  let fixedFiles = 0;
  let fixedCount = 0;

  for (const file of files) {
    const absPath = resolve(file);
    /** @type {Buffer} */
    let buf;
    try {
      buf = readFileSync(absPath);
    } catch {
      continue;
    }
    if (isBinary(buf)) continue;
    scanned++;

    const content = buf.toString("utf-8");

    if (write) {
      const { result, count } = replaceFullWidth(content, excludes);
      if (count > 0) {
        writeFileSync(absPath, result, "utf-8");
        fixedFiles++;
        fixedCount += count;
      }
    }

    allViolations.push(...scanContent(file, content, excludes));
  }

  if (write) {
    if (fixedCount === 0) {
      console.log(`✓ Scanned ${scanned} files, nothing to fix.`);
    } else {
      console.log(
        `✓ Fixed ${fixedCount} full-width character(s) in ${fixedFiles} file(s).`,
      );
    }
    // Re-scan to report remaining emoji (not auto-fixable)
    const remaining = allViolations.filter((v) => v.kind === "emoji");
    if (remaining.length > 0) {
      console.error(
        `\n⚠ ${remaining.length} emoji remain (not auto-replaced):\n`,
      );
      for (const v of remaining) {
        console.error(
          `  ${v.file}:${v.line}:${v.col}  emoji  "${v.char}" (${v.codePoint})`,
        );
      }
      process.exit(1);
    }
    process.exit(0);
  }

  if (allViolations.length === 0) {
    console.log(
      `✓ Scanned ${scanned} files, no full-width punctuation or emoji found.`,
    );
    process.exit(0);
  }

  console.error(
    `✗ Found ${allViolations.length} violation(s) in ${scanned} scanned files:\n`,
  );
  for (const v of allViolations) {
    const label = v.kind === "fullwidth" ? "full-width" : "emoji";
    console.error(
      `  ${v.file}:${v.line}:${v.col}  ${label}  "${v.char}" (${v.codePoint})`,
    );
  }
  process.exit(1);
}

main();
