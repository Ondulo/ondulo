import type { Features, MutableFeatures } from "./features.js";
import { readSourceFrame, type Source } from "./source.js";

const DEFAULT_BANDS_PER_OCTAVE = 12;
const DEFAULT_MIN_FREQUENCY = 32;
const BASS_MAX_FREQUENCY = 250;
const MID_MAX_FREQUENCY = 4_000;

export type CreateAnalyserOptions = Readonly<{
  source: Source;
  bandsPerOctave?: number;
  minFrequency?: number;
  maxFrequency?: number;
}>;

export type Analyser = Readonly<{
  source: Source;
  features: Features;
  /** Refreshes Features. Throws if a Web Audio Source's context is suspended. */
  update(): void;
}>;

type SpectrumLayout = Readonly<{
  binToBand: Int32Array;
  bandDivisors: Float32Array;
  binToRange: Uint8Array;
  rangeDivisors: Float32Array;
}>;

/** Creates an Analyser that updates one stable Features object from one Source. */
export function createAnalyser(options: CreateAnalyserOptions): Analyser {
  const bandsPerOctave = options.bandsPerOctave ?? DEFAULT_BANDS_PER_OCTAVE;
  const minFrequency = options.minFrequency ?? DEFAULT_MIN_FREQUENCY;
  const nyquistFrequency = options.source.sampleRate / 2;
  const maxFrequency = options.maxFrequency ?? nyquistFrequency;

  validateFrequencyOptions({
    bandsPerOctave,
    minFrequency,
    maxFrequency,
    nyquistFrequency,
  });

  const bandCount = Math.ceil(
    Math.log2(maxFrequency / minFrequency) * bandsPerOctave,
  );
  const features: MutableFeatures = {
    spectrum: new Float32Array(options.source.fftSize / 2),
    bands: new Float32Array(bandCount),
    waveform: new Float32Array(options.source.fftSize),
    level: 0,
    bass: 0,
    mid: 0,
    treble: 0,
  };
  const layout = createSpectrumLayout({
    spectrumSize: features.spectrum.length,
    sampleRate: options.source.sampleRate,
    fftSize: options.source.fftSize,
    bandCount,
    bandsPerOctave,
    minFrequency,
    maxFrequency,
  });
  const rangeSums = new Float32Array(3);

  return {
    source: options.source,
    features,
    update() {
      readSourceFrame(options.source, features.waveform, features.spectrum);
      features.level = calculateRootMeanSquare(features.waveform);
      updateSpectrumFeatures(features, layout, rangeSums);
    },
  };
}

function updateSpectrumFeatures(
  features: MutableFeatures,
  layout: SpectrumLayout,
  rangeSums: Float32Array,
): void {
  features.bands.fill(0);
  rangeSums.fill(0);

  for (let binIndex = 0; binIndex < features.spectrum.length; binIndex += 1) {
    const magnitude = features.spectrum[binIndex];
    const bandIndex = layout.binToBand[binIndex];
    if (bandIndex >= 0) {
      features.bands[bandIndex] += magnitude;
    }

    const range = layout.binToRange[binIndex];
    if (range > 0) {
      rangeSums[range - 1] += magnitude;
    }
  }

  for (let bandIndex = 0; bandIndex < features.bands.length; bandIndex += 1) {
    features.bands[bandIndex] *= layout.bandDivisors[bandIndex];
  }

  features.bass = rangeSums[0] * layout.rangeDivisors[0];
  features.mid = rangeSums[1] * layout.rangeDivisors[1];
  features.treble = rangeSums[2] * layout.rangeDivisors[2];
}

function calculateRootMeanSquare(waveform: Float32Array): number {
  let sumOfSquares = 0;
  for (let index = 0; index < waveform.length; index += 1) {
    const sample = waveform[index];
    sumOfSquares += sample * sample;
  }
  return Math.sqrt(sumOfSquares / waveform.length);
}

function createSpectrumLayout(options: Readonly<{
  spectrumSize: number;
  sampleRate: number;
  fftSize: number;
  bandCount: number;
  bandsPerOctave: number;
  minFrequency: number;
  maxFrequency: number;
}>): SpectrumLayout {
  const binToBand = new Int32Array(options.spectrumSize);
  binToBand.fill(-1);
  const bandCounts = new Uint32Array(options.bandCount);
  const binToRange = new Uint8Array(options.spectrumSize);
  const rangeCounts = new Uint32Array(3);
  const frequencyPerBin = options.sampleRate / options.fftSize;

  for (let binIndex = 1; binIndex < options.spectrumSize; binIndex += 1) {
    const frequency = binIndex * frequencyPerBin;
    if (frequency >= options.minFrequency && frequency < options.maxFrequency) {
      const bandIndex = Math.floor(
        Math.log2(frequency / options.minFrequency) * options.bandsPerOctave,
      );
      if (bandIndex < options.bandCount) {
        binToBand[binIndex] = bandIndex;
        bandCounts[bandIndex] += 1;
      }
    }

    const range = getFrequencyRange(frequency);
    binToRange[binIndex] = range;
    if (range > 0) {
      rangeCounts[range - 1] += 1;
    }
  }

  return {
    binToBand,
    bandDivisors: createDivisors(bandCounts),
    binToRange,
    rangeDivisors: createDivisors(rangeCounts),
  };
}

function getFrequencyRange(frequency: number): 0 | 1 | 2 | 3 {
  if (frequency >= 20 && frequency < BASS_MAX_FREQUENCY) {
    return 1;
  }
  if (frequency >= BASS_MAX_FREQUENCY && frequency < MID_MAX_FREQUENCY) {
    return 2;
  }
  if (frequency >= MID_MAX_FREQUENCY) {
    return 3;
  }
  return 0;
}

function createDivisors(counts: Uint32Array): Float32Array {
  return Float32Array.from(counts, (count) => (count === 0 ? 0 : 1 / count));
}

function validateFrequencyOptions(options: Readonly<{
  bandsPerOctave: number;
  minFrequency: number;
  maxFrequency: number;
  nyquistFrequency: number;
}>): void {
  if (!Number.isInteger(options.bandsPerOctave) || options.bandsPerOctave <= 0) {
    throw new RangeError("bandsPerOctave must be a positive integer.");
  }
  if (!Number.isFinite(options.minFrequency) || options.minFrequency <= 0) {
    throw new RangeError("minFrequency must be a positive finite number.");
  }
  if (
    !Number.isFinite(options.maxFrequency) ||
    options.maxFrequency <= options.minFrequency ||
    options.maxFrequency > options.nyquistFrequency
  ) {
    throw new RangeError(
      "maxFrequency must be greater than minFrequency and no greater than the Nyquist frequency.",
    );
  }
}
