import { createClipboardFeature } from "./clipboard";
import { createContextmenuFeature } from "./contextmenu";
import { createDevtoolsFeature } from "./devtools";
import { createKeyboardFeature } from "./keyboard";
import { resolveOptions } from "./options";
import { createPrintFeature } from "./print";
import { createStyleFeature } from "./style";
import type {
  AntiCopyInstance,
  AntiCopyMode,
  AntiCopyOptions,
  DevtoolsOptions,
  Feature,
  ViolationEvent,
  ViolationType,
} from "./types";
import { isBrowser } from "./utils";

export type {
  AntiCopyInstance,
  AntiCopyMode,
  AntiCopyOptions,
  DevtoolsOptions,
  ViolationEvent,
  ViolationType,
};
export { DEFAULT_REPLACE_TEXT } from "./options";
export { isBrowser } from "./utils";

const NOOP_INSTANCE: AntiCopyInstance = {
  enable() {
    /** noop */
  },
  disable() {
    /** noop */
  },
  destroy() {
    /** noop */
  },
  isEnabled: () => false,
  update() {
    /** noop */
  },
};

function buildFeatures(options: AntiCopyOptions): Feature[] {
  const resolved = resolveOptions(options);
  const features: Feature[] = [];
  if (resolved.selectStyle) features.push(createStyleFeature(resolved));
  if (resolved.copy) features.push(createClipboardFeature(resolved));
  if (resolved.keyboard) features.push(createKeyboardFeature(resolved));
  if (resolved.contextmenu) features.push(createContextmenuFeature(resolved));
  if (resolved.print) features.push(createPrintFeature(resolved));
  if (resolved.devtools) features.push(createDevtoolsFeature(resolved));
  return features;
}

/** Merge an options patch, deep-merging the nested devtools object. */
function mergeOptions(
  current: AntiCopyOptions,
  patch: Partial<AntiCopyOptions>,
): AntiCopyOptions {
  const merged: AntiCopyOptions = { ...current, ...patch };
  if (
    typeof current.devtools === "object" &&
    typeof patch.devtools === "object"
  ) {
    merged.devtools = { ...current.devtools, ...patch.devtools };
  }
  return merged;
}

/**
 * Creates a copy-protection controller. Framework agnostic: only relies on
 * standard DOM APIs and is safe to import (but inert) in non-browser
 * environments such as SSR — a no-op instance is returned there.
 *
 * Note: client-side copy protection is a deterrent, not a security boundary.
 * Content remains accessible through view-source, disabled JavaScript, or
 * direct HTTP requests.
 */
export function createAntiCopy(
  options: AntiCopyOptions = {},
): AntiCopyInstance {
  if (!isBrowser()) return NOOP_INSTANCE;

  let currentOptions = { ...options };
  let features = buildFeatures(currentOptions);
  let enabled = false;
  let destroyed = false;

  const instance: AntiCopyInstance = {
    enable() {
      if (destroyed || enabled) return;
      const attached: Feature[] = [];
      try {
        for (const feature of features) {
          // Pushed before attach so a mid-attach failure is also rolled
          // back (detach implementations are idempotent).
          attached.push(feature);
          feature.attach();
        }
      } catch (error) {
        // Roll back so a partial failure never leaks unremovable listeners.
        for (const feature of attached) {
          try {
            feature.detach();
          } catch {
            /* best effort */
          }
        }
        throw error;
      }
      enabled = true;
    },
    disable() {
      if (!enabled) return;
      // Detach every feature even if one throws.
      let firstError: unknown;
      for (const feature of features) {
        try {
          feature.detach();
        } catch (error) {
          firstError ??= error;
        }
      }
      enabled = false;
      if (firstError !== undefined) throw firstError;
    },
    destroy() {
      instance.disable();
      destroyed = true;
      features = [];
    },
    isEnabled: () => enabled,
    update(patch) {
      if (destroyed) return;
      const wasEnabled = enabled;
      instance.disable();
      currentOptions = mergeOptions(currentOptions, patch);
      features = buildFeatures(currentOptions);
      if (wasEnabled) instance.enable();
    },
  };

  return instance;
}
