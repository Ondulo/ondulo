/**
 * Per-frame values produced by an Analyser.
 *
 * The Analyser keeps this object and its typed arrays stable between updates.
 * Consumers should read the arrays but must not mutate them.
 */
export type Features = Readonly<{
  /** Raw, linear-frequency spectrum bins normalized to the range 0 to 1. */
  spectrum: Float32Array;
  /** Log-spaced spectrum bands normalized to the range 0 to 1. */
  bands: Float32Array;
  /** Time-domain samples normalized to the range -1 to 1. */
  waveform: Float32Array;
  /** Root mean square level normalized to the range 0 to 1. */
  level: number;
  /** Average spectrum magnitude from 20 Hz up to 250 Hz. */
  bass: number;
  /** Average spectrum magnitude from 250 Hz up to 4 kHz. */
  mid: number;
  /** Average spectrum magnitude from 4 kHz up to the Nyquist frequency. */
  treble: number;
}>;

export type MutableFeatures = {
  -readonly [Key in keyof Features]: Features[Key];
};
