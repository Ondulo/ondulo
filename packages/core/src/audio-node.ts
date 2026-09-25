import { createWebAudioParts, type WebAudioParts } from "./web-audio.js";

/** Adds an analysis connection to the node, leaving playback routing to the app. */
export function createAudioNodeParts(
  node: AudioNode,
  fftSize: number,
): WebAudioParts {
  const context = node.context;
  if (!isRealtimeContext(context)) {
    throw new TypeError(
      "AudioNode must belong to an AudioContext, not an OfflineAudioContext.",
    );
  }

  return createWebAudioParts(context, node, fftSize);
}

function isRealtimeContext(context: BaseAudioContext): context is AudioContext {
  // Both context types have resume(), but only AudioContext has close().
  // Checking the capability also accepts contexts from another window.
  return "close" in context && typeof context.close === "function";
}
