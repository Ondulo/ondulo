// @vitest-environment jsdom
import { createSource, type CreateAnalyserOptions } from "@ondulo/core";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useAnalyser } from "../src/index.js";

afterEach(cleanup);

const createPushedSource = () =>
  createSource({ kind: "pushed", sampleRate: 48_000, fftSize: 2048 });

describe("useAnalyser", () => {
  it("keeps the Analyser when a new options object has the same values", () => {
    const source = createPushedSource();
    const { result, rerender } = renderHook(
      ({ options }: { options: CreateAnalyserOptions }) => useAnalyser(options),
      { initialProps: { options: { source, bandsPerOctave: 12 } } },
    );
    const first = result.current;

    rerender({ options: { source, bandsPerOctave: 12 } });

    expect(result.current).toBe(first);
    expect(result.current.features).toBe(first.features);
  });

  it("rebuilds when the Source or a frequency option changes", () => {
    const source = createPushedSource();
    const nextSource = createPushedSource();
    const initialProps: { options: CreateAnalyserOptions } = {
      options: { source },
    };
    const { result, rerender } = renderHook(
      ({ options }: { options: CreateAnalyserOptions }) => useAnalyser(options),
      { initialProps },
    );
    const first = result.current;

    rerender({ options: { source, bandsPerOctave: 24 } });
    const second = result.current;
    expect(second).not.toBe(first);
    expect(second.features.bands.length).toBe(2 * first.features.bands.length);

    rerender({ options: { source: nextSource, bandsPerOctave: 24 } });
    expect(result.current).not.toBe(second);
    expect(result.current.source).toBe(nextSource);
  });
});
