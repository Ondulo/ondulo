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
  assertCorsAccess(options.element);
  const context = resolveAudioContext(options.context);
  const mediaNode = attachElement(options.element, context);
  const parts = createWebAudioParts(context, mediaNode, options.fftSize);
  let checkedCurrentSrc = options.element.currentSrc;
  let checkedCrossOrigin = options.element.crossOrigin;

  return {
    ...parts,
    read(waveform, spectrum) {
      if (
        options.element.currentSrc !== checkedCurrentSrc ||
        options.element.crossOrigin !== checkedCrossOrigin
      ) {
        assertCorsAccess(options.element);
        checkedCurrentSrc = options.element.currentSrc;
        checkedCrossOrigin = options.element.crossOrigin;
      }
      parts.read(waveform, spectrum);
    },
  };
}

function assertCorsAccess(element: HTMLMediaElement): void {
  if (element.currentSrc === "" || element.crossOrigin !== null) {
    return;
  }

  const documentOrigin = element.ownerDocument?.location?.origin;
  if (documentOrigin === undefined) {
    return;
  }

  const resourceUrl = new URL(element.currentSrc);
  if (
    (resourceUrl.protocol === "http:" || resourceUrl.protocol === "https:") &&
    resourceUrl.origin !== documentOrigin
  ) {
    throw new Error(
      'Media element audio is unavailable to Web Audio because its selected resource is cross-origin without CORS. Set element.crossOrigin = "anonymous" before setting src and allow the page origin in the resource\'s Access-Control-Allow-Origin header.',
    );
  }
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
