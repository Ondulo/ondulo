import { vi } from "vitest";

/** Minimal Web Audio stand-ins; Vitest runs in Node, which has no Web Audio. */

export class StubAnalyserNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  connect = vi.fn();
  disconnect = vi.fn();
  getFloatTimeDomainData(target: Float32Array): void {
    target.fill(0.5);
  }
  getByteFrequencyData(target: Uint8Array): void {
    target.fill(51);
  }
}

export class StubSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

export class StubAudioContext {
  sampleRate = 44_100;
  state: AudioContextState = "suspended";
  destination = {};
  analysers: StubAnalyserNode[] = [];
  createMediaElementSource = vi.fn(() => new StubSourceNode());
  createMediaStreamSource = vi.fn(() => new StubSourceNode());
  createAnalyser(): StubAnalyserNode {
    const node = new StubAnalyserNode();
    this.analysers.push(node);
    return node;
  }
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
}

export function createStubContext() {
  const stub = new StubAudioContext();
  return { stub, context: stub as unknown as AudioContext };
}

export function createStubNode(context: BaseAudioContext) {
  const stub = Object.assign(new StubSourceNode(), { context });
  return { stub, node: stub as unknown as AudioNode };
}

export function createStubElement(
  options: Readonly<{
    currentSrc?: string;
    crossOrigin?: string | null;
    documentOrigin?: string;
  }> = {},
): HTMLMediaElement {
  return {
    currentSrc: options.currentSrc ?? "",
    crossOrigin: options.crossOrigin ?? null,
    ownerDocument: {
      location: { origin: options.documentOrigin ?? "https://app.example" },
    },
  } as unknown as HTMLMediaElement;
}

export type StubMediaStream = MediaStream &
  Readonly<{
    audioTracks: Array<{ readyState: MediaStreamTrackState }>;
  }>;

export function createStubStream(audioTrackCount = 1): StubMediaStream {
  const audioTracks: Array<{ readyState: MediaStreamTrackState }> = Array.from(
    { length: audioTrackCount },
    () => ({ readyState: "live" }),
  );
  return {
    audioTracks,
    getAudioTracks: () => audioTracks,
  } as unknown as StubMediaStream;
}
