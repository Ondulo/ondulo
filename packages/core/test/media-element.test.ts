import { describe, expect, it, vi } from "vitest";

import { createAnalyser, createSource } from "../src/index.js";
import {
  createStubContext,
  createStubElement,
  StubAudioContext,
} from "./web-audio-stubs.js";

describe("media element Source", () => {
  it("reads normalized frames through an AnalyserNode on the given context", () => {
    const { stub, context } = createStubContext();
    stub.state = "running";
    const source = createSource({
      kind: "element",
      element: createStubElement(),
      context,
      fftSize: 1024,
    });
    const analyser = createAnalyser({ source });
    const [analyserNode] = stub.analysers;
    const mediaNode = stub.createMediaElementSource.mock.results[0].value;

    analyser.update();

    expect(source.sampleRate).toBe(44_100);
    expect(analyserNode.fftSize).toBe(1024);
    expect(analyserNode.smoothingTimeConstant).toBe(0);
    expect(mediaNode.connect).toHaveBeenCalledWith(stub.destination);
    expect(mediaNode.connect).toHaveBeenCalledWith(analyserNode);
    expect(analyser.features.waveform[0]).toBe(0.5);
    expect(analyser.features.spectrum[0]).toBeCloseTo(0.2);
    expect(analyser.features.level).toBeCloseTo(0.5);
  });

  it("attaches an element to its context once and shares the media node", () => {
    const { stub, context } = createStubContext();
    const element = createStubElement();

    createSource({ kind: "element", element, context });
    createSource({ kind: "element", element, context });

    expect(stub.createMediaElementSource).toHaveBeenCalledTimes(1);
    const mediaNode = stub.createMediaElementSource.mock.results[0].value;
    expect(mediaNode.connect).toHaveBeenCalledTimes(3);
    expect(() =>
      createSource({ kind: "element", element, context: createStubContext().context }),
    ).toThrow("already attached to a different AudioContext");
  });

  it("disposes its own AnalyserNode and keeps the element audible", () => {
    const { stub, context } = createStubContext();
    const source = createSource({
      kind: "element",
      element: createStubElement(),
      context,
    });
    const [analyserNode] = stub.analysers;
    const mediaNode = stub.createMediaElementSource.mock.results[0].value;

    source.dispose();

    expect(mediaNode.disconnect).toHaveBeenCalledTimes(1);
    expect(mediaNode.disconnect).toHaveBeenCalledWith(analyserNode);
    expect(analyserNode.disconnect).toHaveBeenCalledTimes(1);
  });

  it("resumes the AudioContext on request", async () => {
    const { stub, context } = createStubContext();
    const source = createSource({
      kind: "element",
      element: createStubElement(),
      context,
    });

    await source.resume();

    expect(stub.resume).toHaveBeenCalledTimes(1);
    expect(stub.state).toBe("running");
  });

  it("shares one lazily created AudioContext, or fails clearly without Web Audio", async () => {
    vi.resetModules();
    const fresh = await import("../src/index.js");
    const options = { kind: "element", element: createStubElement() } as const;

    expect(() => fresh.createSource(options)).toThrow(
      "AudioContext is not available in this environment",
    );

    vi.stubGlobal("AudioContext", StubAudioContext);
    try {
      const first = fresh.createSource(options);
      const second = fresh.createSource({
        kind: "element",
        element: createStubElement(),
      });
      expect(first.context).toBeInstanceOf(StubAudioContext);
      expect(second.context).toBe(first.context);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
