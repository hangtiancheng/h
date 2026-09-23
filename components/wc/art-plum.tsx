/** @jsxImportSource @yukino.js/lit-jsx */

import { LitElement, customElement } from "@yukino.js/lit-jsx";

const R180 = Math.PI;
const R90 = Math.PI / 2;
const R15 = Math.PI / 12;
const MIN_BRANCH = 30;
const LEN = 6;
const FRAME_INTERVAL = 1000 / 40;
const MASK = "radial-gradient(circle, transparent, black)";

const LIGHT_COLOR = "#849a7225";
const DARK_COLOR = "#a8bc9625";

type Step = () => void;

interface Counter {
  value: number;
}

function polar2cart(
  x: number,
  y: number,
  r: number,
  theta: number,
): [number, number] {
  return [x + r * Math.cos(theta), y + r * Math.sin(theta)];
}

function startPlumArt(canvas: HTMLCanvasElement, color: string): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx)
    return () => {
      /** noop */
    };

  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = dpr * width;
  canvas.height = dpr * height;
  ctx.scale(dpr, dpr);

  let steps: Step[] = [];
  let prevSteps: Step[] = [];
  let rafId = 0;
  let running = false;
  let lastTime = performance.now();

  const step = (
    x: number,
    y: number,
    rad: number,
    counter: Counter = { value: 0 },
  ) => {
    const [nx, ny] = polar2cart(x, y, Math.random() * LEN, rad);
    counter.value += 1;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.stroke();

    // Out of bounds.
    if (
      nx < -100 ||
      nx > window.innerWidth + 100 ||
      ny < -100 ||
      ny > window.innerHeight + 100
    )
      return;

    const rate = counter.value <= MIN_BRANCH ? 0.8 : 0.5;
    if (Math.random() < rate)
      steps.push(() => step(nx, ny, rad + Math.random() * R15, counter));
    if (Math.random() < rate)
      steps.push(() => step(nx, ny, rad - Math.random() * R15, counter));
  };

  const loop = () => {
    if (!running) return;
    rafId = requestAnimationFrame(loop);

    if (performance.now() - lastTime < FRAME_INTERVAL) return;

    prevSteps = steps;
    steps = [];
    lastTime = performance.now();

    if (!prevSteps.length) {
      running = false;
      return;
    }

    for (const next of prevSteps) {
      if (Math.random() < 0.5) steps.push(next);
      else next();
    }
  };

  const randomMiddle = () => Math.random() * 0.6 + 0.2;

  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  prevSteps = [];
  steps = [
    () => step(randomMiddle() * window.innerWidth, -5, R90),
    () =>
      step(randomMiddle() * window.innerWidth, window.innerHeight + 5, -R90),
    () => step(-5, randomMiddle() * window.innerHeight, 0),
    () =>
      step(window.innerWidth + 5, randomMiddle() * window.innerHeight, R180),
  ];
  if (window.innerWidth < 500) steps = steps.slice(0, 2);
  running = true;
  rafId = requestAnimationFrame(loop);

  return () => {
    running = false;
    cancelAnimationFrame(rafId);
  };
}

@customElement("art-plum")
export class ArtPlumElement extends LitElement {
  private cleanup: (() => void) | null = null;

  private themeObserver: MutationObserver | null = null;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.themeObserver ??= new MutationObserver(() => this.restart());
    this.themeObserver.observe(document.documentElement, {
      attributeFilter: ["class"],
    });
  }

  protected override firstUpdated(): void {
    this.restart();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.cleanup?.();
    this.cleanup = null;
  }

  private restart(): void {
    this.cleanup?.();
    const canvas = this.querySelector("canvas");
    if (!canvas) return;
    const dark = document.documentElement.classList.contains("dark");
    this.cleanup = startPlumArt(canvas, dark ? DARK_COLOR : LIGHT_COLOR);
  }

  protected override render() {
    return (
      <div
        className="pointer-events-none fixed inset-0 print:hidden"
        style={{ maskImage: MASK, WebkitMaskImage: MASK }}
      >
        <canvas width={400} height={400} />
      </div>
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "art-plum": ArtPlumElement;
  }
}
