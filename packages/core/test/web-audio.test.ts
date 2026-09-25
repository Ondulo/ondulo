import { describe, expect, it, vi } from "vitest";

import { createAnalyser, createSource } from "../src/index.js";
import {
  createStubContext,
  createStubElement,
  createStubNode,
  createStubStream,
} from "./web-audio-stubs.js";

describe("Web Audio context suspension", () => {
  it.each([
    {
      kind: "element",
      create: (context: AudioContext) =>
        createSource({ kind: "element", element: createStubElement(), context }),
    },
    {
      kind: "stream",
      create: (context: AudioContext) =>
        createSource({ kind: "stream", stream: createStubStream(), context }),
    },
    {
      kind: "node",
      create: (context: AudioContext) =>
        createSource({ kind: "node", node: createStubNode(context).node }),
    },
  ])("$kind Source rejects suspended reads and recovers after resume", async ({ create }) => {
    const { stub, context } = createStubContext();
    const source = create(context);
    const analyser = createAnalyser({ source });
    const [analyserNode] = stub.analysers;
    const waveformRead = vi.spyOn(analyserNode, "getFloatTimeDomainData");
    const spectrumRead = vi.spyOn(analyserNode, "getByteFrequencyData");
    const initialFeatures = structuredClone(analyser.features);
    const message =
      "AudioContext is suspended. Call source.resume() from a user gesture and await it before updating the Analyser.";

    expect(() => analyser.update()).toThrow(message);
    expect(waveformRead).not.toHaveBeenCalled();
    expect(spectrumRead).not.toHaveBeenCalled();
    expect(stub.resume).not.toHaveBeenCalled();
    expect(analyser.features).toEqual(initialFeatures);

    await source.resume();
    analyser.update();

    expect(analyser.features.level).toBeCloseTo(0.5);
    expect(analyser.features.spectrum[0]).toBeCloseTo(0.2);
    const lastFeatures = structuredClone(analyser.features);

    // Suspension can recur after successful reads. Keep the last complete frame.
    stub.state = "suspended";
    expect(() => analyser.update()).toThrow(message);
    expect(waveformRead).toHaveBeenCalledTimes(1);
    expect(spectrumRead).toHaveBeenCalledTimes(1);
    expect(analyser.features).toEqual(lastFeatures);

    await source.resume();
    analyser.update();

    expect(waveformRead).toHaveBeenCalledTimes(2);
    expect(spectrumRead).toHaveBeenCalledTimes(2);
    expect(stub.resume).toHaveBeenCalledTimes(2);
  });
});
