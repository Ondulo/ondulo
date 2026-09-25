import { createAudioNodeParts } from "./audio-node.js";
import { createDemoSignal } from "./demo.js";
import { createMediaElementParts } from "./media-element.js";
import { createMediaStreamParts } from "./media-stream.js";

const DEFAULT_SAMPLE_RATE = 48_000;
const DEFAULT_FFT_SIZE = 2048;
const MAX_FFT_SIZE = 32_768;
const sourceBrand: unique symbol = Symbol("ondulo.source");

export type PushedFrame = Readonly<{
  waveform: ArrayLike<number>;
  spectrum: ArrayLike<number>;
}>;

export type CreatePushedSourceOptions = Readonly<{
  kind: "pushed";
  sampleRate: number;
  fftSize?: number;
}>;

export type CreateDemoSourceOptions = Readonly<{
  kind: "demo";
  sampleRate?: number;
  fftSize?: number;
  /** Selects the melody and noise texture. Same seed, same signal. */
  seed?: number;
  /** Returns the current time in seconds. Defaults to wall-clock time. */
  clock?: () => number;
}>;

export type CreateMediaElementSourceOptions = Readonly<{
  kind: "element";
  /** Cross-origin URL resources require `crossOrigin` to be set before `src`. */
  element: HTMLMediaElement;
  /** AudioContext to attach to. Defaults to one shared, lazily created context. */
  context?: AudioContext;
  fftSize?: number;
}>;

export type CreateMediaStreamSourceOptions = Readonly<{
  kind: "stream";
  /**
   * A microphone or WebRTC stream with at least one audio track. Only its
   * first audio track is analysed, chosen when the Source is created; if that
   * track is replaced, dispose this Source and create a new one.
   */
  stream: MediaStream;
  /** AudioContext to attach to. Defaults to one shared, lazily created context. */
  context?: AudioContext;
  fftSize?: number;
}>;

export type CreateAudioNodeSourceOptions = Readonly<{
  kind: "node";
  /** Reads the node's first output. OfflineAudioContext is not supported. */
  node: AudioNode;
  fftSize?: number;
}>;

export type CreateSourceOptions =
  | CreatePushedSourceOptions
  | CreateDemoSourceOptions
  | CreateMediaElementSourceOptions
  | CreateMediaStreamSourceOptions
  | CreateAudioNodeSourceOptions;

type SourceBase = Readonly<{
  [sourceBrand]: true;
  sampleRate: number;
  fftSize: number;
}>;

/** A Source whose normalized frames are supplied by the host application. */
export type PushedSource = SourceBase &
  Readonly<{
    kind: "pushed";
    push(frame: PushedFrame): void;
  }>;

/** A Source that synthesises a music-like signal without playing audio. */
export type DemoSource = SourceBase & Readonly<{ kind: "demo" }>;

/** A Source reading an audio or video element through an AnalyserNode. */
export type MediaElementSource = SourceBase &
  Readonly<{
    kind: "element";
    element: HTMLMediaElement;
    context: AudioContext;
    /** Resumes the AudioContext; browsers start it suspended until a user gesture. */
    resume(): Promise<void>;
    /** Disconnects this Source's AnalyserNode. The element stays audible. */
    dispose(): void;
  }>;

/** A Source reading a microphone or WebRTC MediaStream through an AnalyserNode. */
export type MediaStreamSource = SourceBase &
  Readonly<{
    kind: "stream";
    stream: MediaStream;
    context: AudioContext;
    /** Resumes the AudioContext; browsers start it suspended until a user gesture. */
    resume(): Promise<void>;
    /** Disconnects this Source's AnalyserNode. The stream itself is left running. */
    dispose(): void;
  }>;

/** A Source reading an existing Web Audio node without changing its playback routing. */
export type AudioNodeSource = SourceBase &
  Readonly<{
    kind: "node";
    node: AudioNode;
    context: AudioContext;
    /** Resumes the node's AudioContext, typically from a user gesture. */
    resume(): Promise<void>;
    /** Disconnects this Source's AnalyserNode, preserving the node's other connections. */
    dispose(): void;
  }>;

export type Source =
  | PushedSource
  | DemoSource
  | MediaElementSource
  | MediaStreamSource
  | AudioNodeSource;

/** Fills the Analyser's buffers with the Source's current frame. */
type FrameReader = (
  waveform: Float32Array<ArrayBuffer>,
  spectrum: Float32Array<ArrayBuffer>,
) => void;

const frameReaders = new WeakMap<Source, FrameReader>();

export function createSource(options: CreatePushedSourceOptions): PushedSource;
export function createSource(options: CreateDemoSourceOptions): DemoSource;
export function createSource(
  options: CreateMediaElementSourceOptions,
): MediaElementSource;
export function createSource(
  options: CreateMediaStreamSourceOptions,
): MediaStreamSource;
export function createSource(options: CreateAudioNodeSourceOptions): AudioNodeSource;
export function createSource(options: CreateSourceOptions): Source {
  const fftSize = options.fftSize ?? DEFAULT_FFT_SIZE;
  validateFftSize(fftSize);

  switch (options.kind) {
    case "pushed":
      return createPushedSource(options.sampleRate, fftSize);
    case "demo":
      return createDemoSource(options, fftSize);
    case "element":
      return createMediaElementSource(options, fftSize);
    case "stream":
      return createMediaStreamSource(options, fftSize);
    case "node":
      return createAudioNodeSource(options, fftSize);
  }
}

export function readSourceFrame(
  source: Source,
  waveformTarget: Float32Array<ArrayBuffer>,
  spectrumTarget: Float32Array<ArrayBuffer>,
): void {
  const read = frameReaders.get(source);
  if (read === undefined) {
    throw new TypeError("Source must be created with createSource().");
  }

  read(waveformTarget, spectrumTarget);
}

function createPushedSource(sampleRate: number, fftSize: number): PushedSource {
  validateSampleRate(sampleRate);

  const waveform = new Float32Array(fftSize);
  const spectrum = new Float32Array(fftSize / 2);

  const source: PushedSource = {
    [sourceBrand]: true,
    kind: "pushed",
    sampleRate,
    fftSize,
    push(frame) {
      validateFrameValues(frame.waveform, fftSize, -1, 1, "waveform");
      validateFrameValues(frame.spectrum, fftSize / 2, 0, 1, "spectrum");

      waveform.set(frame.waveform);
      spectrum.set(frame.spectrum);
    },
  };

  frameReaders.set(source, (waveformTarget, spectrumTarget) => {
    waveformTarget.set(waveform);
    spectrumTarget.set(spectrum);
  });
  return source;
}

function createDemoSource(
  options: CreateDemoSourceOptions,
  fftSize: number,
): DemoSource {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  validateSampleRate(sampleRate);

  const source: DemoSource = {
    [sourceBrand]: true,
    kind: "demo",
    sampleRate,
    fftSize,
  };

  frameReaders.set(
    source,
    createDemoSignal({
      sampleRate,
      fftSize,
      seed: options.seed ?? 0,
      clock: options.clock ?? (() => Date.now() / 1000),
    }),
  );
  return source;
}

function createMediaElementSource(
  options: CreateMediaElementSourceOptions,
  fftSize: number,
): MediaElementSource {
  const parts = createMediaElementParts({
    element: options.element,
    context: options.context,
    fftSize,
  });

  const source: MediaElementSource = {
    [sourceBrand]: true,
    kind: "element",
    sampleRate: parts.context.sampleRate,
    fftSize,
    element: options.element,
    context: parts.context,
    resume: parts.resume,
    dispose: parts.dispose,
  };

  frameReaders.set(source, parts.read);
  return source;
}

function createMediaStreamSource(
  options: CreateMediaStreamSourceOptions,
  fftSize: number,
): MediaStreamSource {
  const parts = createMediaStreamParts({
    stream: options.stream,
    context: options.context,
    fftSize,
  });

  const source: MediaStreamSource = {
    [sourceBrand]: true,
    kind: "stream",
    sampleRate: parts.context.sampleRate,
    fftSize,
    stream: options.stream,
    context: parts.context,
    resume: parts.resume,
    dispose: parts.dispose,
  };

  frameReaders.set(source, parts.read);
  return source;
}

function createAudioNodeSource(
  options: CreateAudioNodeSourceOptions,
  fftSize: number,
): AudioNodeSource {
  const parts = createAudioNodeParts(options.node, fftSize);
  const source: AudioNodeSource = {
    [sourceBrand]: true,
    kind: "node",
    sampleRate: parts.context.sampleRate,
    fftSize,
    node: options.node,
    context: parts.context,
    resume: parts.resume,
    dispose: parts.dispose,
  };

  frameReaders.set(source, parts.read);
  return source;
}

function validateSampleRate(sampleRate: number): void {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError("sampleRate must be a positive finite number.");
  }
}

function validateFftSize(fftSize: number): void {
  if (
    !Number.isInteger(fftSize) ||
    fftSize < 32 ||
    fftSize > MAX_FFT_SIZE ||
    !isPowerOfTwo(fftSize)
  ) {
    throw new RangeError("fftSize must be a power of two from 32 to 32768.");
  }
}

function isPowerOfTwo(value: number): boolean {
  return (value & (value - 1)) === 0;
}

function validateFrameValues(
  values: ArrayLike<number>,
  expectedLength: number,
  minimum: number,
  maximum: number,
  label: "waveform" | "spectrum",
): void {
  if (values.length !== expectedLength) {
    throw new RangeError(`${label} must contain exactly ${expectedLength} values.`);
  }

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new RangeError(
        `${label}[${index}] must be a finite number from ${minimum} to ${maximum}.`,
      );
    }
  }
}
