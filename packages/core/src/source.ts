const DEFAULT_FFT_SIZE = 2048;
const MAX_FFT_SIZE = 32_768;
const sourceBrand: unique symbol = Symbol("ondulo.source");

export type PushedFrame = Readonly<{
  waveform: ArrayLike<number>;
  spectrum: ArrayLike<number>;
}>;

export type CreateSourceOptions = Readonly<{
  kind: "pushed";
  sampleRate: number;
  fftSize?: number;
}>;

export type Source = Readonly<{
  [sourceBrand]: true;
  kind: "pushed";
  sampleRate: number;
  fftSize: number;
  push(frame: PushedFrame): void;
}>;

type SourceBuffers = Readonly<{
  waveform: Float32Array;
  spectrum: Float32Array;
}>;

const sourceBuffers = new WeakMap<Source, SourceBuffers>();

/**
 * Creates a Source whose normalized waveform and spectrum values are supplied
 * by the host application.
 */
export function createSource(options: CreateSourceOptions): Source {
  validateSampleRate(options.sampleRate);
  const fftSize = options.fftSize ?? DEFAULT_FFT_SIZE;
  validateFftSize(fftSize);

  const buffers: SourceBuffers = {
    waveform: new Float32Array(fftSize),
    spectrum: new Float32Array(fftSize / 2),
  };

  const source: Source = {
    [sourceBrand]: true,
    kind: "pushed",
    sampleRate: options.sampleRate,
    fftSize,
    push(frame) {
      validateFrameValues(frame.waveform, fftSize, -1, 1, "waveform");
      validateFrameValues(frame.spectrum, fftSize / 2, 0, 1, "spectrum");

      buffers.waveform.set(frame.waveform);
      buffers.spectrum.set(frame.spectrum);
    },
  };

  sourceBuffers.set(source, buffers);
  return source;
}

export function copySourceFrame(
  source: Source,
  waveformTarget: Float32Array,
  spectrumTarget: Float32Array,
): void {
  const buffers = sourceBuffers.get(source);
  if (buffers === undefined) {
    throw new TypeError("Source must be created with createSource().");
  }

  waveformTarget.set(buffers.waveform);
  spectrumTarget.set(buffers.spectrum);
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
