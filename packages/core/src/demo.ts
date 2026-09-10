/**
 * Deterministic music-like signal for the Demo Source.
 *
 * Every frame is a pure function of (seed, time): a kick on each beat, a
 * hi-hat on each off-beat, a chord that changes every bar, and a plucked
 * melody note chosen per beat. The spectrum is drawn directly in the
 * log-frequency domain instead of being computed from the waveform, which
 * keeps it cheap; both share the same envelopes so level and bands agree.
 */

const BEATS_PER_SECOND = 112 / 60;
const BEATS_PER_BAR = 4;
const KICK_FREQUENCY = 55;
const HARMONICS = 3;
/** Am, F, G, Em as MIDI notes. */
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
  [52, 55, 59],
] as const;
/** A minor pentatonic, used for the melody. */
const SCALE = [69, 72, 74, 76, 79, 81, 84] as const;

// Waveform amplitudes sum to 1 so samples stay within -1 to 1.
const KICK_AMPLITUDE = 0.5;
const CHORD_NOTE_AMPLITUDE = 0.1;
const MELODY_AMPLITUDE = 0.15;
const HAT_AMPLITUDE = 0.05;

const PEAK_COUNT = 1 + CHORDS[0].length * HARMONICS + HARMONICS;
const KICK_PEAK_WIDTH = 0.5;
const NOTE_PEAK_WIDTH = 0.06;
const NOISE_FRAMES_PER_SECOND = 24;

export type DemoSignalOptions = Readonly<{
  sampleRate: number;
  fftSize: number;
  seed: number;
  /** Returns the current time in seconds. */
  clock: () => number;
}>;

export type DemoSignalReader = (
  waveform: Float32Array,
  spectrum: Float32Array,
) => void;

/**
 * Returns a reader that fills the given buffers with the frame at the clock's
 * current time, measured from when the reader was created.
 */
export function createDemoSignal(options: DemoSignalOptions): DemoSignalReader {
  const { sampleRate, fftSize, seed, clock } = options;
  const startTime = clock();
  const binCount = fftSize / 2;
  const frequencyPerBin = sampleRate / fftSize;

  // Per-bin tables computed once; per-frame peak lists reused every frame.
  const binLog2Frequency = new Float32Array(binCount);
  const binFloor = new Float32Array(binCount);
  const binHatGain = new Float32Array(binCount);
  for (let binIndex = 1; binIndex < binCount; binIndex += 1) {
    const frequency = binIndex * frequencyPerBin;
    binLog2Frequency[binIndex] = Math.log2(frequency);
    binFloor[binIndex] = 0.05 * (200 / frequency) ** 0.25;
    binHatGain[binIndex] = 3 * smoothstep(3_000, 8_000, frequency);
  }
  const peakLog2Frequency = new Float32Array(PEAK_COUNT);
  const peakAmplitude = new Float32Array(PEAK_COUNT);
  const peakWidth = new Float32Array(PEAK_COUNT);
  const noteFrequencies = new Float32Array(CHORDS[0].length + 1);

  return (waveform, spectrum) => {
    const time = clock() - startTime;
    const beat = time * BEATS_PER_SECOND;
    const beatIndex = Math.floor(beat);
    const beatPhase = beat - beatIndex;
    const kickEnvelope = Math.exp(-6 * beatPhase);
    const hatEnvelope = Math.exp(-16 * ((beat + 0.5) % 1));
    const chordEnvelope =
      0.75 + 0.25 * Math.sin((2 * Math.PI * beat) / (2 * BEATS_PER_BAR));
    const melodyEnvelope = Math.exp(-3 * beatPhase);

    const chord = CHORDS[Math.floor(beat / BEATS_PER_BAR) % CHORDS.length];
    for (let noteIndex = 0; noteIndex < chord.length; noteIndex += 1) {
      noteFrequencies[noteIndex] = midiToFrequency(chord[noteIndex]);
    }
    const melodyNote =
      SCALE[Math.floor(hash(seed, beatIndex, 0) * SCALE.length)];
    noteFrequencies[chord.length] = midiToFrequency(melodyNote);

    writeWaveform(waveform, {
      time,
      sampleRate,
      noteFrequencies,
      chordNoteCount: chord.length,
      kickEnvelope,
      hatEnvelope,
      chordEnvelope,
      melodyEnvelope,
      seed,
    });

    // Spectrum peaks: kick, chord harmonics, melody harmonics.
    let peakIndex = 0;
    peakLog2Frequency[peakIndex] = Math.log2(KICK_FREQUENCY);
    peakAmplitude[peakIndex] = kickEnvelope;
    peakWidth[peakIndex] = KICK_PEAK_WIDTH;
    peakIndex += 1;
    for (let noteIndex = 0; noteIndex < noteFrequencies.length; noteIndex += 1) {
      const isMelody = noteIndex === chord.length;
      const envelope = isMelody ? 0.7 * melodyEnvelope : 0.6 * chordEnvelope;
      for (let harmonic = 1; harmonic <= HARMONICS; harmonic += 1) {
        peakLog2Frequency[peakIndex] = Math.log2(
          noteFrequencies[noteIndex] * harmonic,
        );
        peakAmplitude[peakIndex] = envelope / harmonic;
        peakWidth[peakIndex] = NOTE_PEAK_WIDTH;
        peakIndex += 1;
      }
    }

    const noiseFrame = Math.floor(time * NOISE_FRAMES_PER_SECOND);
    const noiseBlend = time * NOISE_FRAMES_PER_SECOND - noiseFrame;
    spectrum[0] = 0;
    for (let binIndex = 1; binIndex < binCount; binIndex += 1) {
      const texture =
        0.6 +
        0.8 *
          lerp(
            hash(seed, binIndex, noiseFrame),
            hash(seed, binIndex, noiseFrame + 1),
            noiseBlend,
          );
      let magnitude =
        binFloor[binIndex] * (1 + hatEnvelope * binHatGain[binIndex]) * texture;

      const log2Frequency = binLog2Frequency[binIndex];
      for (let index = 0; index < PEAK_COUNT; index += 1) {
        const distance =
          (log2Frequency - peakLog2Frequency[index]) / peakWidth[index];
        if (distance > -3 && distance < 3) {
          magnitude += peakAmplitude[index] * Math.exp(-distance * distance);
        }
      }

      spectrum[binIndex] = magnitude > 1 ? 1 : magnitude;
    }
  };
}

function writeWaveform(
  waveform: Float32Array,
  frame: Readonly<{
    time: number;
    sampleRate: number;
    noteFrequencies: Float32Array;
    chordNoteCount: number;
    kickEnvelope: number;
    hatEnvelope: number;
    chordEnvelope: number;
    melodyEnvelope: number;
    seed: number;
  }>,
): void {
  const kickGain = KICK_AMPLITUDE * frame.kickEnvelope;
  const chordGain = CHORD_NOTE_AMPLITUDE * frame.chordEnvelope;
  const melodyGain = MELODY_AMPLITUDE * frame.melodyEnvelope;
  const hatGain = HAT_AMPLITUDE * frame.hatEnvelope;
  const twoPi = 2 * Math.PI;

  for (let sampleIndex = 0; sampleIndex < waveform.length; sampleIndex += 1) {
    const sampleTime = frame.time + sampleIndex / frame.sampleRate;
    let sample = kickGain * Math.sin(twoPi * KICK_FREQUENCY * sampleTime);
    for (
      let noteIndex = 0;
      noteIndex < frame.noteFrequencies.length;
      noteIndex += 1
    ) {
      const gain = noteIndex < frame.chordNoteCount ? chordGain : melodyGain;
      sample +=
        gain * Math.sin(twoPi * frame.noteFrequencies[noteIndex] * sampleTime);
    }
    sample += hatGain * (2 * hash(frame.seed, sampleIndex, 1) - 1);
    waveform[sampleIndex] = sample > 1 ? 1 : sample < -1 ? -1 : sample;
  }
}

function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/** Deterministic integer hash of (seed, a, b) mapped to the range 0 to 1. */
function hash(seed: number, a: number, b: number): number {
  let value =
    (seed ^ Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  value ^= value >>> 15;
  return (value >>> 0) / 4_294_967_296;
}
