import { describe, expect, it, vi } from "vitest";

import { createAnalyser, createSource } from "../src/index.js";
import { createStubContext, createStubStream } from "./web-audio-stubs.js";

describe("MediaStream Source", () => {
  it("reads normalized frames through an AnalyserNode without reaching the destination", () => {
    const { stub, context } = createStubContext();
    stub.state = "running";
    const stream = createStubStream();
    const source = createSource({ kind: "stream", stream, context, fftSize: 512 });
    const analyser = createAnalyser({ source });
    const [analyserNode] = stub.analysers;
    const streamNode = stub.createMediaStreamSource.mock.results[0].value;

    analyser.update();

    expect(stub.createMediaStreamSource).toHaveBeenCalledWith(stream);
    expect(analyserNode.fftSize).toBe(512);
    expect(analyserNode.smoothingTimeConstant).toBe(0);
    expect(streamNode.connect.mock.calls).toEqual([[analyserNode]]);
    expect(analyserNode.connect).not.toHaveBeenCalled();
    expect(source.sampleRate).toBe(44_100);
    expect(analyser.features.waveform[0]).toBe(0.5);
    expect(analyser.features.spectrum[0]).toBeCloseTo(0.2);
  });

  it("rejects a stream with no audio track before any AudioContext is created", () => {
    expect(() =>
      createSource({ kind: "stream", stream: createStubStream(0) }),
    ).toThrow("MediaStream must have at least one audio track");
  });

  it("accepts silence while the selected track lives and rejects reads when it ends", () => {
    const { stub, context } = createStubContext();
    stub.state = "running";
    const stream = createStubStream(3);
    stream.audioTracks[0].id = "z";
    stream.audioTracks[1].id = "a";
    stream.audioTracks[2].id = "m";
    const source = createSource({ kind: "stream", stream, context });
    const analyser = createAnalyser({ source });
    const [analyserNode] = stub.analysers;
    const waveformRead = vi
      .spyOn(analyserNode, "getFloatTimeDomainData")
      .mockImplementation((target) => target.fill(0));
    const spectrumRead = vi
      .spyOn(analyserNode, "getByteFrequencyData")
      .mockImplementation((target) => target.fill(0));

    analyser.update();
    stream.audioTracks[0].readyState = "ended";
    analyser.update();

    expect(analyser.features.level).toBe(0);
    expect(analyser.features.spectrum[0]).toBe(0);
    const lastFeatures = structuredClone(analyser.features);

    stream.audioTracks[1].readyState = "ended";
    expect(() => analyser.update()).toThrow(
      "MediaStream's selected audio track has ended. Create a new Source for a replacement track.",
    );
    expect(stream.audioTracks[2].readyState).toBe("live");
    expect(waveformRead).toHaveBeenCalledTimes(2);
    expect(spectrumRead).toHaveBeenCalledTimes(2);
    expect(analyser.features).toEqual(lastFeatures);
  });

  it("disposes its AnalyserNode once and leaves the stream running", () => {
    const { stub, context } = createStubContext();
    const source = createSource({ kind: "stream", stream: createStubStream(), context });
    const [analyserNode] = stub.analysers;
    const streamNode = stub.createMediaStreamSource.mock.results[0].value;

    source.dispose();
    source.dispose();

    expect(streamNode.disconnect.mock.calls).toEqual([[analyserNode]]);
    expect(analyserNode.disconnect).toHaveBeenCalledTimes(1);
  });
});
