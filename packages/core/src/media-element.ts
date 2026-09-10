import { resolveAudioContext } from "./audio-context.js";

type AttachedElement = Readonly<{
  context: AudioContext;
  node: MediaElementAudioSourceNode;
}>;

/**
 * A media element can be attached to one AudioContext exactly once, so the
 * node is remembered per element and shared by every Source built on it.
 */
const attachedElements = new WeakMap<HTMLMediaElement, AttachedElement>();

export type MediaElementParts = Readonly<{
  context: AudioContext;
  read(
    waveform: Float32Array<ArrayBuffer>,
    spectrum: Float32Array<ArrayBuffer>,
  ): void;
  resume(): Promise<void>;
  dispose(): void;
}>;

/** Wires an AnalyserNode to a media element and returns the Source's behaviour. */
export function createMediaElementParts(
  options: Readonly<{
    element: HTMLMediaElement;
    context: AudioContext | undefined;
    fftSize: number;
  }>,
): MediaElementParts {
  const context = resolveAudioContext(options.context);
  const mediaNode = attachElement(options.element, context);
  const analyserNode = context.createAnalyser();
  analyserNode.fftSize = options.fftSize;
  // Smoothing is a Visualizer parameter, so the node hands over raw frames.
  analyserNode.smoothingTimeConstant = 0;
  mediaNode.connect(analyserNode);
  const bytes = new Uint8Array(options.fftSize / 2);

  return {
    context,
    read(waveform, spectrum) {
      analyserNode.getFloatTimeDomainData(waveform);
      analyserNode.getByteFrequencyData(bytes);
      for (let binIndex = 0; binIndex < bytes.length; binIndex += 1) {
        spectrum[binIndex] = bytes[binIndex] / 255;
      }
    },
    resume: () => context.resume(),
    dispose() {
      mediaNode.disconnect(analyserNode);
      analyserNode.disconnect();
    },
  };
}

function attachElement(
  element: HTMLMediaElement,
  context: AudioContext,
): MediaElementAudioSourceNode {
  const attached = attachedElements.get(element);
  if (attached !== undefined) {
    if (attached.context !== context) {
      throw new TypeError(
        "This media element is already attached to a different AudioContext.",
      );
    }
    return attached.node;
  }

  const node = context.createMediaElementSource(element);
  // Routing an element through a context mutes it unless it reaches the destination.
  node.connect(context.destination);
  attachedElements.set(element, { context, node });
  return node;
}
