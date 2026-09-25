import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { createAnalyser, createSource, type AudioNodeSource } from "../src/index.js";
import { createStubContext, createStubNode } from "./web-audio-stubs.js";

describe("Web Audio node Source", () => {
  it("uses the node's context to read normalized frames without routing playback", () => {
    const { stub: contextStub, context } = createStubContext();
    contextStub.state = "running";
    const { stub: nodeStub, node } = createStubNode(context);
    const source = createSource({ kind: "node", node, fftSize: 512 });
    const analyser = createAnalyser({ source });
    const [analyserNode] = contextStub.analysers;

    analyser.update();

    expectTypeOf(source).toEqualTypeOf<AudioNodeSource>();
    expect(source.kind).toBe("node");
    expect(source.node).toBe(node);
    expect(source.context).toBe(context);
    expect(source.sampleRate).toBe(44_100);
    expect(analyserNode.fftSize).toBe(512);
    expect(analyserNode.smoothingTimeConstant).toBe(0);
    expect(nodeStub.connect.mock.calls).toEqual([[analyserNode]]);
    expect(analyserNode.connect).not.toHaveBeenCalled();
    expect(analyser.features.waveform[0]).toBe(0.5);
    expect(analyser.features.spectrum[0]).toBeCloseTo(0.2);
    expect(analyser.features.level).toBeCloseTo(0.5);
  });

  it("rejects an offline context before creating or connecting an AnalyserNode", () => {
    const offline = { createAnalyser: vi.fn(), resume: vi.fn() };
    const { stub, node } = createStubNode(offline as unknown as OfflineAudioContext);

    expect(() => createSource({ kind: "node", node })).toThrow(
      "AudioNode must belong to an AudioContext, not an OfflineAudioContext.",
    );
    expect(offline.createAnalyser).not.toHaveBeenCalled();
    expect(stub.connect).not.toHaveBeenCalled();
  });

  it("rejects invalid FFT sizes before changing the audio graph", () => {
    const { stub: contextStub, context } = createStubContext();
    const { stub: nodeStub, node } = createStubNode(context);

    expect(() => createSource({ kind: "node", node, fftSize: 33 })).toThrow(
      "fftSize must be a power of two from 32 to 32768",
    );
    expect(contextStub.analysers).toHaveLength(0);
    expect(nodeStub.connect).not.toHaveBeenCalled();
  });

  it("resumes the node's own context only when requested", async () => {
    const { stub, context } = createStubContext();
    const { node } = createStubNode(context);
    const source = createSource({ kind: "node", node });

    expect(stub.resume).not.toHaveBeenCalled();
    await source.resume();

    expect(stub.resume).toHaveBeenCalledTimes(1);
    expect(stub.state).toBe("running");
  });

  it("disposes only its own analysis connection once when a node is shared", () => {
    const { stub: contextStub, context } = createStubContext();
    contextStub.state = "running";
    const { stub: nodeStub, node } = createStubNode(context);
    node.connect(context.destination);
    const first = createSource({ kind: "node", node });
    const second = createSource({ kind: "node", node });
    const [firstAnalyser, secondAnalyser] = contextStub.analysers;

    first.dispose();
    first.dispose();
    const analyser = createAnalyser({ source: second });
    analyser.update();

    expect(nodeStub.connect.mock.calls).toEqual([
      [context.destination], [firstAnalyser], [secondAnalyser],
    ]);
    expect(nodeStub.disconnect.mock.calls).toEqual([[firstAnalyser]]);
    expect(firstAnalyser.disconnect).toHaveBeenCalledTimes(1);
    expect(secondAnalyser.disconnect).not.toHaveBeenCalled();
    expect(contextStub.close).not.toHaveBeenCalled();
    expect(analyser.features.level).toBeCloseTo(0.5);
  });
});
