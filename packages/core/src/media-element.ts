import { resolveAudioContext } from "./audio-context.js";
import { createWebAudioParts, type WebAudioParts } from "./web-audio.js";

type AttachedElement = Readonly<{
  context: AudioContext;
  node: MediaElementAudioSourceNode;
}>;

/**
 * A media element can be attached to one AudioContext exactly once, so the
 * node is remembered per element and shared by every Source built on it.
 */
const attachedElements = new WeakMap<HTMLMediaElement, AttachedElement>();

/** Wires an AnalyserNode to a media element and returns the Source's behaviour. */
export function createMediaElementParts(
  options: Readonly<{
    element: HTMLMediaElement;
    context: AudioContext | undefined;
    fftSize: number;
  }>,
): WebAudioParts {
  const context = resolveAudioContext(options.context);
  const mediaNode = attachElement(options.element, context);
  return createWebAudioParts(context, mediaNode, options.fftSize);
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
