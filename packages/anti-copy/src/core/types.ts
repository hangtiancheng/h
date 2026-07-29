/**
 * Protection strategy applied when the user attempts to copy content.
 *
 * - `"block"`   — cancel the copy/cut operation entirely.
 * - `"replace"` — let the operation happen but replace the clipboard
 *                 payload with a custom notice (see {@link AntiCopyOptions.replaceText}).
 */
export type AntiCopyMode = "block" | "replace";

/** Category of a protection trigger reported through `onViolation`. */
export type ViolationType =
  | "copy"
  | "cut"
  | "drag"
  | "selection"
  | "keyboard"
  | "contextmenu"
  | "print"
  | "devtools";

/** Payload passed to the {@link AntiCopyOptions.onViolation} callback. */
export interface ViolationEvent {
  type: ViolationType;
  /** The original DOM event, absent for `devtools` detections. */
  originalEvent?: Event;
  /** Human-readable shortcut description (e.g. `"Ctrl+Shift+I"`) for `keyboard` violations. */
  key?: string;
}

/** Configuration for the DevTools-open heuristic detector. */
export interface DevtoolsOptions {
  /** Polling interval in milliseconds. @default 1000 */
  intervalMs?: number;
  /**
   * Minimum difference (px) between the window outer and inner size that is
   * treated as "DevTools docked". @default 170
   */
  threshold?: number;
}

export interface AntiCopyOptions {
  /** Copy handling strategy. @default "block" */
  mode?: AntiCopyMode;
  /**
   * Clipboard payload used in `"replace"` mode. A function receives the
   * current selection text and returns the replacement string.
   */
  replaceText?: string | ((selection: string) => string);
  /**
   * CSS selectors describing regions where protection is bypassed
   * (event target is matched via `Element.closest`). @default []
   */
  excludeSelectors?: string[];
  /** Intercept `copy` / `cut` events and text/image drag-out. @default true */
  copy?: boolean;
  /** Intercept copy-related and DevTools keyboard shortcuts. @default true */
  keyboard?: boolean;
  /** Disable the context menu. @default true */
  contextmenu?: boolean;
  /**
   * Inject a `user-select: none` stylesheet and block `selectstart`.
   * @default true in "block" mode, false in "replace" mode (replacement
   * requires a live selection)
   */
  selectStyle?: boolean;
  /** Hide content in print output and block Ctrl/Cmd+P / Ctrl/Cmd+S. @default true */
  print?: boolean;
  /**
   * Enable the DevTools-open detector (window size delta heuristic).
   *
   * Limitations: undocked DevTools windows are undetectable, and browser
   * zoom or unusual chrome may cause false positives. Treat this purely as
   * a deterrent signal. @default false
   */
  devtools?: boolean | DevtoolsOptions;
  /** Invoked every time a protection rule fires. */
  onViolation?: (event: ViolationEvent) => void;
  /** Document to attach listeners to; injectable for testing. @default document */
  target?: Document;
}

export interface AntiCopyInstance {
  /** Attach all configured protections. Idempotent. */
  enable(): void;
  /** Detach all listeners, remove injected styles and stop detectors. Idempotent. */
  disable(): void;
  /** Disable and permanently retire the instance; further calls are no-ops. */
  destroy(): void;
  isEnabled(): boolean;
  /** Re-create protections with merged options (disable → merge → enable if previously enabled). */
  update(options: Partial<AntiCopyOptions>): void;
}

/** Internal contract implemented by each protection module. */
export interface Feature {
  attach(): void;
  detach(): void;
}

/** Fully-normalized options consumed by feature modules. */
export interface ResolvedOptions {
  mode: AntiCopyMode;
  replaceText: string | ((selection: string) => string);
  excludeSelectors: string[];
  copy: boolean;
  keyboard: boolean;
  contextmenu: boolean;
  selectStyle: boolean;
  print: boolean;
  devtools: Required<DevtoolsOptions> | false;
  onViolation?: (event: ViolationEvent) => void;
  target: Document;
}
