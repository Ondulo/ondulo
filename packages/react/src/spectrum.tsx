import type { Analyser, Features } from "@ondulo/core";
import { useEffect, useRef, type CanvasHTMLAttributes } from "react";

import { useFeatures } from "./use-features.js";

const DEFAULT_COLORS = ["#a5edbd", "#a5edbd"] as const;
const C1_FREQUENCY = 32.70319566257483;

export type SpectrumMode = "bars" | "area" | "lines";

export type SpectrumProps = Omit<
  CanvasHTMLAttributes<HTMLCanvasElement>,
  "children" | "height" | "width" | "onError"
> &
  Readonly<{
    analyser: Analyser;
    mode?: SpectrumMode;
    /** Signal colors from low to high frequencies. */
    colors?: readonly [string, string];
    backgroundColor?: string;
    count?: number;
    sensitivity?: number;
    /** 0 is unsmoothed; values approaching 1 retain more of the previous frame. */
    smoothing?: number;
    showOctaveLabels?: boolean;
    onSourceError?: (error: unknown) => void;
  }>;

type CanvasFrame = Readonly<{
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
}>;

/** Draws the Analyser's logarithmic bands without a React render per frame. */
export function Spectrum({
  analyser,
  mode = "bars",
  colors = DEFAULT_COLORS,
  backgroundColor = "#10191d",
  count,
  sensitivity = 1,
  smoothing = 0.65,
  showOctaveLabels = true,
  onSourceError,
  style,
  ...canvasProps
}: SpectrumProps) {
  const availableBands = analyser.features.bands.length;
  if (
    count !== undefined &&
    (!Number.isInteger(count) || count < 1 || count > availableBands)
  ) {
    throw new RangeError("count must be an integer from 1 to the Analyser band count.");
  }
  if (!Number.isFinite(sensitivity) || sensitivity <= 0) {
    throw new RangeError("sensitivity must be a positive finite number.");
  }
  if (!Number.isFinite(smoothing) || smoothing < 0 || smoothing >= 1) {
    throw new RangeError("smoothing must be between 0 (inclusive) and 1 (exclusive).");
  }

  const visualCount = count ?? Math.min(72, availableBands);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<CanvasFrame | null>(null);
  const smoothedRef = useRef(new Float32Array(visualCount));

  useEffect(() => {
    smoothedRef.current = new Float32Array(visualCount);
  }, [analyser, visualCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Spectrum requires Canvas 2D.");
    const currentCanvas = canvas;
    const currentContext = context;

    function resize(): void {
      const { width, height } = currentCanvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(width * scale);
      const pixelHeight = Math.round(height * scale);
      if (currentCanvas.width !== pixelWidth || currentCanvas.height !== pixelHeight) {
        currentCanvas.width = pixelWidth;
        currentCanvas.height = pixelHeight;
      }
      currentContext.setTransform(scale, 0, 0, scale, 0, 0);
      frameRef.current = { context: currentContext, width, height };
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(currentCanvas);
    return () => {
      observer.disconnect();
      frameRef.current = null;
    };
  }, []);

  useFeatures(
    analyser,
    (features) => {
      const frame = frameRef.current;
      if (!frame) return;
      sampleBands(features, smoothedRef.current, sensitivity, smoothing);
      drawSpectrum(frame, smoothedRef.current, {
        mode,
        colors,
        backgroundColor,
        showOctaveLabels,
        minFrequency: analyser.minFrequency,
        maxFrequency: analyser.maxFrequency,
      });
    },
    onSourceError,
  );

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Audio spectrum"
      {...canvasProps}
      style={{ display: "block", width: "100%", height: 240, ...style }}
    />
  );
}

function sampleBands(
  features: Features,
  output: Float32Array,
  sensitivity: number,
  smoothing: number,
): void {
  const bands = features.bands;
  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor((index * bands.length) / output.length);
    const end = Math.floor(((index + 1) * bands.length) / output.length);
    let sum = 0;
    for (let band = start; band < end; band += 1) sum += bands[band];
    const next = Math.min(1, (sum / (end - start)) * sensitivity);
    output[index] = output[index] * smoothing + next * (1 - smoothing);
  }
}

type DrawOptions = Readonly<{
  mode: SpectrumMode;
  colors: readonly [string, string];
  backgroundColor: string;
  showOctaveLabels: boolean;
  minFrequency: number;
  maxFrequency: number;
}>;

function drawSpectrum(frame: CanvasFrame, bands: Float32Array, options: DrawOptions): void {
  const { context, width, height } = frame;
  context.clearRect(0, 0, width, height);
  context.fillStyle = options.backgroundColor;
  context.fillRect(0, 0, width, height);
  if (width < 40 || height < 48) return;

  const left = 12;
  const right = width - 12;
  const top = 12;
  const bottom = height - (options.showOctaveLabels ? 30 : 12);
  const plotWidth = right - left;
  const plotHeight = bottom - top;

  context.strokeStyle = "#41534e";
  context.lineWidth = 1;
  context.beginPath();
  for (const fraction of [0, 0.5, 1]) {
    const y = top + fraction * plotHeight;
    context.moveTo(left, y);
    context.lineTo(right, y);
  }

  const notes: { octave: number; x: number; frequency: number }[] = [];
  const logRange = Math.log(options.maxFrequency / options.minFrequency);
  for (let octave = 1; octave <= 10; octave += 1) {
    const frequency = C1_FREQUENCY * 2 ** (octave - 1);
    if (frequency < options.minFrequency || frequency > options.maxFrequency) continue;
    const x = left + (Math.log(frequency / options.minFrequency) / logRange) * plotWidth;
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    notes.push({ octave, x, frequency });
  }
  context.stroke();

  const ink =
    options.colors[0] === options.colors[1]
      ? options.colors[0]
      : createGradient(context, left, right, options.colors);
  context.fillStyle = ink;
  context.strokeStyle = ink;

  const step = plotWidth / bands.length;
  if (options.mode === "bars") {
    const barWidth = Math.max(1, step * 0.68);
    for (let index = 0; index < bands.length; index += 1) {
      const barHeight = Math.max(1, bands[index] * plotHeight);
      context.fillRect(
        left + index * step + (step - barWidth) / 2,
        bottom - barHeight,
        barWidth,
        barHeight,
      );
    }
  } else {
    traceBands(context, bands, left, right, bottom, plotHeight);
    if (options.mode === "area") {
      context.lineTo(right, bottom);
      context.lineTo(left, bottom);
      context.closePath();
      context.globalAlpha = 0.42;
      context.fill();
      context.globalAlpha = 1;
      traceBands(context, bands, left, right, bottom, plotHeight);
      context.lineWidth = 1.5;
      context.stroke();
    } else {
      context.lineWidth = 2;
      context.stroke();
    }
  }

  if (options.showOctaveLabels) {
    const interval = Math.max(1, Math.ceil(notes.length / Math.max(1, Math.floor(plotWidth / 120))));
    context.fillStyle = "#94aaa3";
    context.font = "11px Consolas, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let index = 0; index < notes.length; index += interval) {
      const note = notes[index];
      context.textAlign = note.x < left + 50 ? "left" : note.x > right - 50 ? "right" : "center";
      context.fillText("C" + note.octave + " · " + formatFrequency(note.frequency), note.x, height - 12);
    }
  }
}

function traceBands(
  context: CanvasRenderingContext2D,
  bands: Float32Array,
  left: number,
  right: number,
  bottom: number,
  plotHeight: number,
): void {
  context.beginPath();
  if (bands.length === 1) {
    const y = bottom - bands[0] * plotHeight;
    context.moveTo(left, y);
    context.lineTo(right, y);
    return;
  }
  const step = (right - left) / bands.length;
  for (let index = 0; index < bands.length; index += 1) {
    const x = left + (index + 0.5) * step;
    const y = bottom - bands[index] * plotHeight;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
}

function createGradient(
  context: CanvasRenderingContext2D,
  left: number,
  right: number,
  colors: readonly [string, string],
): CanvasGradient {
  const gradient = context.createLinearGradient(left, 0, right, 0);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  return gradient;
}

function formatFrequency(frequency: number): string {
  return frequency < 1_000
    ? Math.round(frequency).toString()
    : (frequency / 1_000).toFixed(1) + "k";
}
