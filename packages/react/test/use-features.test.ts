// @vitest-environment jsdom
import { createAnalyser, createSource } from "@ondulo/core";
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFeatures } from "../src/index.js";

afterEach(() => {
  cleanup();
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
    pending: () => callbacks.size,
    step(time: number) {
      const queued = [...callbacks.values()];
      callbacks.clear();
      for (const callback of queued) {
        callback(time);
      }
    },
  };
}

function createPushedAnalyser() {
  const source = createSource({ kind: "pushed", sampleRate: 48_000, fftSize: 32 });
  return { source, analyser: createAnalyser({ source }) };
}

describe("useFeatures", () => {
  it("updates before each callback and reuses the same Features object", () => {
    const frames = installFrames();
    const { source, analyser } = createPushedAnalyser();
    const onFrame = vi.fn();
    source.push({
      waveform: new Float32Array(32).fill(0.5),
      spectrum: new Float32Array(16),
    });

    renderHook(() => useFeatures(analyser, onFrame), { wrapper: StrictMode });
    expect(frames.pending()).toBe(1);

    act(() => frames.step(16));
    expect(onFrame).toHaveBeenCalledWith(analyser.features, 16);
    expect(analyser.features.level).toBeCloseTo(0.5);
    const features = onFrame.mock.calls[0][0];

    source.push({
      waveform: new Float32Array(32).fill(0.25),
      spectrum: new Float32Array(16),
    });
    act(() => frames.step(32));
    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(onFrame.mock.calls[1][0]).toBe(features);
    expect(analyser.features.level).toBeCloseTo(0.25);
    expect(frames.pending()).toBe(1);
  });

  it("cancels the old loop on Analyser change and the last loop on unmount", () => {
    const frames = installFrames();
    const first = createPushedAnalyser().analyser;
    const second = createPushedAnalyser().analyser;
    const onFrame = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ analyser }) => useFeatures(analyser, onFrame),
      { initialProps: { analyser: first } },
    );

    rerender({ analyser: second });
    expect(frames.pending()).toBe(1);
    act(() => frames.step(16));
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith(second.features, 16);

    unmount();
    expect(frames.pending()).toBe(0);
    act(() => frames.step(32));
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it("reports an update failure once and resumes frames after recovery", () => {
    const frames = installFrames();
    const { analyser } = createPushedAnalyser();
    const onFrame = vi.fn();
    const onError = vi.fn();
    const update = vi.spyOn(analyser, "update");
    update.mockImplementationOnce(() => {
      throw new Error("AudioContext is suspended");
    });
    update.mockImplementationOnce(() => {
      throw new Error("AudioContext is suspended");
    });

    renderHook(() => useFeatures(analyser, onFrame, onError));
    act(() => frames.step(16));
    act(() => frames.step(32));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onFrame).not.toHaveBeenCalled();
    expect(frames.pending()).toBe(1);

    act(() => frames.step(48));
    expect(onFrame).toHaveBeenCalledWith(analyser.features, 48);

    update.mockImplementationOnce(() => {
      throw new Error("AudioContext is suspended");
    });
    act(() => frames.step(64));
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("keeps one error report when an inline handler rerenders the component", () => {
    const frames = installFrames();
    const { analyser } = createPushedAnalyser();
    const error = new Error("AudioContext is suspended");
    vi.spyOn(analyser, "update").mockImplementation(() => {
      throw error;
    });
    const onError = vi.fn();

    const { result } = renderHook(() => {
      const [errorCount, setErrorCount] = useState(0);
      useFeatures(
        analyser,
        () => {},
        (caught) => {
          onError(caught);
          setErrorCount((count) => count + 1);
        },
      );
      return errorCount;
    });

    act(() => frames.step(16));
    act(() => frames.step(32));
    expect(result.current).toBe(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    expect(frames.pending()).toBe(1);
  });
});
