#!/usr/bin/env node
// @ts-check

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ *
 * Constants (mirror docs/mock.py)
 * ------------------------------------------------------------------ */

const REPO_ROOT = path.dirname(
  path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))),
);
const MAIN_PY = path.join(REPO_ROOT, "main.py");
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "logs");

/** @type {readonly [string, string]} */
const SETTINGS = ["tcp_only", "udp_burst"];
const SWIFT_GAIN_MIN = 0.02;
const SWIFT_GAIN_MAX = 0.06;
const SWIFT_DELAY_MIN = 0.96;
const SWIFT_DELAY_MAX = 1.02;
const FAIRNESS_TOLERANCE = 0.002;
const UDP_DUTY_CYCLE = 0.5;
const UDP_AVERAGE_LOAD_FRACTION = 0.32;
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DATA_PACKET_BYTES = 1480;
const ACK_PACKET_BYTES = 52;
const UDP_PACKET_BYTES = 1052;
const TCP_PORT = 5000;
const UDP_PORT = 7000;

/* ------------------------------------------------------------------ *
 * Python exception types
 * ------------------------------------------------------------------ */

/** Mirrors Python's `ValueError`. */
class ValueError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "ValueError";
  }
}

/** Mirrors Python's `FileNotFoundError`. */
class FileNotFoundError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "FileNotFoundError";
  }
}

/** Mirrors Python's `statistics.StatisticsError`. */
class StatisticsError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "StatisticsError";
  }
}

/* ------------------------------------------------------------------ *
 * Exact floating point helpers (Python-compatible rounding/formatting)
 * ------------------------------------------------------------------ */

/** Reused scratch buffer for decomposing doubles. */
const FLOAT_VIEW = new DataView(new ArrayBuffer(8));

/** @type {Map<number, bigint>} */
const POW5_CACHE = new Map();
/** @type {Map<number, bigint>} */
const POW10_CACHE = new Map();

/** @param {number} exponent @returns {bigint} */
function pow5(exponent) {
  let cached = POW5_CACHE.get(exponent);
  if (cached === undefined) {
    cached = 5n ** BigInt(exponent);
    POW5_CACHE.set(exponent, cached);
  }
  return cached;
}

/** @param {number} exponent @returns {bigint} */
function pow10(exponent) {
  let cached = POW10_CACHE.get(exponent);
  if (cached === undefined) {
    cached = 10n ** BigInt(exponent);
    POW10_CACHE.set(exponent, cached);
  }
  return cached;
}

/**
 * Decompose a finite double into its exact binary significand and exponent.
 *
 * @param {number} value A finite double.
 * @returns {{negative: boolean, significand: bigint, exponent: number}}
 *   `value === (negative ? -1 : 1) * Number(significand) * 2 ** exponent`.
 */
function binaryParts(value) {
  FLOAT_VIEW.setFloat64(0, value);
  const bits = FLOAT_VIEW.getBigUint64(0);
  const negative = bits >> 63n === 1n;
  const biasedExponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  if (biasedExponent === 0) {
    return { negative, significand: fraction, exponent: -1074 };
  }
  return {
    negative,
    significand: fraction | (1n << 52n),
    exponent: biasedExponent - 1075,
  };
}

/**
 * Exact decimal expansion of a finite double.
 *
 * @param {number} value A finite double.
 * @returns {{negative: boolean, digits: bigint, scale: number}}
 *   `value === (negative ? -1 : 1) * digits * 10 ** -scale` exactly.
 */
function exactDecimal(value) {
  const { negative, significand, exponent } = binaryParts(value);
  if (significand === 0n) return { negative, digits: 0n, scale: 0 };
  if (exponent >= 0) {
    return { negative, digits: significand << BigInt(exponent), scale: 0 };
  }
  const scale = -exponent;
  return { negative, digits: significand * pow5(scale), scale };
}

/**
 * Round `digits / 10 ** shift` to the nearest integer, ties to even.
 *
 * @param {bigint} digits Non-negative magnitude.
 * @param {number} shift
 * @returns {bigint}
 */
function roundHalfEvenDiv(digits, shift) {
  if (shift === 0) return digits;
  const divisor = pow10(shift);
  const quotient = digits / divisor;
  const remainder = digits % divisor;
  const twice = remainder * 2n;
  if (twice > divisor || (twice === divisor && (quotient & 1n) === 1n)) {
    return quotient + 1n;
  }
  return quotient;
}

/**
 * Convert an exact decimal (`digits * 10 ** -scale`) to the nearest double.
 * Relies on ECMAScript's correctly-rounded decimal-to-number conversion.
 *
 * @param {bigint} digits Non-negative magnitude.
 * @param {number} scale
 * @returns {number}
 */
function decimalToDouble(digits, scale) {
  const text = digits.toString();
  if (scale === 0) return Number(text);
  if (scale > 0) {
    if (text.length > scale) {
      return Number(
        `${text.slice(0, text.length - scale)}.${text.slice(text.length - scale)}`,
      );
    }
    return Number(`0.${"0".repeat(scale - text.length)}${text}`);
  }
  return Number(`${text}e${-scale}`);
}

/**
 * Python `round(float)` — nearest integer, ties to even.
 *
 * @param {number} value
 * @returns {number} An integer-valued double.
 */
function pyRound(value) {
  if (Number.isNaN(value))
    throw new ValueError("cannot convert float NaN to integer");
  if (!Number.isFinite(value))
    throw new RangeError("cannot convert float infinity to integer");
  const { negative, digits, scale } = exactDecimal(value);
  const magnitude = roundHalfEvenDiv(digits, scale);
  return Number(negative ? -magnitude : magnitude);
}

/**
 * Python `round(float, ndigits)` — correctly rounded to `ndigits` decimals.
 *
 * @param {number} value
 * @param {number} ndigits
 * @returns {number}
 */
function pyRoundN(value, ndigits) {
  if (!Number.isFinite(value)) return value;
  const { negative, digits, scale } = exactDecimal(value);
  let result;
  if (ndigits >= scale) {
    result = decimalToDouble(digits * pow10(ndigits - scale), ndigits);
  } else {
    result = decimalToDouble(
      roundHalfEvenDiv(digits, scale - ndigits),
      ndigits,
    );
  }
  return negative ? -result : result;
}

/**
 * Python `f"{value:.{precision}f}"`.
 *
 * @param {number} value
 * @param {number} precision
 * @returns {string}
 */
function formatFixed(value, precision) {
  if (Number.isNaN(value)) return "nan";
  if (value === Infinity) return "inf";
  if (value === -Infinity) return "-inf";
  const { negative, digits, scale } = exactDecimal(value);
  let scaled = digits;
  if (precision >= scale) scaled *= pow10(precision - scale);
  else scaled = roundHalfEvenDiv(scaled, scale - precision);
  let text = scaled.toString().padStart(precision + 1, "0");
  if (precision > 0) {
    text = `${text.slice(0, text.length - precision)}.${text.slice(text.length - precision)}`;
  }
  return `${negative ? "-" : ""}${text}`;
}

/**
 * Python `f"{value:.{precision}g}"`.
 *
 * @param {number} value
 * @param {number} precision
 * @returns {string}
 */
function formatGeneral(value, precision) {
  if (Number.isNaN(value)) return "nan";
  if (value === Infinity) return "inf";
  if (value === -Infinity) return "-inf";
  const { negative, digits, scale } = exactDecimal(value);
  const sign = negative ? "-" : "";
  if (digits === 0n) return `${sign}0`;
  let significant = digits;
  let currentScale = scale;
  const length = significant.toString().length;
  if (length > precision) {
    const shift = length - precision;
    significant = roundHalfEvenDiv(significant, shift);
    currentScale -= shift;
  }
  let text = significant.toString();
  let exponent = text.length - 1 - currentScale;
  if (exponent < -4 || exponent >= precision) {
    const fraction = text.slice(1).replace(/0+$/, "");
    const mantissa = fraction ? `${text[0]}.${fraction}` : text[0];
    const exponentText = `${exponent < 0 ? "-" : "+"}${String(Math.abs(exponent)).padStart(2, "0")}`;
    return `${sign}${mantissa}e${exponentText}`;
  }
  let result;
  if (exponent < 0) {
    result = `0.${"0".repeat(-exponent - 1)}${text}`;
  } else if (text.length <= exponent + 1) {
    result = text.padEnd(exponent + 1, "0");
  } else {
    result = `${text.slice(0, exponent + 1)}.${text.slice(exponent + 1)}`;
  }
  if (result.includes(".")) {
    result = result.replace(/0+$/, "").replace(/\.$/, "");
  }
  return `${sign}${result}`;
}

/**
 * Python `f"{value:.{precision}%}"`.
 *
 * @param {number} value
 * @param {number} precision
 * @returns {string}
 */
function formatPercent(value, precision) {
  return `${formatFixed(value * 100, precision)}%`;
}

/**
 * Python `repr(float)` — shortest round-trip representation, with Python's
 * exponent thresholds (scientific when the exponent is `< -4` or `>= 16`) and
 * a trailing `.0` for integral values.
 *
 * @param {number} value
 * @returns {string}
 */
function pyFloatRepr(value) {
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  if (Object.is(value, -0)) return "-0.0";
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(text);
  if (!match) return text;
  const negative = match[1] === "-";
  const combined = match[2] + (match[3] ?? "");
  const stripped = combined.replace(/^0+/, "");
  const strippedCount = combined.length - stripped.length;
  const exponent =
    (match[4] ? Number(match[4]) : 0) + match[2].length - 1 - strippedCount;
  const sign = negative ? "-" : "";
  if (stripped === "") return `${sign}0.0`;
  if (exponent < -4 || exponent >= 16) {
    const mantissa =
      stripped.length > 1 ? `${stripped[0]}.${stripped.slice(1)}` : stripped;
    const exponentText = `${exponent < 0 ? "-" : "+"}${String(Math.abs(exponent)).padStart(2, "0")}`;
    return `${sign}${mantissa}e${exponentText}`;
  }
  if (exponent >= 0) {
    const integerPart =
      stripped.length > exponent + 1
        ? stripped.slice(0, exponent + 1)
        : stripped.padEnd(exponent + 1, "0");
    const fractionPart =
      stripped.length > exponent + 1 ? stripped.slice(exponent + 1) : "";
    return fractionPart
      ? `${sign}${integerPart}.${fractionPart}`
      : `${sign}${integerPart}.0`;
  }
  return `${sign}0.${"0".repeat(-exponent - 1)}${stripped}`;
}

/**
 * Python `str(int)` for an integer-valued double.
 *
 * @param {number} value
 * @returns {string}
 */
function intToString(value) {
  if (!Number.isInteger(value)) throw new TypeError(`not an integer: ${value}`);
  return BigInt(value).toString();
}

/**
 * Python `math.fsum` — exact sum of doubles, correctly rounded.
 *
 * @param {Iterable<number>} values
 * @returns {number}
 */
function fsum(values) {
  let positiveInfinity = false;
  let negativeInfinity = false;
  /** @type {{significand: bigint, exponent: number}[]} */
  const parts = [];
  let minExponent = Infinity;
  for (const value of values) {
    if (Number.isNaN(value)) return NaN;
    if (value === Infinity) {
      positiveInfinity = true;
      continue;
    }
    if (value === -Infinity) {
      negativeInfinity = true;
      continue;
    }
    if (value === 0) continue;
    const { negative, significand, exponent } = binaryParts(value);
    parts.push({
      significand: negative ? -significand : significand,
      exponent,
    });
    if (exponent < minExponent) minExponent = exponent;
  }
  if (positiveInfinity && negativeInfinity) return NaN;
  if (positiveInfinity) return Infinity;
  if (negativeInfinity) return -Infinity;
  if (parts.length === 0) return 0;
  let total = 0n;
  for (const part of parts) {
    total += part.significand << BigInt(part.exponent - minExponent);
  }
  return bigBinToDouble(total, minExponent);
}

/**
 * Convert an exact binary rational (`significand * 2 ** exponent`) to the
 * nearest double, rounding ties to even.
 *
 * @param {bigint} significand Signed magnitude.
 * @param {number} exponent
 * @returns {number}
 */
function bigBinToDouble(significand, exponent) {
  if (significand === 0n) return 0;
  const negative = significand < 0n;
  let magnitude = negative ? -significand : significand;
  let binaryExponent = exponent;
  let bits = bitLength(magnitude);
  if (bits > 53) {
    const shift = BigInt(bits - 53);
    const mask = (1n << shift) - 1n;
    const remainder = magnitude & mask;
    let quotient = magnitude >> shift;
    const half = 1n << (shift - 1n);
    if (remainder > half || (remainder === half && (quotient & 1n) === 1n))
      quotient += 1n;
    magnitude = quotient;
    binaryExponent += Number(shift);
    bits = bitLength(magnitude);
    if (bits > 53) {
      magnitude >>= 1n;
      binaryExponent += 1;
    }
  }
  const topExponent = binaryExponent + bits - 1;
  let result;
  if (topExponent > 1023) {
    result = Infinity;
  } else if (topExponent < -1074) {
    result = 0;
  } else if (binaryExponent < -1074) {
    const shift = BigInt(-1074 - binaryExponent);
    const mask = (1n << shift) - 1n;
    const remainder = magnitude & mask;
    let quotient = magnitude >> shift;
    const half = 1n << (shift - 1n);
    if (remainder > half || (remainder === half && (quotient & 1n) === 1n))
      quotient += 1n;
    result = Number(quotient) * 2 ** -1074;
  } else {
    result = Number(magnitude) * 2 ** binaryExponent;
  }
  return negative ? -result : result;
}

/** @param {bigint} value Positive value. @returns {number} Bit length. */
function bitLength(value) {
  let bits = 0;
  let cursor = value;
  while (cursor > 0xffn) {
    cursor >>= 8n;
    bits += 8;
  }
  while (cursor > 0n) {
    cursor >>= 1n;
    bits += 1;
  }
  return bits;
}

/**
 * Python `statistics.fmean` — `fsum(data) / len(data)`.
 *
 * @param {Iterable<number>} values
 * @returns {number}
 */
function fmean(values) {
  const data = [...values];
  if (data.length === 0)
    throw new StatisticsError("fmean requires at least one data point");
  return fsum(data) / data.length;
}

/**
 * Python `statistics.median`.
 *
 * @param {Iterable<number>} values
 * @returns {number}
 */
function median(values) {
  const data = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const n = data.length;
  if (n === 0) throw new StatisticsError("no median for empty data");
  if (n % 2 === 1) return data[(n - 1) / 2];
  const i = n / 2;
  return (data[i - 1] + data[i]) / 2;
}

/**
 * Python `math.isclose(a, b, rel_tol=..., abs_tol=...)`.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} relTol
 * @param {number} absTol
 * @returns {boolean}
 */
function isClose(a, b, relTol, absTol) {
  return (
    Math.abs(a - b) <=
    Math.max(relTol * Math.max(Math.abs(a), Math.abs(b)), absTol)
  );
}

/**
 * Python `clamp` helper: `max(lower, min(upper, value))`.
 *
 * @param {number} value
 * @param {number} lower
 * @param {number} upper
 * @returns {number}
 */
function clamp(value, lower, upper) {
  return Math.max(lower, Math.min(upper, value));
}

/* ------------------------------------------------------------------ *
 * Python `repr` helpers (used in error messages)
 * ------------------------------------------------------------------ */

/**
 * Python `repr(str)`.
 *
 * @param {string} value
 * @returns {string}
 */
function pyStrRepr(value) {
  const useDouble = value.includes("'") && !value.includes('"');
  const quote = useDouble ? '"' : "'";
  let out = "";
  for (const ch of value) {
    if (ch === "\\") out += "\\\\";
    else if (ch === quote) out += `\\${quote}`;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch < " ")
      out += `\\x${ch.codePointAt(0)?.toString(16).padStart(2, "0")}`;
    else out += ch;
  }
  return `${quote}${out}${quote}`;
}

/**
 * Python list `repr`: `[a, b]`.
 *
 * @param {unknown[]} items
 * @returns {string}
 */
function pyListRepr(items) {
  return `[${items.map((item) => pyRepr(item)).join(", ")}]`;
}

/**
 * Python tuple `repr`: `(a, b)` / `(a,)`.
 *
 * @param {unknown[]} items
 * @returns {string}
 */
function pyTupleRepr(items) {
  if (items.length === 1) return `(${pyRepr(items[0])},)`;
  return `(${items.map((item) => pyRepr(item)).join(", ")})`;
}

/**
 * Python dict `repr`: `{'k': v}`.
 *
 * @param {Map<unknown, unknown>} mapping
 * @returns {string}
 */
function pyDictRepr(mapping) {
  const entries = [...mapping.entries()].map(
    ([key, value]) => `${pyRepr(key)}: ${pyRepr(value)}`,
  );
  return `{${entries.join(", ")}}`;
}

/**
 * Python `repr()` for the scalar/container subset used in diagnostics.
 *
 * @param {unknown} value
 * @returns {string}
 */
function pyRepr(value) {
  if (typeof value === "string") return pyStrRepr(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number")
    return Number.isInteger(value) ? value.toString() : pyFloatRepr(value);
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value === null || value === undefined) return "None";
  if (Array.isArray(value)) return pyListRepr(value);
  if (value instanceof Map) return pyDictRepr(value);
  return String(value);
}

/* ------------------------------------------------------------------ *
 * Python `int()` / `float()` parsing
 * ------------------------------------------------------------------ */

/**
 * Python `int(text)` (base 10).
 *
 * @param {string} text
 * @returns {bigint}
 */
function pyParseInt(text) {
  const match = /^\s*([+-]?)(\d(?:_?\d)*)\s*$/.exec(text);
  if (!match)
    throw new ValueError(
      `invalid literal for int() with base 10: ${pyStrRepr(text)}`,
    );
  const magnitude = BigInt(match[2].replace(/_/g, ""));
  return match[1] === "-" ? -magnitude : magnitude;
}

/**
 * Python `float(text)`.
 *
 * @param {string} text
 * @returns {number}
 */
function pyParseFloat(text) {
  const trimmed = text.trim().replace(/_/g, "");
  const lowered = trimmed.toLowerCase();
  if (
    lowered === "inf" ||
    lowered === "infinity" ||
    lowered === "+inf" ||
    lowered === "+infinity"
  ) {
    return Infinity;
  }
  if (lowered === "-inf" || lowered === "-infinity") return -Infinity;
  if (lowered === "nan" || lowered === "+nan" || lowered === "-nan") return NaN;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    throw new ValueError(
      `could not convert string to float: ${pyStrRepr(text)}`,
    );
  }
  return Number(trimmed);
}

/**
 * Coerce a parsed Python literal to a float (for `DEFAULT_DURATION`).
 *
 * @param {unknown} value
 * @returns {number}
 */
function literalToFloat(value) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") return pyParseFloat(value);
  throw new ValueError(
    `float() argument must be a number, not ${pyRepr(value)}`,
  );
}

/**
 * Coerce a parsed Python literal to an int (for `DEFAULT_N_LEAF`).
 *
 * @param {unknown} value
 * @returns {number}
 */
function literalToInt(value) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "string") return Number(pyParseInt(value));
  throw new ValueError(`int() argument must be a number, not ${pyRepr(value)}`);
}

/* ------------------------------------------------------------------ *
 * CPython `random.Random` — Mersenne Twister (MT19937)
 * ------------------------------------------------------------------ */

const MT_N = 624;
const MT_M = 397;
const MT_MATRIX_A = 0x9908b0df;
const MT_UPPER_MASK = 0x80000000;
const MT_LOWER_MASK = 0x7fffffff;
const TWO_PI = 2.0 * Math.PI;

/**
 * Bit-exact port of CPython's `random.Random` (MT19937 + `init_by_array`).
 * The seed is expanded to little-endian uint32 words of its absolute value,
 * matching `Modules/_randommodule.c`.
 */
class Random {
  /** @param {bigint} seed */
  constructor(seed) {
    /** @type {Uint32Array} */
    this.state = new Uint32Array(MT_N + 1);
    /** @type {number | null} */
    this.gaussNext = null;
    this.seed(seed);
  }

  /** @param {bigint} value */
  seed(value) {
    this.gaussNext = null;
    this.initByArray(Random.seedKey(value));
  }

  /**
   * CPython's int-to-key expansion: little-endian uint32 words of `abs(seed)`,
   * at least one word.
   *
   * @param {bigint} value
   * @returns {number[]}
   */
  static seedKey(value) {
    let magnitude = value < 0n ? -value : value;
    if (magnitude === 0n) return [0];
    /** @type {number[]} */
    const words = [];
    while (magnitude > 0n) {
      words.push(Number(magnitude & 0xffffffffn));
      magnitude >>= 32n;
    }
    return words;
  }

  /** @param {number} s */
  initGenrand(s) {
    const mt = this.state;
    mt[0] = s >>> 0;
    for (let i = 1; i < MT_N; i++) {
      const prev = mt[i - 1];
      mt[i] = (Math.imul(1812433253, (prev ^ (prev >>> 30)) >>> 0) + i) >>> 0;
    }
    mt[MT_N] = MT_N;
  }

  /** @param {number[]} key */
  initByArray(key) {
    const mt = this.state;
    const keyLength = key.length;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    let k = MT_N > keyLength ? MT_N : keyLength;
    for (; k; k--) {
      const prev = mt[i - 1];
      const mixed = (prev ^ (prev >>> 30)) >>> 0;
      mt[i] = (((mt[i] ^ Math.imul(mixed, 1664525)) >>> 0) + key[j] + j) >>> 0;
      i++;
      j++;
      if (i >= MT_N) {
        mt[0] = mt[MT_N - 1];
        i = 1;
      }
      if (j >= keyLength) j = 0;
    }
    for (k = MT_N - 1; k; k--) {
      const prev = mt[i - 1];
      const mixed = (prev ^ (prev >>> 30)) >>> 0;
      mt[i] = (((mt[i] ^ Math.imul(mixed, 1566083941)) >>> 0) - i) >>> 0;
      i++;
      if (i >= MT_N) {
        mt[0] = mt[MT_N - 1];
        i = 1;
      }
    }
    mt[0] = 0x80000000;
  }

  /** @returns {number} A uniform double in `[0, 1)` (CPython `_random`). */
  random() {
    const a = this.uint32() >>> 5;
    const b = this.uint32() >>> 6;
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }

  /** @returns {number} The next raw 32-bit word. */
  uint32() {
    const mt = this.state;
    if (mt[MT_N] >= MT_N) {
      let y;
      let kk;
      for (kk = 0; kk < MT_N - MT_M; kk++) {
        y = ((mt[kk] & MT_UPPER_MASK) | (mt[kk + 1] & MT_LOWER_MASK)) >>> 0;
        mt[kk] = (mt[kk + MT_M] ^ (y >>> 1) ^ (y & 1 ? MT_MATRIX_A : 0)) >>> 0;
      }
      for (; kk < MT_N - 1; kk++) {
        y = ((mt[kk] & MT_UPPER_MASK) | (mt[kk + 1] & MT_LOWER_MASK)) >>> 0;
        mt[kk] =
          (mt[kk + (MT_M - MT_N)] ^ (y >>> 1) ^ (y & 1 ? MT_MATRIX_A : 0)) >>>
          0;
      }
      y = ((mt[MT_N - 1] & MT_UPPER_MASK) | (mt[0] & MT_LOWER_MASK)) >>> 0;
      mt[MT_N - 1] =
        (mt[MT_M - 1] ^ (y >>> 1) ^ (y & 1 ? MT_MATRIX_A : 0)) >>> 0;
      mt[MT_N] = 0;
    }
    let y = mt[mt[MT_N]++];
    y = (y ^ (y >>> 11)) >>> 0;
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
    y = (y ^ (y >>> 18)) >>> 0;
    return y;
  }

  /**
   * Python `random.uniform(a, b)`.
   *
   * @param {number} a
   * @param {number} b
   * @returns {number}
   */
  uniform(a, b) {
    return a + (b - a) * this.random();
  }

  /**
   * Python `random.gauss(mu, sigma)` (Box-Muller with a cached spare).
   *
   * @param {number} mu
   * @param {number} sigma
   * @returns {number}
   */
  gauss(mu, sigma) {
    let z = this.gaussNext;
    this.gaussNext = null;
    if (z === null) {
      const x2pi = this.random() * TWO_PI;
      const g2rad = Math.sqrt(-2.0 * Math.log(1.0 - this.random()));
      z = Math.cos(x2pi) * g2rad;
      this.gaussNext = Math.sin(x2pi) * g2rad;
    }
    return mu + z * sigma;
  }
}

/**
 * Python `stable_seed`: SHA-256 of the NUL-joined parts, first 8 bytes as a
 * big-endian integer.
 *
 * @param {bigint} masterSeed
 * @param {...(string | number | bigint)} parts
 * @returns {bigint}
 */
function stableSeed(masterSeed, ...parts) {
  const material = [
    String(masterSeed),
    ...parts.map((part) => String(part)),
  ].join("\0");
  const digest = createHash("sha256").update(material, "utf8").digest();
  return digest.readBigUInt64BE(0);
}

/**
 * Python `secrets.randbits(63)`.
 *
 * @returns {bigint}
 */
function randomBits63() {
  return randomBytes(8).readBigUInt64BE() >> 1n;
}

/* ------------------------------------------------------------------ *
 * Python literal parsing (subset of `ast.literal_eval`)
 * ------------------------------------------------------------------ */

/**
 * Recursive-descent parser for the Python literal subset used by the
 * configuration constants in `main.py` (strings, numbers, booleans, `None`,
 * lists, tuples, dicts and sets).
 */
class PythonLiteralParser {
  /** @param {string} source @param {number} offset */
  constructor(source, offset) {
    this.source = source;
    this.pos = offset;
  }

  /** @param {boolean} allowNewlines */
  skipTrivia(allowNewlines) {
    for (;;) {
      const ch = this.source[this.pos];
      if (ch === undefined) return;
      if (ch === "#") {
        while (this.pos < this.source.length && this.source[this.pos] !== "\n")
          this.pos++;
        continue;
      }
      if (ch === "\n") {
        if (!allowNewlines) return;
        this.pos++;
        continue;
      }
      if (
        ch === " " ||
        ch === "\t" ||
        ch === "\r" ||
        ch === "\f" ||
        ch === "\v"
      ) {
        this.pos++;
        continue;
      }
      return;
    }
  }

  /**
   * @param {string} message
   * @returns {never}
   */
  fail(message) {
    throw new ValueError(`malformed literal at offset ${this.pos}: ${message}`);
  }

  /**
   * Parse a value, then any trailing comma-separated values (forming a tuple).
   *
   * @param {boolean} allowNewlines
   * @returns {unknown}
   */
  parseValue(allowNewlines) {
    this.skipTrivia(allowNewlines);
    const first = this.parseAtom();
    this.skipTrivia(false);
    if (this.source[this.pos] !== ",") return first;
    const items = [first];
    while (this.source[this.pos] === ",") {
      this.pos++;
      this.skipTrivia(allowNewlines);
      const next = this.source[this.pos];
      if (
        next === "]" ||
        next === ")" ||
        next === "}" ||
        next === undefined ||
        next === "\n"
      )
        break;
      items.push(this.parseAtom());
      this.skipTrivia(false);
    }
    return items;
  }

  /** @returns {unknown} */
  parseAtom() {
    this.skipTrivia(false);
    const ch = this.source[this.pos];
    if (ch === undefined) this.fail("unexpected end of input");
    if (ch === "-" || ch === "+") {
      this.pos++;
      const operand = this.parseAtom();
      if (typeof operand === "bigint") return ch === "-" ? -operand : operand;
      if (typeof operand === "number") return ch === "-" ? -operand : operand;
      this.fail("unary operator on non-number");
    }
    if (ch === "'" || ch === '"') return this.parseString();
    if (ch === "[") return this.parseList();
    if (ch === "(") return this.parseTuple();
    if (ch === "{") return this.parseDictOrSet();
    if (/[0-9]/.test(ch) || ch === ".") return this.parseNumber();
    return this.parseName();
  }

  /** @returns {string} */
  parseString() {
    let result = "";
    for (;;) {
      this.skipTrivia(false);
      const ch = this.source[this.pos];
      if (ch !== "'" && ch !== '"') break;
      result += this.parseSingleString();
      this.skipTrivia(false);
    }
    return result;
  }

  /** @returns {string} */
  parseSingleString() {
    const quote = this.source[this.pos];
    const triple =
      this.source.slice(this.pos, this.pos + 3) === quote.repeat(3);
    this.pos += triple ? 3 : 1;
    let out = "";
    for (;;) {
      const ch = this.source[this.pos];
      if (ch === undefined) this.fail("unterminated string");
      if (
        triple
          ? this.source.slice(this.pos, this.pos + 3) === quote.repeat(3)
          : ch === quote
      ) {
        this.pos += triple ? 3 : 1;
        return out;
      }
      if (ch === "\\" && !triple) {
        out += this.parseEscape();
        continue;
      }
      if (ch === "\\" && triple) {
        out += this.parseEscape();
        continue;
      }
      if (!triple && ch === "\n") this.fail("unterminated string");
      out += ch;
      this.pos++;
    }
  }

  /** @returns {string} */
  parseEscape() {
    this.pos++; // consume backslash
    const ch = this.source[this.pos];
    this.pos++;
    switch (ch) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "0":
        return "\0";
      case "\\":
        return "\\";
      case "'":
        return "'";
      case '"':
        return '"';
      case "\n":
        return "";
      case "x": {
        const hex = this.source.slice(this.pos, this.pos + 2);
        this.pos += 2;
        return String.fromCodePoint(Number.parseInt(hex, 16));
      }
      case "u": {
        const hex = this.source.slice(this.pos, this.pos + 4);
        this.pos += 4;
        return String.fromCodePoint(Number.parseInt(hex, 16));
      }
      case "U": {
        const hex = this.source.slice(this.pos, this.pos + 8);
        this.pos += 8;
        return String.fromCodePoint(Number.parseInt(hex, 16));
      }
      default:
        if (ch >= "0" && ch <= "7") {
          let oct = ch;
          while (
            oct.length < 3 &&
            this.source[this.pos] >= "0" &&
            this.source[this.pos] <= "7"
          ) {
            oct += this.source[this.pos];
            this.pos++;
          }
          return String.fromCodePoint(Number.parseInt(oct, 8));
        }
        return `\\${ch}`;
    }
  }

  /** @returns {unknown[]} */
  parseList() {
    this.pos++; // consume '['
    /** @type {unknown[]} */
    const items = [];
    for (;;) {
      this.skipTrivia(true);
      if (this.source[this.pos] === "]") {
        this.pos++;
        return items;
      }
      items.push(this.parseAtom());
      this.skipTrivia(true);
      const ch = this.source[this.pos];
      if (ch === ",") {
        this.pos++;
        continue;
      }
      if (ch === "]") {
        this.pos++;
        return items;
      }
      this.fail("expected ',' or ']' in list");
    }
  }

  /** @returns {unknown} */
  parseTuple() {
    this.pos++; // consume '('
    this.skipTrivia(true);
    if (this.source[this.pos] === ")") {
      this.pos++;
      return [];
    }
    const first = this.parseAtom();
    this.skipTrivia(true);
    const ch = this.source[this.pos];
    if (ch === ",") {
      const items = [first];
      for (;;) {
        this.pos++;
        this.skipTrivia(true);
        if (this.source[this.pos] === ")") {
          this.pos++;
          return items;
        }
        items.push(this.parseAtom());
        this.skipTrivia(true);
        const next = this.source[this.pos];
        if (next === ",") continue;
        if (next === ")") {
          this.pos++;
          return items;
        }
        this.fail("expected ',' or ')' in tuple");
      }
    }
    if (ch === ")") {
      this.pos++;
      return first;
    }
    this.fail("expected ',' or ')' in tuple");
  }

  /** @returns {Map<unknown, unknown> | Set<unknown>} */
  parseDictOrSet() {
    this.pos++; // consume '{'
    this.skipTrivia(true);
    if (this.source[this.pos] === "}") {
      this.pos++;
      return new Map();
    }
    const first = this.parseAtom();
    this.skipTrivia(true);
    if (this.source[this.pos] === ":") {
      this.pos++;
      /** @type {Map<unknown, unknown>} */
      const mapping = new Map();
      mapping.set(first, this.parseAtom());
      for (;;) {
        this.skipTrivia(true);
        const ch = this.source[this.pos];
        if (ch === ",") {
          this.pos++;
          this.skipTrivia(true);
          if (this.source[this.pos] === "}") {
            this.pos++;
            return mapping;
          }
          const key = this.parseAtom();
          this.skipTrivia(true);
          if (this.source[this.pos] !== ":") this.fail("expected ':' in dict");
          this.pos++;
          mapping.set(key, this.parseAtom());
          continue;
        }
        if (ch === "}") {
          this.pos++;
          return mapping;
        }
        this.fail("expected ',' or '}' in dict");
      }
    }
    /** @type {Set<unknown>} */
    const set = new Set();
    set.add(first);
    for (;;) {
      this.skipTrivia(true);
      const ch = this.source[this.pos];
      if (ch === ",") {
        this.pos++;
        this.skipTrivia(true);
        if (this.source[this.pos] === "}") {
          this.pos++;
          return set;
        }
        set.add(this.parseAtom());
        continue;
      }
      if (ch === "}") {
        this.pos++;
        return set;
      }
      this.fail("expected ',' or '}' in set");
    }
  }

  /** @returns {bigint | number} */
  parseNumber() {
    const start = this.pos;
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (/[0-9a-zA-Z_.]/.test(ch)) this.pos++;
      else break;
    }
    const token = this.source.slice(start, this.pos);
    const cleaned = token.replace(/_/g, "");
    if (/^0[xX][0-9a-fA-F]+$/.test(cleaned)) return BigInt(cleaned);
    if (/^0[oO][0-7]+$/.test(cleaned))
      return BigInt(Number.parseInt(cleaned.slice(2), 8));
    if (/^0[bB][01]+$/.test(cleaned))
      return BigInt(Number.parseInt(cleaned.slice(2), 2));
    if (/^[0-9]+$/.test(cleaned)) return BigInt(cleaned);
    if (
      /^(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(cleaned) &&
      /[.eE]/.test(cleaned)
    ) {
      return pyParseFloat(cleaned);
    }
    if (/^\d+[jJ]$/.test(cleaned))
      this.fail("complex literals are not supported");
    this.fail(`invalid number ${pyStrRepr(token)}`);
  }

  /** @returns {unknown} */
  parseName() {
    const start = this.pos;
    while (
      this.pos < this.source.length &&
      /[A-Za-z0-9_]/.test(this.source[this.pos])
    )
      this.pos++;
    const name = this.source.slice(start, this.pos);
    if (name === "True") return true;
    if (name === "False") return false;
    if (name === "None") return null;
    this.fail(`unsupported name ${pyStrRepr(name)}`);
  }
}

/**
 * Python `load_literal_assignments`: read top-level literal assignments from a
 * Python source file.
 *
 * @param {string} filePath
 * @param {Set<string>} names
 * @returns {Map<string, unknown>}
 */
function loadLiteralAssignments(filePath, names) {
  /** @type {string} */
  let source;
  try {
    source = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code;
    if (code === "ENOENT") {
      throw new FileNotFoundError(
        `[Errno 2] No such file or directory: ${pyStrRepr(filePath)}`,
      );
    }
    throw error;
  }
  /** @type {Map<string, unknown>} */
  const values = new Map();
  const lines = source.split("\n");
  let offset = 0;
  for (const line of lines) {
    const assignment =
      /^([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s*(?::[^=]*?)?=(?!=)\s*/.exec(
        line,
      );
    if (assignment && /^[A-Za-z_]/.test(line)) {
      const targets = assignment[1].split(",").map((target) => target.trim());
      const wanted = targets.filter((target) => names.has(target));
      if (wanted.length > 0) {
        const parser = new PythonLiteralParser(
          source,
          offset + assignment[0].length,
        );
        const value = parser.parseValue(false);
        for (const target of wanted) values.set(target, value);
      }
    }
    offset += line.length + 1;
  }
  /** @type {string[]} */
  const missing = [...names].filter((name) => !values.has(name)).sort();
  if (missing.length > 0) {
    throw new ValueError(
      `Missing literal assignments in ${filePath}: ${pyListRepr(missing)}`,
    );
  }
  return values;
}

/* ------------------------------------------------------------------ *
 * Domain model (mirrors the dataclasses in docs/mock.py)
 * ------------------------------------------------------------------ */

/**
 * @typedef {object} ValidationSummary
 * @property {bigint} records
 * @property {bigint} scenario_protocol_groups
 * @property {number[]} swift_throughput_gain_pct
 * @property {number[]} swift_delay_ratio
 * @property {number[]} swift_fairness_delta
 * @property {number[]} goodput_mbps
 * @property {number[]} delay_ms
 * @property {number[]} jain
 */

/** One network scenario row from `main.py`'s `SCENARIOS`. */
class Scenario {
  /**
   * @param {string} name
   * @param {string} accessRate
   * @param {string} bottleneckRate
   * @param {string} accessDelay
   * @param {string} bottleneckDelay
   */
  constructor(name, accessRate, bottleneckRate, accessDelay, bottleneckDelay) {
    this.name = name;
    this.accessRate = accessRate;
    this.bottleneckRate = bottleneckRate;
    this.accessDelay = accessDelay;
    this.bottleneckDelay = bottleneckDelay;
  }

  /** @returns {number} */
  get accessMbps() {
    return parseRateMbps(this.accessRate);
  }

  /** @returns {number} */
  get bottleneckMbps() {
    return parseRateMbps(this.bottleneckRate);
  }

  /** @returns {number} */
  get baseOwdMs() {
    return (
      2 * parseDelayMs(this.accessDelay) + parseDelayMs(this.bottleneckDelay)
    );
  }
}

/** A simulated packet flow (ns-3 FlowMonitor statistics). */
class Flow {
  /**
   * @param {object} init
   * @param {number} init.flowId
   * @param {string} init.sourceAddress
   * @param {string} init.destinationAddress
   * @param {number} init.protocol
   * @param {number} init.sourcePort
   * @param {number} init.destinationPort
   * @param {number} init.packetBytes
   * @param {number} init.timeFirstTxNs
   * @param {number} init.timeFirstRxNs
   * @param {number} init.timeLastTxNs
   * @param {number} init.timeLastRxNs
   * @param {number} init.delaySumNs
   * @param {number} init.jitterSumNs
   * @param {number} init.lastDelayNs
   * @param {number} init.txBytes
   * @param {number} init.rxBytes
   * @param {number} init.txPackets
   * @param {number} init.rxPackets
   * @param {number} init.lostPackets
   * @param {number} init.timesForwarded
   */
  constructor(init) {
    this.flowId = init.flowId;
    this.sourceAddress = init.sourceAddress;
    this.destinationAddress = init.destinationAddress;
    this.protocol = init.protocol;
    this.sourcePort = init.sourcePort;
    this.destinationPort = init.destinationPort;
    this.packetBytes = init.packetBytes;
    this.timeFirstTxNs = init.timeFirstTxNs;
    this.timeFirstRxNs = init.timeFirstRxNs;
    this.timeLastTxNs = init.timeLastTxNs;
    this.timeLastRxNs = init.timeLastRxNs;
    this.delaySumNs = init.delaySumNs;
    this.jitterSumNs = init.jitterSumNs;
    this.lastDelayNs = init.lastDelayNs;
    this.txBytes = init.txBytes;
    this.rxBytes = init.rxBytes;
    this.txPackets = init.txPackets;
    this.rxPackets = init.rxPackets;
    this.lostPackets = init.lostPackets;
    this.timesForwarded = init.timesForwarded;
  }

  /** @returns {number} */
  get durationS() {
    return (this.timeLastRxNs - this.timeFirstTxNs) / 1e9;
  }

  /** @returns {number} */
  get goodputMbps() {
    if (this.durationS <= 0) return 0.0;
    return (this.rxBytes * 8) / this.durationS / 1e6;
  }

  /** @returns {number} */
  get delayMs() {
    if (this.rxPackets <= 0) return 0.0;
    return this.delaySumNs / this.rxPackets / 1e6;
  }

  /** @returns {number} */
  get jitterMs() {
    if (this.rxPackets <= 1) return 0.0;
    return this.jitterSumNs / (this.rxPackets - 1) / 1e6;
  }
}

/** One generated (setting, scenario, protocol) result bundle. */
class Record {
  /**
   * @param {string} setting
   * @param {Scenario} scenario
   * @param {string} protocol
   * @param {bigint} seed
   * @param {Flow[]} flows
   */
  constructor(setting, scenario, protocol, seed, flows) {
    this.setting = setting;
    this.scenario = scenario;
    this.protocol = protocol;
    this.seed = seed;
    this.flows = flows;
  }

  /** @returns {Flow[]} */
  get forwardFlows() {
    return this.flows.filter(
      (flow) =>
        flow.protocol === 6 &&
        flow.sourceAddress.startsWith("10.1.") &&
        flow.destinationAddress.startsWith("10.2."),
    );
  }

  /** @returns {Flow[]} */
  get udpFlows() {
    return this.flows.filter((flow) => flow.protocol === 17);
  }

  /** @returns {number} */
  get goodputMbps() {
    let total = 0;
    for (const flow of this.forwardFlows) total += flow.goodputMbps;
    return total;
  }

  /** @returns {number} */
  get udpGoodputMbps() {
    let total = 0;
    for (const flow of this.udpFlows) total += flow.goodputMbps;
    return total;
  }

  /** @returns {number} */
  get delayMs() {
    return fmean(this.forwardFlows.map((flow) => flow.delayMs));
  }

  /** @returns {number} */
  get jitterMs() {
    return fmean(this.forwardFlows.map((flow) => flow.jitterMs));
  }

  /** @returns {number} */
  get lossPct() {
    let txPackets = 0;
    let lostPackets = 0;
    for (const flow of this.forwardFlows) {
      txPackets += flow.txPackets;
      lostPackets += flow.lostPackets;
    }
    return txPackets ? (100 * lostPackets) / txPackets : 0.0;
  }

  /** @returns {number} */
  get jain() {
    return jainIndex(this.forwardFlows.map((flow) => flow.goodputMbps));
  }

  /** @returns {string} */
  get artifactDirectory() {
    return this.setting === "tcp_only" ? "comparison" : "comparison-udp";
  }

  /** @returns {string} */
  get stem() {
    return `${this.scenario.name}_${this.protocol}`;
  }
}

/**
 * @typedef {object} ProjectConfig
 * @property {Scenario[]} scenarios
 * @property {string[]} protocols
 * @property {number} durationS
 * @property {number} nFlows
 */

/* ------------------------------------------------------------------ *
 * Domain helpers
 * ------------------------------------------------------------------ */

/** @type {ReadonlyArray<readonly [string, number]>} */
const RATE_SUFFIXES = [
  ["Gbps", 1000.0],
  ["Mbps", 1.0],
  ["Kbps", 0.001],
  ["bps", 1e-6],
];

/** @type {ReadonlyArray<readonly [string, number]>} */
const DELAY_SUFFIXES = [
  ["ns", 1e-6],
  ["us", 1e-3],
  ["ms", 1.0],
  ["s", 1000.0],
];

/**
 * @param {string} value
 * @returns {number}
 */
function parseRateMbps(value) {
  for (const [suffix, multiplier] of RATE_SUFFIXES) {
    if (value.endsWith(suffix))
      return pyParseFloat(value.slice(0, -suffix.length)) * multiplier;
  }
  throw new ValueError(`Unsupported data rate: ${value}`);
}

/**
 * @param {string} value
 * @returns {number}
 */
function parseDelayMs(value) {
  for (const [suffix, multiplier] of DELAY_SUFFIXES) {
    if (value.endsWith(suffix))
      return pyParseFloat(value.slice(0, -suffix.length)) * multiplier;
  }
  throw new ValueError(`Unsupported delay: ${value}`);
}

/**
 * @param {Scenario} scenario
 * @param {number} packetBytes
 * @returns {number}
 */
function minimumPathDelayMs(scenario, packetBytes) {
  const packetBits = packetBytes * 8;
  let serializationMs = (packetBits / (scenario.accessMbps * 1000)) * 2;
  serializationMs += packetBits / (scenario.bottleneckMbps * 1000);
  return scenario.baseOwdMs + serializationMs;
}

/** @returns {ProjectConfig} */
function loadProjectConfig() {
  const values = loadLiteralAssignments(
    MAIN_PY,
    new Set([
      "SCENARIOS",
      "DEFAULT_PROTOCOLS",
      "DEFAULT_DURATION",
      "DEFAULT_N_LEAF",
    ]),
  );
  const scenarioRows = values.get("SCENARIOS");
  if (!Array.isArray(scenarioRows))
    throw new ValueError("SCENARIOS must be a sequence of rows");
  const scenarios = scenarioRows.map((row) => {
    if (
      !Array.isArray(row) ||
      row.length !== 5 ||
      row.some((field) => typeof field !== "string")
    ) {
      throw new ValueError(`Invalid SCENARIOS row: ${pyRepr(row)}`);
    }
    return new Scenario(
      /** @type {string} */ (row[0]),
      /** @type {string} */ (row[1]),
      /** @type {string} */ (row[2]),
      /** @type {string} */ (row[3]),
      /** @type {string} */ (row[4]),
    );
  });
  const protocolValue = values.get("DEFAULT_PROTOCOLS");
  const protocols =
    protocolValue instanceof Set
      ? [...protocolValue]
      : [.../** @type {unknown[]} */ (protocolValue)];
  const scenarioNames = scenarios.map((scenario) => scenario.name);
  if (new Set(scenarioNames).size !== scenarioNames.length) {
    throw new ValueError("Duplicate scenario names in main.py");
  }
  const unsafeNames = [...scenarioNames, ...protocols].filter(
    (name) => !IDENTIFIER_RE.test(String(name)),
  );
  if (unsafeNames.length > 0) {
    throw new ValueError(
      `Unsafe scenario or protocol identifiers: ${pyListRepr(unsafeNames)}`,
    );
  }
  const supported = new Set(["TcpSwift", "TcpNewReno", "TcpCubic", "TcpBbr"]);
  if (
    protocols.length !== supported.size ||
    protocols.some((protocol) => !supported.has(protocol))
  ) {
    throw new ValueError(
      `Unsupported protocol set in main.py: ${pyTupleRepr(protocols)}`,
    );
  }
  const nFlows = literalToInt(values.get("DEFAULT_N_LEAF"));
  if (nFlows !== 3) {
    throw new ValueError(
      `This fixture model requires three forward flows, found ${nFlows}`,
    );
  }
  return {
    scenarios,
    protocols,
    durationS: literalToFloat(values.get("DEFAULT_DURATION")),
    nFlows,
  };
}

/**
 * Jain's fairness index.
 *
 * @param {Iterable<number>} values
 * @returns {number}
 */
function jainIndex(values) {
  const samples = [...values];
  let total = 0;
  for (const sample of samples) total += sample;
  let squares = 0;
  for (const sample of samples) squares += sample * sample;
  return samples.length && squares
    ? (total * total) / (samples.length * squares)
    : 0.0;
}

/**
 * @param {Random} rng
 * @param {number} sigma
 * @param {number} [minimumJain]
 * @returns {number[]}
 */
function normalizedWeights(rng, sigma, minimumJain = 0.0) {
  let best = [1 / 3, 1 / 3, 1 / 3];
  for (let attempt = 0; attempt < 100; attempt++) {
    const raw = [
      Math.exp(rng.gauss(0.0, sigma)),
      Math.exp(rng.gauss(0.0, sigma)),
      Math.exp(rng.gauss(0.0, sigma)),
    ];
    const total = raw[0] + raw[1] + raw[2];
    const weights = raw.map((value) => value / total);
    if (jainIndex(weights) >= minimumJain) return weights;
    if (jainIndex(weights) > jainIndex(best)) best = weights;
  }
  return best;
}

/**
 * @param {Scenario} scenario
 * @returns {{difficulty: number, highRtt: number, edgeNetwork: boolean}}
 */
function scenarioDifficulty(scenario) {
  const highRtt = clamp(
    Math.log1p(scenario.baseOwdMs) / Math.log1p(320.0),
    0.0,
    1.0,
  );
  const oversubscription = clamp(
    (scenario.accessMbps / scenario.bottleneckMbps - 1.0) / 19.0,
    0.0,
    1.0,
  );
  const edgeNetwork =
    scenario.name.startsWith("wifi_") ||
    scenario.name.startsWith("lte_") ||
    scenario.name.startsWith("nr_") ||
    scenario.name.startsWith("satellite_");
  const difficulty = clamp(
    0.1 + 0.35 * highRtt + 0.3 * oversubscription + 0.2 * (edgeNetwork ? 1 : 0),
    0.05,
    0.95,
  );
  return { difficulty, highRtt, edgeNetwork };
}

/**
 * @param {object} init
 * @param {number} init.flowId
 * @param {string} init.sourceAddress
 * @param {string} init.destinationAddress
 * @param {number} init.protocol
 * @param {number} init.sourcePort
 * @param {number} init.destinationPort
 * @param {number} init.packetBytes
 * @param {number} init.goodputMbps
 * @param {number} init.lossPct
 * @param {number} init.delayMs
 * @param {number} init.jitterMs
 * @param {number} init.firstTxS
 * @param {number} init.stopS
 * @param {number} init.timesForwardedMultiplier
 * @returns {Flow}
 */
function packetFlow(init) {
  const durationS = init.stopS - init.firstTxS;
  const targetRxBytes = (init.goodputMbps * 1e6 * durationS) / 8;
  const rxPackets = Math.max(2, pyRound(targetRxBytes / init.packetBytes));
  const rxBytes = rxPackets * init.packetBytes;
  const lossFraction = clamp(init.lossPct / 100.0, 0.0, 0.95);
  const lostPackets = pyRound(
    (rxPackets * lossFraction) / (1.0 - lossFraction),
  );
  const txPackets = rxPackets + lostPackets;
  const firstTxNs = pyRound(init.firstTxS * 1e9);
  const firstRxNs = firstTxNs + pyRound(init.delayMs * 1e6);
  const stopNs = pyRound(init.stopS * 1e9);
  return new Flow({
    flowId: init.flowId,
    sourceAddress: init.sourceAddress,
    destinationAddress: init.destinationAddress,
    protocol: init.protocol,
    sourcePort: init.sourcePort,
    destinationPort: init.destinationPort,
    packetBytes: init.packetBytes,
    timeFirstTxNs: firstTxNs,
    timeFirstRxNs: firstRxNs,
    timeLastTxNs: Math.max(firstTxNs, stopNs - pyRound(init.delayMs * 1e6)),
    timeLastRxNs: stopNs,
    delaySumNs: pyRound(init.delayMs * 1e6 * rxPackets),
    jitterSumNs: pyRound(init.jitterMs * 1e6 * (rxPackets - 1)),
    lastDelayNs: pyRound(init.delayMs * 1e6),
    txBytes: txPackets * init.packetBytes,
    rxBytes,
    txPackets,
    rxPackets,
    lostPackets,
    timesForwarded: rxPackets * init.timesForwardedMultiplier,
  });
}

/**
 * @param {object} init
 * @param {string} init.setting
 * @param {Scenario} init.scenario
 * @param {string} init.protocol
 * @param {bigint} init.seed
 * @param {number} init.durationS
 * @param {number} init.targetGoodputMbps
 * @param {number} init.targetDelayMs
 * @param {number} init.targetJitterMs
 * @param {number} init.targetLossPct
 * @param {number[]} init.weights
 * @param {number} init.udpGoodputMbps
 * @param {Random} init.rng
 * @returns {Record}
 */
function buildRecord(init) {
  const { rng, scenario } = init;
  const stopS = init.durationS + 0.1;
  const delayRaw = [
    clamp(rng.gauss(1.0, 0.025), 0.9, 1.1),
    clamp(rng.gauss(1.0, 0.025), 0.9, 1.1),
    clamp(rng.gauss(1.0, 0.025), 0.9, 1.1),
  ];
  const delayScale = 3 / (delayRaw[0] + delayRaw[1] + delayRaw[2]);
  const jitterRaw = [
    clamp(rng.gauss(1.0, 0.05), 0.8, 1.2),
    clamp(rng.gauss(1.0, 0.05), 0.8, 1.2),
    clamp(rng.gauss(1.0, 0.05), 0.8, 1.2),
  ];
  const jitterScale = 3 / (jitterRaw[0] + jitterRaw[1] + jitterRaw[2]);
  /** @type {Flow[]} */
  const flows = [];
  for (let index = 0; index < 3; index++) {
    // sim.cc staggers BulkSend starts at start_time*(i+1) = 0.1/0.2/0.3 s
    const firstTxS = 0.1 * (index + 1);
    const dataFlow = packetFlow({
      flowId: 2 * index + 1,
      sourceAddress: `10.1.${index + 1}.1`,
      destinationAddress: `10.2.${index + 1}.1`,
      protocol: 6,
      sourcePort: 49153,
      destinationPort: TCP_PORT,
      packetBytes: DATA_PACKET_BYTES,
      goodputMbps: init.targetGoodputMbps * init.weights[index],
      lossPct: init.targetLossPct * clamp(rng.gauss(1.0, 0.08), 0.75, 1.25),
      delayMs: Math.max(
        minimumPathDelayMs(scenario, DATA_PACKET_BYTES),
        init.targetDelayMs * delayRaw[index] * delayScale,
      ),
      jitterMs: init.targetJitterMs * jitterRaw[index] * jitterScale,
      firstTxS,
      stopS,
      timesForwardedMultiplier: 2,
    });
    flows.push(dataFlow);
    const ackPackets = Math.max(2, Math.floor(dataFlow.rxPackets / 2));
    const ackGoodput =
      (ackPackets * ACK_PACKET_BYTES * 8) / dataFlow.durationS / 1e6;
    const ackDelayMs = minimumPathDelayMs(scenario, ACK_PACKET_BYTES);
    flows.push(
      packetFlow({
        flowId: 2 * index + 2,
        sourceAddress: dataFlow.destinationAddress,
        destinationAddress: dataFlow.sourceAddress,
        protocol: 6,
        sourcePort: TCP_PORT,
        destinationPort: 49153,
        packetBytes: ACK_PACKET_BYTES,
        goodputMbps: ackGoodput,
        lossPct: 0.0,
        delayMs: ackDelayMs,
        jitterMs: Math.max(1e-6, ackDelayMs * 0.001),
        firstTxS: dataFlow.timeFirstRxNs / 1e9,
        stopS,
        timesForwardedMultiplier: 2,
      }),
    );
  }
  if (init.setting === "udp_burst") {
    flows.push(
      packetFlow({
        flowId: 7,
        sourceAddress: "10.1.1.1",
        destinationAddress: "10.2.1.1",
        protocol: 17,
        sourcePort: 49154,
        destinationPort: UDP_PORT,
        packetBytes: UDP_PACKET_BYTES,
        goodputMbps: init.udpGoodputMbps,
        lossPct: clamp(init.targetLossPct * 0.8, 0.0, 1.0),
        delayMs: Math.max(scenario.baseOwdMs, init.targetDelayMs * 0.95),
        jitterMs: Math.max(1e-6, init.targetJitterMs * 1.1),
        firstTxS: 0.5,
        stopS,
        timesForwardedMultiplier: 2,
      }),
    );
  }
  return new Record(init.setting, scenario, init.protocol, init.seed, flows);
}

/**
 * @param {ProjectConfig} config
 * @param {bigint} seed
 * @returns {Record[]}
 */
function generateRecords(config, seed) {
  /** @type {Record[]} */
  const records = [];
  const baselines = config.protocols.filter(
    (protocol) => protocol !== "TcpSwift",
  );
  for (const setting of SETTINGS) {
    for (const scenario of config.scenarios) {
      const commonRng = new Random(
        stableSeed(seed, setting, scenario.name, "common"),
      );
      const { difficulty, highRtt, edgeNetwork } = scenarioDifficulty(scenario);
      let udpGoodput = 0.0;
      if (setting === "udp_burst") {
        udpGoodput = UDP_AVERAGE_LOAD_FRACTION * scenario.bottleneckMbps;
        udpGoodput *= commonRng.uniform(0.92, 1.02);
      }
      const availableTcp = scenario.bottleneckMbps * 0.985 - udpGoodput;
      let commonEfficiency = 0.8 + 0.08 * (1.0 - difficulty);
      commonEfficiency += commonRng.gauss(0.0, 0.018);
      /** @type {Map<string, Record>} */
      const baselineRecords = new Map();
      for (const protocol of baselines) {
        const rng = new Random(
          stableSeed(seed, setting, scenario.name, protocol),
        );
        const bias =
          protocol === "TcpCubic"
            ? 0.008
            : protocol === "TcpNewReno"
              ? -0.018
              : 0.014 * highRtt - 0.014 * (edgeNetwork ? 1 : 0);
        const efficiency = clamp(
          commonEfficiency + bias + rng.gauss(0.0, 0.012),
          0.64,
          0.9,
        );
        const targetGoodput = availableTcp * efficiency;
        const serializationMs = 12.0 / scenario.bottleneckMbps;
        const queuePackets =
          5.0 + 50.0 * efficiency ** 4 * (1.0 + 0.7 * difficulty);
        const delayFactor =
          protocol === "TcpCubic"
            ? 1.0
            : protocol === "TcpNewReno"
              ? 1.035
              : 0.985;
        let targetDelay = scenario.baseOwdMs + serializationMs * queuePackets;
        targetDelay *= delayFactor * rng.uniform(0.97, 1.03);
        targetDelay = Math.max(
          minimumPathDelayMs(scenario, DATA_PACKET_BYTES),
          targetDelay,
        );
        const targetJitter = Math.max(
          1e-6,
          serializationMs * 0.05,
          targetDelay * rng.uniform(0.002, 0.012) * (1.0 + 0.5 * difficulty),
        );
        const congestion = Math.max(0.0, efficiency - 0.72);
        let targetLoss =
          (congestion * congestion * 0.6 +
            difficulty * 0.015 +
            (setting === "udp_burst" ? 0.012 : 0.0)) *
          rng.uniform(0.75, 1.25);
        targetLoss = clamp(targetLoss, 0.0001, 0.8);
        let sigma = 0.025 + 0.09 * difficulty;
        if (protocol === "TcpNewReno") sigma *= 1.08;
        const weights = normalizedWeights(rng, sigma);
        baselineRecords.set(
          protocol,
          buildRecord({
            setting,
            scenario,
            protocol,
            seed,
            durationS: config.durationS,
            targetGoodputMbps: targetGoodput,
            targetDelayMs: targetDelay,
            targetJitterMs: targetJitter,
            targetLossPct: targetLoss,
            weights,
            udpGoodputMbps: udpGoodput,
            rng,
          }),
        );
      }
      const swiftRng = new Random(
        stableSeed(seed, setting, scenario.name, "TcpSwift"),
      );
      let bestBaseline = -Infinity;
      for (const record of baselineRecords.values())
        bestBaseline = Math.max(bestBaseline, record.goodputMbps);
      const gain = swiftRng.uniform(SWIFT_GAIN_MIN, SWIFT_GAIN_MAX);
      const targetGoodput = Math.min(
        availableTcp * 0.97,
        bestBaseline * (1.0 + gain),
      );
      const baselineDelay = median(
        [...baselineRecords.values()].map((record) => record.delayMs),
      );
      const targetDelay = Math.max(
        minimumPathDelayMs(scenario, DATA_PACKET_BYTES),
        baselineDelay * swiftRng.uniform(SWIFT_DELAY_MIN, SWIFT_DELAY_MAX),
      );
      const baselineJitter = median(
        [...baselineRecords.values()].map((record) => record.jitterMs),
      );
      const targetJitter = Math.max(
        1e-6,
        baselineJitter * swiftRng.uniform(0.9, 1.05),
      );
      const baselineLoss = median(
        [...baselineRecords.values()].map((record) => record.lossPct),
      );
      const targetLoss = Math.max(
        0.0001,
        baselineLoss * swiftRng.uniform(0.85, 1.05),
      );
      const minimumFairness = Math.max(
        0.0,
        median([...baselineRecords.values()].map((record) => record.jain)) -
          FAIRNESS_TOLERANCE,
      );
      const swiftWeights = normalizedWeights(
        swiftRng,
        0.02 + 0.06 * difficulty,
        minimumFairness,
      );
      const fallbackRng = new Random(
        stableSeed(seed, setting, scenario.name, "TcpSwift", "fairness"),
      );
      /** @type {Record | null} */
      let swiftRecord = null;
      for (const [weights, recordRng] of [
        [swiftWeights, swiftRng],
        [[1 / 3, 1 / 3, 1 / 3], fallbackRng],
      ]) {
        const candidate = buildRecord({
          setting,
          scenario,
          protocol: "TcpSwift",
          seed,
          durationS: config.durationS,
          targetGoodputMbps: targetGoodput,
          targetDelayMs: targetDelay,
          targetJitterMs: targetJitter,
          targetLossPct: targetLoss,
          weights: /** @type {number[]} */ (weights),
          udpGoodputMbps: udpGoodput,
          rng: /** @type {Random} */ (recordRng),
        });
        if (candidate.jain >= minimumFairness) {
          swiftRecord = candidate;
          break;
        }
      }
      if (swiftRecord === null) {
        throw new ValueError(
          `Unable to satisfy Swift fairness for ${setting}/${scenario.name}`,
        );
      }
      /** @type {Map<string, Record>} */
      const byProtocol = new Map(baselineRecords);
      byProtocol.set("TcpSwift", swiftRecord);
      for (const protocol of config.protocols) {
        const record = byProtocol.get(protocol);
        if (!record)
          throw new ValueError(`Missing record for protocol ${protocol}`);
        records.push(record);
      }
    }
  }
  return records;
}

/**
 * @param {Record[]} records
 * @param {ProjectConfig} config
 * @returns {ValidationSummary}
 */
function validateRecords(records, config) {
  const expected =
    config.scenarios.length * config.protocols.length * SETTINGS.length;
  if (records.length !== expected) {
    throw new ValueError(
      `Expected ${expected} records, generated ${records.length}`,
    );
  }
  /** @type {Map<string, {key: [string, string], protocols: Map<string, Record>}>} */
  const grouped = new Map();
  for (const record of records) {
    const groupKey = `${record.setting}\u0000${record.scenario.name}`;
    let group = grouped.get(groupKey);
    if (!group) {
      group = {
        key: [record.setting, record.scenario.name],
        protocols: new Map(),
      };
      grouped.set(groupKey, group);
    }
    group.protocols.set(record.protocol, record);
    const metrics = [
      record.goodputMbps,
      record.delayMs,
      record.jitterMs,
      record.lossPct,
      record.jain,
      record.udpGoodputMbps,
    ];
    if (!metrics.every((value) => Number.isFinite(value))) {
      throw new ValueError(
        `Non-finite metric in ${record.setting}/${record.stem}`,
      );
    }
    if (record.goodputMbps <= 0) {
      throw new ValueError(
        `Non-positive goodput in ${record.setting}/${record.stem}`,
      );
    }
    const minimumDelay = minimumPathDelayMs(record.scenario, DATA_PACKET_BYTES);
    if (record.delayMs < minimumDelay) {
      throw new ValueError(
        `Delay below physical floor in ${record.setting}/${record.stem}`,
      );
    }
    if (
      record.jitterMs < 0 ||
      !(record.lossPct >= 0 && record.lossPct <= 100)
    ) {
      throw new ValueError(
        `Invalid jitter/loss in ${record.setting}/${record.stem}`,
      );
    }
    if (!(record.jain >= 0 && record.jain <= 1)) {
      throw new ValueError(
        `Invalid Jain index in ${record.setting}/${record.stem}`,
      );
    }
    const totalLoad = record.goodputMbps + record.udpGoodputMbps;
    if (totalLoad > record.scenario.bottleneckMbps * 0.97) {
      throw new ValueError(
        `Capacity exceeded in ${record.setting}/${record.stem}`,
      );
    }
  }
  /** @type {number[]} */
  const gains = [];
  /** @type {number[]} */
  const delayRatios = [];
  /** @type {number[]} */
  const fairnessDeltas = [];
  const expectedProtocols = new Set(config.protocols);
  for (const group of grouped.values()) {
    const protocolSet = new Set(group.protocols.keys());
    if (
      protocolSet.size !== expectedProtocols.size ||
      [...protocolSet].some((protocol) => !expectedProtocols.has(protocol))
    ) {
      throw new ValueError(
        `Incomplete protocol group ${pyTupleRepr(group.key)}: ${pyListRepr([...protocolSet].sort())}`,
      );
    }
    const swift = /** @type {Record} */ (group.protocols.get("TcpSwift"));
    const baseline = [...group.protocols.entries()]
      .filter(([protocol]) => protocol !== "TcpSwift")
      .map(([, record]) => record);
    let bestGoodput = -Infinity;
    for (const record of baseline)
      bestGoodput = Math.max(bestGoodput, record.goodputMbps);
    const gain = swift.goodputMbps / bestGoodput - 1.0;
    if (!(SWIFT_GAIN_MIN - 0.0002 <= gain && gain <= SWIFT_GAIN_MAX + 0.0002)) {
      throw new ValueError(
        `Swift gain ${formatFixed(gain, 6)} outside target for ${pyTupleRepr(group.key)}`,
      );
    }
    const medianDelay = median(baseline.map((record) => record.delayMs));
    const delayRatio = swift.delayMs / medianDelay;
    if (!(
      SWIFT_DELAY_MIN - 0.001 <= delayRatio &&
      delayRatio <= SWIFT_DELAY_MAX + 0.001
    )) {
      throw new ValueError(
        `Swift delay ratio ${formatFixed(delayRatio, 6)} outside target for ${pyTupleRepr(group.key)}`,
      );
    }
    const medianFairness = median(baseline.map((record) => record.jain));
    const fairnessDelta = swift.jain - medianFairness;
    if (fairnessDelta < -FAIRNESS_TOLERANCE - 1e-6) {
      throw new ValueError(
        `Swift fairness degraded for ${pyTupleRepr(group.key)}: ${formatFixed(fairnessDelta, 6)}`,
      );
    }
    gains.push(gain);
    delayRatios.push(delayRatio);
    fairnessDeltas.push(fairnessDelta);
  }
  return {
    records: BigInt(records.length),
    scenario_protocol_groups: BigInt(grouped.size),
    swift_throughput_gain_pct: [
      pyRoundN(100 * Math.min(...gains), 3),
      pyRoundN(100 * Math.max(...gains), 3),
    ],
    swift_delay_ratio: [
      pyRoundN(Math.min(...delayRatios), 4),
      pyRoundN(Math.max(...delayRatios), 4),
    ],
    swift_fairness_delta: [
      pyRoundN(Math.min(...fairnessDeltas), 6),
      pyRoundN(Math.max(...fairnessDeltas), 6),
    ],
    goodput_mbps: [
      pyRoundN(Math.min(...records.map((record) => record.goodputMbps)), 4),
      pyRoundN(Math.max(...records.map((record) => record.goodputMbps)), 4),
    ],
    delay_ms: [
      pyRoundN(Math.min(...records.map((record) => record.delayMs)), 6),
      pyRoundN(Math.max(...records.map((record) => record.delayMs)), 6),
    ],
    jain: [
      pyRoundN(Math.min(...records.map((record) => record.jain)), 6),
      pyRoundN(Math.max(...records.map((record) => record.jain)), 6),
    ],
  };
}

/* ------------------------------------------------------------------ *
 * XML layer (ElementTree-compatible build/indent/serialize/parse)
 * ------------------------------------------------------------------ */

/**
 * @typedef {object} XmlElement
 * @property {string} tag
 * @property {[string, string][]} attrib
 * @property {string | null} text
 * @property {string | null} tail
 * @property {XmlElement[]} children
 */

/**
 * @param {string} tag
 * @param {{ [key: string]: string }} [attrib]
 * @returns {XmlElement}
 */
function xmlElement(tag, attrib = {}) {
  return {
    tag,
    attrib: Object.entries(attrib),
    text: null,
    tail: null,
    children: [],
  };
}

/**
 * @param {XmlElement} parent
 * @param {string} tag
 * @param {{ [key: string]: string }} [attrib]
 * @returns {XmlElement}
 */
function xmlSubElement(parent, tag, attrib = {}) {
  const child = xmlElement(tag, attrib);
  parent.children.push(child);
  return child;
}

/**
 * @param {XmlElement} element
 * @param {string} key
 * @returns {string | undefined}
 */
function xmlGet(element, key) {
  for (const [name, value] of element.attrib) if (name === key) return value;
  return undefined;
}

/** @param {string} text @returns {string} */
function escapeCdata(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** @param {string} text @returns {string} */
function escapeAttrib(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;")
    .replace(/\t/g, "&#09;");
}

/**
 * Python `ET.indent(tree, space="  ")`.
 *
 * @param {XmlElement} tree
 * @param {string} [space]
 * @param {number} [level]
 */
function xmlIndent(tree, space = "  ", level = 0) {
  if (tree.children.length === 0) return;
  /** @type {string[]} */
  const indentations = [`\n${space.repeat(level)}`];
  /**
   * @param {XmlElement} element
   * @param {number} currentLevel
   */
  const indentChildren = (element, currentLevel) => {
    const childLevel = currentLevel + 1;
    let childIndentation = indentations[childLevel];
    if (childIndentation === undefined) {
      childIndentation = indentations[currentLevel] + space;
      indentations.push(childIndentation);
    }
    if (!element.text || !element.text.trim()) element.text = childIndentation;
    for (const child of element.children) {
      if (child.children.length > 0) indentChildren(child, childLevel);
      if (!child.tail || !child.tail.trim()) child.tail = childIndentation;
    }
    const last = element.children[element.children.length - 1];
    if (!(/** @type {string} */ (last.tail).trim()))
      last.tail = indentations[currentLevel];
  };
  indentChildren(tree, 0);
}

/**
 * Python `ET.tostring(element, encoding="unicode")`.
 *
 * @param {XmlElement} element
 * @returns {string}
 */
function xmlToString(element) {
  /** @type {string[]} */
  const parts = [];
  /** @param {XmlElement} node */
  const serialize = (node) => {
    parts.push(`<${node.tag}`);
    for (const [key, value] of node.attrib)
      parts.push(` ${key}="${escapeAttrib(value)}"`);
    if (node.text || node.children.length > 0) {
      parts.push(">");
      if (node.text) parts.push(escapeCdata(node.text));
      for (const child of node.children) serialize(child);
      parts.push(`</${node.tag}>`);
    } else {
      parts.push(" />");
    }
    if (node.tail) parts.push(node.tail);
  };
  serialize(element);
  return parts.join("");
}

/**
 * Minimal well-formed XML parser (sufficient for documents this module emits).
 *
 * @param {string} text
 * @returns {XmlElement}
 */
function xmlFromString(text) {
  let pos = 0;
  const skipSpace = () => {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
  };
  const decode = (/** @type {string} */ value) =>
    value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
      if (body === "amp") return "&";
      if (body === "lt") return "<";
      if (body === "gt") return ">";
      if (body === "quot") return '"';
      if (body === "apos") return "'";
      const raw = /** @type {string} */ (body);
      if (raw.startsWith("#x") || raw.startsWith("#X"))
        return String.fromCodePoint(Number.parseInt(raw.slice(2), 16));
      if (raw.startsWith("#"))
        return String.fromCodePoint(Number.parseInt(raw.slice(1), 10));
      return match;
    });
  /** @returns {XmlElement} */
  const parseElement = () => {
    pos++; // consume '<'
    const nameMatch = /^[^\s/>]+/.exec(text.slice(pos));
    if (!nameMatch) throw new ValueError("malformed XML element");
    const tag = nameMatch[0];
    pos += tag.length;
    const element = xmlElement(tag);
    for (;;) {
      skipSpace();
      if (text[pos] === "/") {
        pos += 2; // consume '/>'
        return element;
      }
      if (text[pos] === ">") {
        pos++;
        break;
      }
      const attrMatch = /^([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/.exec(
        text.slice(pos),
      );
      if (!attrMatch) throw new ValueError("malformed XML attribute");
      element.attrib.push([
        attrMatch[1],
        decode(attrMatch[3] ?? attrMatch[4] ?? ""),
      ]);
      pos += attrMatch[0].length;
    }
    for (;;) {
      const next = text.indexOf("<", pos);
      if (next === -1) throw new ValueError("unterminated XML element");
      const chunk = text.slice(pos, next);
      if (chunk && (!element.text || element.children.length === 0)) {
        element.text = (element.text ?? "") + decode(chunk);
      } else if (chunk && element.children.length > 0) {
        const lastChild = element.children[element.children.length - 1];
        lastChild.tail = (lastChild.tail ?? "") + decode(chunk);
      }
      pos = next;
      if (text.startsWith("</", pos)) {
        const closeMatch = /^<\/([^\s>]+)\s*>/.exec(text.slice(pos));
        if (!closeMatch || closeMatch[1] !== tag)
          throw new ValueError(`mismatched closing tag for ${tag}`);
        pos += closeMatch[0].length;
        return element;
      }
      if (text.startsWith("<!--", pos)) {
        const end = text.indexOf("-->", pos);
        if (end === -1) throw new ValueError("unterminated comment");
        pos = end + 3;
        continue;
      }
      if (text.startsWith("<?", pos)) {
        const end = text.indexOf("?>", pos);
        if (end === -1)
          throw new ValueError("unterminated processing instruction");
        pos = end + 2;
        continue;
      }
      element.children.push(parseElement());
    }
  };
  skipSpace();
  while (text.startsWith("<?", pos) || text.startsWith("<!--", pos)) {
    if (text.startsWith("<?", pos)) {
      const end = text.indexOf("?>", pos);
      if (end === -1)
        throw new ValueError("unterminated processing instruction");
      pos = end + 2;
    } else {
      const end = text.indexOf("-->", pos);
      if (end === -1) throw new ValueError("unterminated comment");
      pos = end + 3;
    }
    skipSpace();
  }
  return parseElement();
}

/**
 * Collect every descendant of `element` in document (pre-)order.
 *
 * @param {XmlElement} element
 * @returns {XmlElement[]}
 */
function xmlDescendants(element) {
  /** @type {XmlElement[]} */
  const result = [];
  for (const child of element.children) {
    result.push(child);
    result.push(...xmlDescendants(child));
  }
  return result;
}

/**
 * A small subset of ElementTree's `findall`, covering the two patterns used
 * here: `./A/B` and `.//A/B`.
 *
 * @param {XmlElement} element
 * @param {string} pattern
 * @returns {XmlElement[]}
 */
function xmlFindAll(element, pattern) {
  const descendant = pattern.startsWith(".//");
  const rest = descendant
    ? pattern.slice(3)
    : pattern.startsWith("./")
      ? pattern.slice(2)
      : pattern;
  const steps = rest.split("/");
  let current = [element];
  for (let i = 0; i < steps.length; i++) {
    const name = steps[i];
    /** @type {XmlElement[]} */
    const next = [];
    for (const node of current) {
      const scope =
        descendant && i === 0 ? xmlDescendants(node) : node.children;
      for (const child of scope) if (child.tag === name) next.push(child);
    }
    current = next;
  }
  return current;
}

/* ------------------------------------------------------------------ *
 * Renderers
 * ------------------------------------------------------------------ */

/**
 * @param {Flow} flow
 * @returns {{ [key: string]: string }}
 */
function flowAttributes(flow) {
  return {
    flowId: intToString(flow.flowId),
    timeFirstTxPacket: `+${intToString(flow.timeFirstTxNs)}ns`,
    timeFirstRxPacket: `+${intToString(flow.timeFirstRxNs)}ns`,
    timeLastTxPacket: `+${intToString(flow.timeLastTxNs)}ns`,
    timeLastRxPacket: `+${intToString(flow.timeLastRxNs)}ns`,
    delaySum: `+${intToString(flow.delaySumNs)}ns`,
    jitterSum: `+${intToString(flow.jitterSumNs)}ns`,
    lastDelay: `+${intToString(flow.lastDelayNs)}ns`,
    txBytes: intToString(flow.txBytes),
    rxBytes: intToString(flow.rxBytes),
    txPackets: intToString(flow.txPackets),
    rxPackets: intToString(flow.rxPackets),
    lostPackets: intToString(flow.lostPackets),
    timesForwarded: intToString(flow.timesForwarded),
  };
}

/**
 * @param {Record} record
 * @returns {string}
 */
function renderFlowmonitor(record) {
  const root = xmlElement("FlowMonitor");
  const metadata = xmlSubElement(root, "Metadata");
  metadata.attrib.push(["setting", record.setting]);
  metadata.attrib.push(["scenario", record.scenario.name]);
  metadata.attrib.push(["protocol", record.protocol]);
  const stats = xmlSubElement(root, "FlowStats");
  for (const flow of record.flows) {
    const flowElement = xmlSubElement(stats, "Flow", flowAttributes(flow));
    const delayHistogram = xmlSubElement(flowElement, "delayHistogram", {
      nBins: "1",
    });
    xmlSubElement(delayHistogram, "bin", {
      index: "0",
      start: "0",
      width: formatGeneral(Math.max(1e-9, (2 * flow.delayMs) / 1000), 9),
      count: intToString(flow.rxPackets),
    });
    const jitterHistogram = xmlSubElement(flowElement, "jitterHistogram", {
      nBins: "1",
    });
    xmlSubElement(jitterHistogram, "bin", {
      index: "0",
      start: "0",
      width: formatGeneral(Math.max(1e-9, (2 * flow.jitterMs) / 1000), 9),
      count: intToString(Math.max(0, flow.rxPackets - 1)),
    });
    const packetHistogram = xmlSubElement(flowElement, "packetSizeHistogram", {
      nBins: "1",
    });
    xmlSubElement(packetHistogram, "bin", {
      index: "0",
      start: intToString(flow.packetBytes),
      width: "1",
      count: intToString(flow.rxPackets),
    });
    const interruptionCount =
      flow.protocol === 17 ? Math.max(1, Math.trunc(flow.durationS)) : 0;
    const interruptions = xmlSubElement(
      flowElement,
      "flowInterruptionsHistogram",
      {
        nBins: interruptionCount ? "1" : "0",
      },
    );
    if (interruptionCount) {
      xmlSubElement(interruptions, "bin", {
        index: "0",
        start: "0.5",
        width: "0.5",
        count: intToString(interruptionCount),
      });
    }
  }
  const classifier = xmlSubElement(root, "Ipv4FlowClassifier");
  for (const flow of record.flows) {
    const classified = xmlSubElement(classifier, "Flow", {
      flowId: intToString(flow.flowId),
      sourceAddress: flow.sourceAddress,
      destinationAddress: flow.destinationAddress,
      protocol: intToString(flow.protocol),
      sourcePort: intToString(flow.sourcePort),
      destinationPort: intToString(flow.destinationPort),
    });
    xmlSubElement(classified, "Dscp", {
      value: "0x0",
      packets: intToString(flow.txPackets),
    });
  }
  xmlSubElement(root, "Ipv6FlowClassifier");
  const probes = xmlSubElement(root, "FlowProbes");
  const probe = xmlSubElement(probes, "FlowProbe", { index: "0" });
  for (const flow of record.flows) {
    xmlSubElement(probe, "FlowStats", {
      flowId: intToString(flow.flowId),
      packets: intToString(flow.rxPackets),
      bytes: intToString(flow.rxBytes),
      delayFromFirstProbeSum: `+${intToString(flow.delaySumNs)}ns`,
    });
  }
  xmlIndent(root, "  ");
  return `<?xml version="1.0" ?>\n${xmlToString(root)}\n`;
}

/**
 * @param {Record} record
 * @returns {string}
 */
function renderNs3Log(record) {
  /** @type {string[]} */
  const lines = [
    "Ns3Env parameters:",
    `--Tcp version: ns3::${record.protocol}`,
    `AccessBW: ${record.scenario.accessRate}`,
    `BottleneckBW: ${record.scenario.bottleneckRate}`,
  ];
  for (const flow of record.flows) {
    const kind = flow.protocol === 17 ? "UDP" : "TCP";
    lines.push(
      `${kind} Flow ${intToString(flow.flowId)} Src Addr: ${flow.sourceAddress} Dst Addr: ${flow.destinationAddress}`,
      `Time Last Rx Packet: ${formatGeneral(flow.timeLastRxNs / 1e9, 9)}`,
      `Time First Tx Packet: ${formatGeneral(flow.timeFirstTxNs / 1e9, 9)}`,
      `Tx Packets Count: ${intToString(flow.txPackets)}`,
      `Rx Packets Count: ${intToString(flow.rxPackets)}`,
      `Loss Rate: ${formatFixed(flow.txPackets ? (100 * flow.lostPackets) / flow.txPackets : 0, 6)}%`,
      `Throughput: ${formatFixed(flow.goodputMbps, 6)} Mbps`,
    );
  }
  const forwardFlows = record.forwardFlows;
  let totalRxBytes = 0;
  for (const flow of forwardFlows) totalRxBytes += flow.rxBytes;
  lines.push(
    `AggregateThroughput: ${formatFixed(record.goodputMbps, 6)} Mbps`,
    `AggregateLossRate: ${formatFixed(record.lossPct, 6)} %`,
    "RxPkts:",
    ...forwardFlows.map(
      (flow, index) =>
        `---SinkId: ${index} RxPkts: ${intToString(flow.rxPackets)}`,
    ),
    `Total Rx Bytes Count: ${intToString(totalRxBytes)}`,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * @param {Record} record
 * @returns {string}
 */
function renderAgentLog(record) {
  return [`Scenario: ${record.scenario.name}`, ""].join("\n");
}

/**
 * Quote a single CSV field using Python's `csv` QUOTE_MINIMAL rules.
 *
 * @param {string} field
 * @returns {string}
 */
function csvField(field) {
  if (/[",\r\n]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}

/**
 * Python `csv.DictWriter(...).writeheader()` + `writerows(rows)` with the
 * default `excel` dialect (`,` delimiter, `\r\n` terminator, minimal quoting).
 *
 * @param {string[]} fieldnames
 * @param {Array<{ [key: string]: unknown }>} rows
 * @returns {string}
 */
function csvText(fieldnames, rows) {
  /** @type {string[]} */
  const lines = [fieldnames.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(
      fieldnames
        .map((name) => {
          const value = Object.hasOwn(row, name) ? row[name] : "";
          if (value === null || value === undefined) return "";
          return csvField(
            typeof value === "string"
              ? value
              : intToString(/** @type {number} */ (value)),
          );
        })
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Python `datetime.now(timezone.utc).isoformat()`.
 *
 * @returns {string}
 */
function utcIsoformat() {
  const now = new Date();
  const pad = (/** @type {number} */ value, /** @type {number} */ width = 2) =>
    String(value).padStart(width, "0");
  const date = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  const microseconds = now.getUTCMilliseconds() * 1000;
  const fraction = microseconds === 0 ? "" : `.${pad(microseconds, 6)}`;
  return `${date}T${time}${fraction}+00:00`;
}

/**
 * Python `json.dumps(value, ensure_ascii=False, indent=2)`.
 *
 * @param {unknown} value
 * @param {number} [indentLevel]
 * @returns {string}
 */
function jsonDumps(value, indentLevel = 0) {
  const indent = "  ".repeat(indentLevel);
  const childIndent = "  ".repeat(indentLevel + 1);
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return pyFloatRepr(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return jsonString(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map(
      (item) => `${childIndent}${jsonDumps(item, indentLevel + 1)}`,
    );
    return `[\n${items.join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(
    /** @type {{ [key: string]: unknown }} */ (value),
  );
  if (entries.length === 0) return "{}";
  const items = entries.map(
    ([key, item]) =>
      `${childIndent}${jsonString(key)}: ${jsonDumps(item, indentLevel + 1)}`,
  );
  return `{\n${items.join(",\n")}\n${indent}}`;
}

/** @param {string} value @returns {string} */
function jsonString(value) {
  let out = '"';
  for (const ch of value) {
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (ch < " ")
      out += `\\u${ch.codePointAt(0)?.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return `${out}"`;
}

/**
 * @param {Record[]} records
 * @param {ProjectConfig} config
 * @param {bigint} seed
 * @param {ValidationSummary} summary
 * @returns {Map<string, string>}
 */
function buildArtifacts(records, config, seed, summary) {
  void seed;
  /** @type {Map<string, string>} */
  const artifacts = new Map();
  /** @type {Map<string, Array<{ [key: string]: unknown }>>} */
  const summaryRows = new Map(SETTINGS.map((setting) => [setting, []]));
  /** @type {Array<{ [key: string]: unknown }>} */
  const kpiRows = [];
  for (const record of records) {
    const base = `${record.artifactDirectory}/${record.stem}`;
    artifacts.set(`${base}.flowmonitor`, renderFlowmonitor(record));
    artifacts.set(`${base}_ns3.log`, renderNs3Log(record));
    if (record.protocol === "TcpSwift")
      artifacts.set(`${base}_agent.log`, renderAgentLog(record));
    /** @type {Array<{ [key: string]: unknown }>} */
    const settingRows = /** @type {Array<{ [key: string]: unknown }>} */ (
      summaryRows.get(record.setting)
    );
    settingRows.push({
      Scenario: record.scenario.name,
      Protocol: record.protocol,
      "Throughput (Mbps)": formatFixed(record.goodputMbps, 4),
      "Delay (ms)": formatFixed(record.delayMs, 6),
      "Jitter (ms)": formatFixed(record.jitterMs, 6),
      "Loss (%)": formatFixed(record.lossPct, 6),
    });
    const classifierPorts = `49153/${TCP_PORT}`;
    kpiRows.push({
      Setting: record.setting,
      Scenario: record.scenario.name,
      Protocol: record.protocol,
      BottleneckMbps: formatFixed(record.scenario.bottleneckMbps, 4),
      BaseOwdMs: formatFixed(record.scenario.baseOwdMs, 6),
      Flows: record.forwardFlows.length,
      SinkPort: classifierPorts,
      Goodput_Mbps: formatFixed(record.goodputMbps, 4),
      Util: formatFixed(record.goodputMbps / record.scenario.bottleneckMbps, 6),
      Delay_ms: formatFixed(record.delayMs, 6),
      Jitter_ms: formatFixed(record.jitterMs, 6),
      Loss_pct: formatFixed(record.lossPct, 6),
      Jain: formatFixed(record.jain, 6),
      Source: `${base}.flowmonitor`,
    });
  }
  const summaryFields = [
    "Scenario",
    "Protocol",
    "Throughput (Mbps)",
    "Delay (ms)",
    "Jitter (ms)",
    "Loss (%)",
    "GeneratorSeed",
  ];
  artifacts.set(
    "plots/summary.csv",
    csvText(
      summaryFields,
      /** @type {Array<{ [key: string]: unknown }>} */ (
        summaryRows.get("tcp_only")
      ),
    ),
  );
  artifacts.set(
    "plots-udp/summary.csv",
    csvText(
      summaryFields,
      /** @type {Array<{ [key: string]: unknown }>} */ (
        summaryRows.get("udp_burst")
      ),
    ),
  );
  const kpiFields = [
    "Setting",
    "Scenario",
    "Protocol",
    "BottleneckMbps",
    "BaseOwdMs",
    "Flows",
    "SinkPort",
    "Goodput_Mbps",
    "Util",
    "Delay_ms",
    "Jitter_ms",
    "Loss_pct",
    "Jain",
    "Source",
    "GeneratorSeed",
  ];
  artifacts.set("summary/kpi_forward.csv", csvText(kpiFields, kpiRows));
  const sortedPaths = [...artifacts.keys()].sort();
  const inventory = sortedPaths.map((artifactPath) => {
    const content = /** @type {string} */ (artifacts.get(artifactPath));
    return {
      path: artifactPath,
      bytes: BigInt(Buffer.byteLength(content, "utf8")),
      sha256: createHash("sha256").update(content, "utf8").digest("hex"),
    };
  });
  let flowmonitorCount = 0;
  let ns3Count = 0;
  let agentCount = 0;
  let csvCount = 0;
  for (const artifactPath of artifacts.keys()) {
    if (artifactPath.endsWith(".flowmonitor")) flowmonitorCount++;
    else if (artifactPath.endsWith("_ns3.log")) ns3Count++;
    else if (artifactPath.endsWith("_agent.log")) agentCount++;
    else if (artifactPath.endsWith(".csv")) csvCount++;
  }
  const manifest = {
    generated_at_utc: utcIsoformat(),
    source_configuration:
      "main.py: SCENARIOS, DEFAULT_PROTOCOLS, DEFAULT_DURATION, DEFAULT_N_LEAF",
    source_paths_relative_to_bundle_root: true,
    scenario_count: BigInt(config.scenarios.length),
    protocols: config.protocols,
    settings: [...SETTINGS],
    model_assumptions: {
      topology: "three forward TCP flows over a shared dumbbell bottleneck",
      udp_burst: `${formatFixed(UDP_AVERAGE_LOAD_FRACTION / UDP_DUTY_CYCLE, 2)}x bottleneck peak offered rate with ${formatPercent(UDP_DUTY_CYCLE, 0)} duty cycle (${formatPercent(UDP_AVERAGE_LOAD_FRACTION, 0)} time-average offered load)`,
      swift_throughput_gain: [SWIFT_GAIN_MIN, SWIFT_GAIN_MAX],
      swift_delay_ratio: [SWIFT_DELAY_MIN, SWIFT_DELAY_MAX],
      swift_fairness_tolerance: FAIRNESS_TOLERANCE,
    },
    validation: summary,
    artifact_counts: {
      flowmonitor: BigInt(flowmonitorCount),
      ns3_log: BigInt(ns3Count),
      agent_log: BigInt(agentCount),
      csv: BigInt(csvCount),
    },
    files: inventory,
  };
  artifacts.set("manifest.json", `${jsonDumps(manifest)}\n`);
  return artifacts;
}

/* ------------------------------------------------------------------ *
 * Artifact validation (parse the emitted XML back and compare KPIs)
 * ------------------------------------------------------------------ */

/**
 * Python `parse_ns`.
 *
 * @param {string | undefined} value
 * @returns {number}
 */
function parseNs(value) {
  let text = value || "0ns";
  while (text.startsWith("+") || text.endsWith("+")) {
    if (text.startsWith("+")) text = text.slice(1);
    if (text.endsWith("+")) text = text.slice(0, -1);
  }
  if (text.endsWith("ns")) text = text.slice(0, -2);
  return pyParseFloat(text);
}

/**
 * Recompute the forward KPIs from a FlowMonitor XML document.
 *
 * @param {string} content
 * @returns {{goodput: number, delay: number, jitter: number, loss: number, jain: number, udp_goodput: number}}
 */
function flowmonitorKpi(content) {
  const root = xmlFromString(content);
  /** @type {Map<number, XmlElement>} */
  const classifiers = new Map();
  for (const element of xmlFindAll(root, ".//Ipv4FlowClassifier/Flow")) {
    classifiers.set(
      Number(pyParseInt(xmlGet(element, "flowId") ?? "0")),
      element,
    );
  }
  /** @type {number[]} */
  const goodputs = [];
  /** @type {number[]} */
  const delays = [];
  /** @type {number[]} */
  const jitters = [];
  let txPackets = 0;
  let lostPackets = 0;
  let udpGoodput = 0.0;
  for (const flow of xmlFindAll(root, "./FlowStats/Flow")) {
    const flowId = Number(pyParseInt(xmlGet(flow, "flowId") ?? "0"));
    const classifier = classifiers.get(flowId);
    if (!classifier)
      throw new ValueError(`Flow ${flowId} missing from Ipv4FlowClassifier`);
    const protocol = Number(pyParseInt(xmlGet(classifier, "protocol") ?? "0"));
    const durationS =
      (parseNs(xmlGet(flow, "timeLastRxPacket")) -
        parseNs(xmlGet(flow, "timeFirstTxPacket"))) /
      1e9;
    const goodput =
      (Number(pyParseInt(xmlGet(flow, "rxBytes") ?? "0")) * 8) /
      durationS /
      1e6;
    if (protocol === 17) {
      udpGoodput += goodput;
      continue;
    }
    const isForward =
      (xmlGet(classifier, "sourceAddress") ?? "").startsWith("10.1.") &&
      (xmlGet(classifier, "destinationAddress") ?? "").startsWith("10.2.");
    if (!isForward) continue;
    const rxPackets = Number(pyParseInt(xmlGet(flow, "rxPackets") ?? "0"));
    goodputs.push(goodput);
    delays.push(parseNs(xmlGet(flow, "delaySum")) / rxPackets / 1e6);
    jitters.push(
      parseNs(xmlGet(flow, "jitterSum")) / Math.max(1, rxPackets - 1) / 1e6,
    );
    txPackets += Number(pyParseInt(xmlGet(flow, "txPackets") ?? "0"));
    lostPackets += Number(pyParseInt(xmlGet(flow, "lostPackets") ?? "0"));
  }
  let goodputTotal = 0;
  for (const goodput of goodputs) goodputTotal += goodput;
  return {
    goodput: goodputTotal,
    delay: fmean(delays),
    jitter: fmean(jitters),
    loss: (100 * lostPackets) / txPackets,
    jain: jainIndex(goodputs),
    udp_goodput: udpGoodput,
  };
}

/**
 * @param {Map<string, string>} artifacts
 * @param {Record[]} records
 * @param {ProjectConfig} config
 * @returns {{flowmonitor: bigint, ns3_log: bigint, agent_log: bigint, csv: bigint}}
 */
function validateArtifacts(artifacts, records, config) {
  const expectedRecords =
    config.scenarios.length * config.protocols.length * SETTINGS.length;
  const paths = [...artifacts.keys()];
  const flowmonitorPaths = paths.filter((p) => p.endsWith(".flowmonitor"));
  const ns3Paths = paths.filter((p) => p.endsWith("_ns3.log"));
  const agentPaths = paths.filter((p) => p.endsWith("_agent.log"));
  const csvPaths = paths.filter((p) => p.endsWith(".csv"));
  /** @type {Map<string, number>} */
  const expectedCounts = new Map([
    ["flowmonitor", expectedRecords],
    ["ns3_log", expectedRecords],
    ["agent_log", config.scenarios.length * SETTINGS.length],
    ["csv", 3],
  ]);
  /** @type {Map<string, number>} */
  const actualCounts = new Map([
    ["flowmonitor", flowmonitorPaths.length],
    ["ns3_log", ns3Paths.length],
    ["agent_log", agentPaths.length],
    ["csv", csvPaths.length],
  ]);
  let countsMatch = expectedCounts.size === actualCounts.size;
  for (const [key, value] of expectedCounts) {
    if (actualCounts.get(key) !== value) countsMatch = false;
  }
  if (!countsMatch) {
    throw new ValueError(
      `Artifact counts differ: ${pyDictRepr(actualCounts)} != ${pyDictRepr(expectedCounts)}`,
    );
  }
  /** @type {Map<string, Record>} */
  const recordByPath = new Map();
  for (const record of records) {
    recordByPath.set(
      `${record.artifactDirectory}/${record.stem}.flowmonitor`,
      record,
    );
  }
  for (const artifactPath of flowmonitorPaths) {
    const content = /** @type {string} */ (artifacts.get(artifactPath));
    const parsed = flowmonitorKpi(content);
    const record = /** @type {Record} */ (recordByPath.get(artifactPath));
    /** @type {{ [key: string]: number }} */
    const expected = {
      goodput: record.goodputMbps,
      delay: record.delayMs,
      jitter: record.jitterMs,
      loss: record.lossPct,
      jain: record.jain,
      udp_goodput: record.udpGoodputMbps,
    };
    for (const [metric, value] of Object.entries(expected)) {
      const parsedValue = parsed[/** @type {keyof typeof parsed} */ (metric)];
      if (!isClose(parsedValue, value, 1e-10, 1e-10)) {
        throw new ValueError(
          `XML ${artifactPath} changed ${metric}: ${pyFloatRepr(parsedValue)} != ${pyFloatRepr(value)}`,
        );
      }
    }
  }
  return {
    flowmonitor: BigInt(flowmonitorPaths.length),
    ns3_log: BigInt(ns3Paths.length),
    agent_log: BigInt(agentPaths.length),
    csv: BigInt(csvPaths.length),
  };
}

/* ------------------------------------------------------------------ *
 * Filesystem publish layer
 * ------------------------------------------------------------------ */

/**
 * Python `expanduser` (POSIX, `~` and `~/...` only).
 *
 * @param {string} target
 * @returns {string}
 */
function expandUser(target) {
  if (!target.startsWith("~")) return target;
  const separatorIndex = target.indexOf("/", 1);
  const end = separatorIndex === -1 ? target.length : separatorIndex;
  if (end === 1) {
    const home = process.env.HOME ?? os.homedir();
    const trimmed = home.replace(/\/+$/, "");
    const rest = target.slice(1);
    return `${trimmed}${rest}` || "/";
  }
  // ~user/... cannot be resolved without a passwd database; Python returns the
  // path unchanged when the user is unknown, so do the same.
  return target;
}

/**
 * Python `Path.resolve()` (non-strict): resolve symlinks for the longest
 * existing prefix and keep the remaining components.
 *
 * @param {string} target
 * @returns {string}
 */
function resolvePath(target) {
  const absolute = path.resolve(target);
  /** @type {string[]} */
  const missing = [];
  let current = absolute;
  for (;;) {
    let real;
    try {
      real = fs.realpathSync(current);
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code;
      if (code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missing.unshift(path.basename(current));
      current = parent;
      continue;
    }
    return missing.length > 0 ? path.join(real, ...missing) : real;
  }
}

/** @param {string} target @returns {boolean} */
function pathExists(target) {
  return fs.existsSync(target);
}

/** @param {string} target @returns {boolean} */
function isSymlink(target) {
  const stats = fs.lstatSync(target, { throwIfNoEntry: false });
  return stats ? stats.isSymbolicLink() : false;
}

/** @param {string} target @returns {boolean} */
function isDirectory(target) {
  const stats = fs.statSync(target, { throwIfNoEntry: false });
  return stats ? stats.isDirectory() : false;
}

/** @param {string} target @returns {boolean} */
function isFile(target) {
  const stats = fs.statSync(target, { throwIfNoEntry: false });
  return stats ? stats.isFile() : false;
}

/** @param {string} target @returns {boolean} */
function directoryIsEmpty(target) {
  return fs.readdirSync(target).length === 0;
}

/**
 * Python `validated_relative_path`.
 *
 * @param {string} value
 * @returns {string} A normalized relative path.
 */
function validatedRelativePath(value) {
  const parts = value.split("/").filter((part) => part !== "");
  const isAbsolute = value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
  if (
    isAbsolute ||
    parts.length === 0 ||
    parts.some((part) => part === "." || part === "..") ||
    parts.join("/") !== value
  ) {
    throw new ValueError(`Unsafe artifact path: ${value}`);
  }
  return value;
}

/**
 * Python `validate_output_path`.
 *
 * @param {string} output
 * @returns {string} The resolved output directory.
 */
function validateOutputPath(output) {
  const expanded = expandUser(output);
  if (isSymlink(expanded))
    throw new ValueError(`Refusing symlink output: ${expanded}`);
  const resolved = resolvePath(expanded);
  if (resolved === path.parse(resolved).root)
    throw new ValueError("Refusing to use a filesystem root as output");
  return resolved;
}

/**
 * Recursively list every entry under `root` (files and directories), raising on
 * symlinks, mirroring `Path.rglob("*")` + the symlink guard.
 *
 * @param {string} root
 * @returns {{files: string[], sawSymlink: string | null}}
 */
function walkBundle(root) {
  /** @type {string[]} */
  const files = [];
  /** @type {string | null} */
  let sawSymlink = null;
  /** @param {string} dir */
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stats = fs.lstatSync(full);
      if (stats.isSymbolicLink()) {
        sawSymlink = full;
        return;
      }
      if (stats.isDirectory()) visit(full);
      else if (stats.isFile()) files.push(full);
    }
  };
  visit(root);
  return { files, sawSymlink };
}

/**
 * Python `validate_existing_output`.
 *
 * @param {string} output
 */
function validateExistingOutput(output) {
  if (!pathExists(output)) return;
  if (!isDirectory(output))
    throw new ValueError(`Output exists and is not a directory: ${output}`);
  if (directoryIsEmpty(output)) return;
  const manifestPath = path.join(output, "manifest.json");
  if (!isFile(manifestPath))
    throw new ValueError(`Non-empty output is not generator-owned: ${output}`);
  /** @type {unknown} */
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    throw new ValueError(`Non-empty output is not generator-owned: ${output}`);
  }
  const inventory =
    manifest && typeof manifest === "object" && !Array.isArray(manifest)
      ? /** @type {{ [key: string]: unknown }} */ (manifest).files
      : undefined;
  if (!Array.isArray(inventory))
    throw new ValueError(`Output manifest lacks a file inventory: ${output}`);
  /** @type {Map<string, {bytes: number, sha256: string}>} */
  const expected = new Map();
  for (const item of inventory) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ValueError(`Invalid manifest inventory entry in ${output}`);
    }
    const entry = /** @type {{ [key: string]: unknown }} */ (item);
    const relative = validatedRelativePath(String(entry.path ?? ""));
    if (relative === "manifest.json" || expected.has(relative)) {
      throw new ValueError(`Invalid or duplicate inventory path: ${relative}`);
    }
    expected.set(relative, {
      bytes: Number(entry.bytes ?? -1),
      sha256: String(entry.sha256 ?? ""),
    });
  }
  const { files, sawSymlink } = walkBundle(output);
  if (sawSymlink !== null)
    throw new ValueError(`Refusing bundle containing symlink: ${sawSymlink}`);
  const actual = new Set(
    files.map((file) => path.relative(output, file).split(path.sep).join("/")),
  );
  const expectedPaths = new Set([...expected.keys(), "manifest.json"]);
  const sameSize = actual.size === expectedPaths.size;
  let same = sameSize;
  if (sameSize) {
    for (const item of actual) if (!expectedPaths.has(item)) same = false;
  }
  if (!same) {
    const added = [...actual].filter((item) => !expectedPaths.has(item)).sort();
    const missing = [...expectedPaths]
      .filter((item) => !actual.has(item))
      .sort();
    throw new ValueError(
      `Bundle inventory mismatch; added=${pyListRepr(added)}, missing=${pyListRepr(missing)}`,
    );
  }
  for (const [relative, expectedEntry] of expected) {
    const content = fs.readFileSync(path.join(output, relative));
    const actualHash = createHash("sha256").update(content).digest("hex");
    if (
      content.length !== expectedEntry.bytes ||
      actualHash !== expectedEntry.sha256
    ) {
      throw new ValueError(`Bundle file changed since generation: ${relative}`);
    }
  }
}

/**
 * Python `publish_artifacts`: stage into a temp directory, then atomically swap
 * it into place, keeping a backup for rollback on failure.
 *
 * @param {string} output
 * @param {Map<string, string>} artifacts
 */
function publishArtifacts(output, artifacts) {
  validateExistingOutput(output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const stage = fs.mkdtempSync(
    path.join(path.dirname(output), `.${path.basename(output)}.stage-`),
  );
  const stageRoot = resolvePath(stage);
  /** @type {string | null} */
  let backup = null;
  let installed = false;
  try {
    for (const [relative, content] of artifacts) {
      const relativePath = validatedRelativePath(relative);
      const destination = resolvePath(path.join(stage, relativePath));
      if (
        destination !== stageRoot &&
        !destination.startsWith(stageRoot + path.sep)
      ) {
        throw new ValueError(`Artifact escapes staging directory: ${relative}`);
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content, "utf8");
    }
    JSON.parse(fs.readFileSync(path.join(stage, "manifest.json"), "utf8"));
    if (pathExists(output)) {
      if (!directoryIsEmpty(output)) {
        backup = path.join(
          path.dirname(output),
          `.${path.basename(output)}.backup-${process.pid}-${randomBytes(4).toString("hex")}`,
        );
        fs.renameSync(output, backup);
      } else {
        fs.rmdirSync(output);
      }
    }
    fs.renameSync(stage, output);
    installed = true;
  } catch (error) {
    if (installed && backup !== null && pathExists(output))
      fs.rmSync(output, { recursive: true, force: true });
    if (backup !== null && pathExists(backup) && !pathExists(output))
      fs.renameSync(backup, output);
    if (pathExists(stage)) fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  if (backup !== null) {
    try {
      fs.rmSync(backup, { recursive: true, force: true });
    } catch (error) {
      process.stderr.write(
        `Warning: unable to remove backup ${backup}: ${/** @type {Error} */ (error).message}\n`,
      );
    }
  }
}

/**
 * Python `display_path`.
 *
 * @param {string} target
 * @returns {string}
 */
function displayPath(target) {
  if (target === REPO_ROOT) return ".";
  if (target.startsWith(REPO_ROOT + path.sep)) {
    return path.relative(REPO_ROOT, target).split(path.sep).join("/");
  }
  return "<custom-output>";
}

/* ------------------------------------------------------------------ *
 * CLI (argparse-compatible subset)
 * ------------------------------------------------------------------ */

const PROG = path.basename(process.argv[1] ?? "mock.mjs");
const USAGE = `usage: ${PROG} [-h] [--apply] [--seed SEED] [--output OUTPUT]`;

/**
 * @typedef {object} CliArgs
 * @property {boolean} apply
 * @property {bigint | null} seed
 * @property {string} output
 */

/** @returns {string} */
function formatHelp() {
  const rows = [
    ["-h, --help", "show this help message and exit"],
    ["--apply", "Write fixtures after validation; default is dry-run"],
    ["--seed SEED", "Reproducible generator seed"],
    ["--output OUTPUT", "Output root (default: logs)"],
  ];
  const lines = [USAGE, "", "Generate TcpSwift logs.", "", "options:"];
  for (const [invocation, text] of rows)
    lines.push(`  ${invocation.padEnd(15)}  ${text}`);
  return `${lines.join("\n")}\n`;
}

/**
 * @param {string} message
 * @returns {never}
 */
function parserError(message) {
  process.stderr.write(`${USAGE}\n${PROG}: error: ${message}\n`);
  process.exit(2);
}

/**
 * Parse `process.argv`-style arguments, mirroring the argparse behaviour used by
 * `docs/mock.py` (long options, `--opt=value`, unambiguous prefixes, `-h`).
 *
 * @param {string[]} argv
 * @returns {CliArgs}
 */
function parseArgs(argv) {
  /** @type {ReadonlyArray<{flags: string[], dest: "apply" | "seed" | "output", takesValue: boolean}>} */
  const options = [
    { flags: ["--apply"], dest: "apply", takesValue: false },
    { flags: ["--seed"], dest: "seed", takesValue: true },
    { flags: ["--output"], dest: "output", takesValue: true },
  ];
  /** @type {CliArgs} */
  const result = { apply: false, seed: null, output: DEFAULT_OUTPUT };
  /** @type {string[]} */
  const unrecognized = [];
  let seenHelp = false;
  let positionalsOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (positionalsOnly || arg === "-" || !arg.startsWith("-")) {
      unrecognized.push(arg);
      continue;
    }
    if (arg === "--") {
      positionalsOnly = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      seenHelp = true;
      continue;
    }
    let name = arg;
    /** @type {string | undefined} */
    let explicit;
    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      if (equals !== -1) {
        name = arg.slice(0, equals);
        explicit = arg.slice(equals + 1);
      }
    }
    const matches = options.filter((option) =>
      option.flags.some((flag) => flag === name),
    );
    let option = matches.length === 1 ? matches[0] : undefined;
    if (!option) {
      const prefixMatches = options.filter((candidate) =>
        candidate.flags.some((flag) => flag.startsWith(name)),
      );
      if (prefixMatches.length === 1) option = prefixMatches[0];
      else if (prefixMatches.length > 1) {
        parserError(
          `ambiguous option: ${name} could match ${prefixMatches.flatMap((o) => o.flags).join(", ")}`,
        );
      }
    }
    if (!option) {
      unrecognized.push(arg);
      continue;
    }
    const flag = option.flags[0];
    if (!option.takesValue) {
      if (explicit !== undefined)
        parserError(`ignored explicit argument for flag option ${flag}`);
      result.apply = true;
      continue;
    }
    let value = explicit;
    if (value === undefined) {
      i++;
      if (i >= argv.length)
        parserError(`argument ${flag}: expected one argument`);
      value = argv[i];
    }
    if (option.dest === "seed") {
      try {
        result.seed = pyParseInt(value);
      } catch {
        parserError(`argument --seed: invalid int value: ${pyStrRepr(value)}`);
      }
    } else {
      result.output = value;
    }
  }
  if (seenHelp) {
    process.stdout.write(formatHelp());
    process.exit(0);
  }
  if (unrecognized.length > 0)
    parserError(`unrecognized arguments: ${unrecognized.join(" ")}`);
  return result;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/** @returns {number} */
function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = args.seed !== null ? args.seed : randomBits63();
  const output = validateOutputPath(args.output);
  const config = loadProjectConfig();
  const records = generateRecords(config, seed);
  const validation = validateRecords(records, config);
  const artifacts = buildArtifacts(records, config, seed, validation);
  const artifactCounts = validateArtifacts(artifacts, records, config);
  /** @type {{ [key: string]: unknown }} */
  const report = {
    mode: args.apply ? "apply" : "dry-run",
    output: displayPath(output),
    scenarios: BigInt(config.scenarios.length),
    protocols: config.protocols,
    settings: [...SETTINGS],
    artifact_counts: artifactCounts,
    validation,
  };
  if (args.apply) {
    publishArtifacts(output, artifacts);
    report.written = BigInt(artifacts.size);
  } else {
    /** @type {string[]} */
    const command = [
      process.execPath,
      "docs/mock.mjs",
      "--apply",
      "--seed",
      seed.toString(),
    ];
    if (output !== resolvePath(DEFAULT_OUTPUT))
      command.push("--output", output);
    report.apply_command = command.map(shlexQuote).join(" ");
    report.written = 0n;
  }
  process.stdout.write(`${jsonDumps(report)}\n`);
  return 0;
}

/**
 * Python `shlex.quote`.
 *
 * @param {string} part
 * @returns {string}
 */
function shlexQuote(part) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(part) && part !== "") return part;
  const escapedQuote = "'" + '"' + "'" + '"' + "'";
  return `'${part.split("'").join(escapedQuote)}'`;
}

process.exitCode = main();
