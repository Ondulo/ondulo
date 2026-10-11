// @vitest-environment jsdom
import { createAnalyser, createSource } from "@ondulo/core";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Spectrum, type SpectrumMode } from "../src/index.js";

const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "getContext",
);

afterEach(() => {
  cleanup();
  if (originalGetContext) {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function installFrames() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  return {
    step(time: number) {
      const queued = [...callbacks.values()];
      callbacks.clear();
      for (const callback of queued) callback(time);
    },
  };
}

function installCanvas() {
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => context,
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 400, 200),
  );
  vi.stubGlobal("devicePixelRatio", 3);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  return context;
}

function createSpectrumAnalyser() {
  const source = createSource({ kind: "pushed", sampleRate: 48_000, fftSize: 2_048 });
  source.push({
    waveform: new Float32Array(2_048),
    spectrum: new Float32Array(1_024).fill(0.5),
  });
  return createAnalyser({ source, minFrequency: 130, maxFrequency: 1_000 });
}

describe("Spectrum", () => {
  it("draws logarithmic bars at capped pixel density with labels from the Analyser range", () => {
    const frames = installFrames();
    const context = installCanvas();
    const analyser = createSpectrumAnalyser();
    const { container } = render(<Spectrum analyser={analyser} smoothing={0} />);
    const canvas = container.querySelector("canvas");

    expect(canvas?.width).toBe(800);
    expect(canvas?.height).toBe(400);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);

    act(() => frames.step(16));
    expect(context.fillRect.mock.calls.length).toBeGreaterThan(2);
    expect(context.fillText).toHaveBeenCalledWith("C3 · 131", expect.any(Number), 188);
    expect(context.fillText).toHaveBeenCalledWith("C5 · 523", expect.any(Number), 188);
    expect(context.fillText).not.toHaveBeenCalledWith(
      "C6 · 1.0k",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it.each(["area", "lines"] satisfies SpectrumMode[])(
    "draws the %s mode as a connected contour",
    (mode) => {
      const frames = installFrames();
      const context = installCanvas();
      render(<Spectrum analyser={createSpectrumAnalyser()} mode={mode} />);

      act(() => frames.step(16));
      expect(context.lineTo.mock.calls.length).toBeGreaterThan(3);
      expect(context.fill).toHaveBeenCalledTimes(mode === "area" ? 1 : 0);
      expect(context.stroke).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["area", "lines"] satisfies SpectrumMode[])(
    "keeps a one-band %s view visible",
    (mode) => {
      const frames = installFrames();
      const context = installCanvas();
      render(
        <Spectrum
          analyser={createSpectrumAnalyser()}
          mode={mode}
          count={1}
          smoothing={0}
        />,
      );

      act(() => frames.step(16));
      expect(
        context.lineTo.mock.calls.some(
          ([x, y]) => x === 388 && y > 12 && y < 170 && y !== 91,
        ),
      ).toBe(true);
    },
  );
});
