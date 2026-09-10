let defaultContext: AudioContext | undefined;

/**
 * Returns the AudioContext supplied by the app, or one shared context created
 * lazily on first use. Browsers cap the number of contexts per page, so every
 * Source that is not given one shares the same default.
 */
export function resolveAudioContext(
  context: AudioContext | undefined,
): AudioContext {
  if (context !== undefined) {
    return context;
  }
  if (defaultContext === undefined) {
    if (typeof AudioContext === "undefined") {
      throw new TypeError(
        "AudioContext is not available in this environment. Create the Source in the browser or pass options.context.",
      );
    }
    defaultContext = new AudioContext();
  }
  return defaultContext;
}
