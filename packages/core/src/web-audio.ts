/**
 * What a Web Audio Source hands to source.ts: the private frame reader plus
 * the context, resume and dispose it exposes publicly.
 */
export type WebAudioParts = Readonly<{
  context: AudioContext;
  read(
    waveform: Float32Array<ArrayBuffer>,
    spectrum: Float32Array<ArrayBuffer>,
  ): void;
  resume(): Promise<void>;
  dispose(): void;
}>;

/**
 * Connects an AnalyserNode after `input` and returns the Source's behaviour.
 * `dispose` is idempotent and disconnects the AnalyserNode only; `input`
 * keeps any other connections it has.
 */
export function createWebAudioParts(
  context: AudioContext,
  input: AudioNode,
  fftSize: number,
): WebAudioParts {
  const analyserNode = context.createAnalyser();
  analyserNode.fftSize = fftSize;
  // Smoothing is a Visualizer parameter, so the node hands over raw frames.
  analyserNode.smoothingTimeConstant = 0;
  input.connect(analyserNode);
  const bytes = new Uint8Array(fftSize / 2);
  let disposed = false;

  return {
    context,
    read(waveform, spectrum) {
      if (context.state === "suspended") {
        throw new Error(
          "AudioContext is suspended. Call source.resume() from a user gesture and await it before updating the Analyser.",
        );
      }
      analyserNode.getFloatTimeDomainData(waveform);
      analyserNode.getByteFrequencyData(bytes);
      for (let binIndex = 0; binIndex < bytes.length; binIndex += 1) {
        spectrum[binIndex] = bytes[binIndex] / 255;
      }
    },
    resume: () => context.resume(),
    dispose() {
      if (disposed) {
        return;
      }
      try {
        input.disconnect(analyserNode);
      } catch (error) {
        // The app may have disconnected its own node before disposing this Source.
        if (
          error === null ||
          typeof error !== "object" ||
          !("name" in error) ||
          error.name !== "InvalidAccessError"
        ) {
          throw error;
        }
      }
      analyserNode.disconnect();
      disposed = true;
    },
  };
}
