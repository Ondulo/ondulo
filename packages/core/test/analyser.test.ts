import { describe, expect, it } from "vitest";

import {
  createAnalyser,
  createSource,
  type CreateSourceOptions,
  type Source,
} from "../src/index.js";

const SAMPLE_RATE = 48_000;
const FFT_SIZE = 2_048;

describe("pushed Source", () => {
  it("accepts a caller's Source options union", () => {
    const fromOptions = (options: CreateSourceOptions): Source =>
      createSource(options);

    expect(fromOptions({ kind: "pushed", sampleRate: SAMPLE_RATE }).kind).toBe(
      "pushed",
    );
  });

  it("rejects Source settings that could create invalid buffers", () => {
    expect(() =>
      createSource({ kind: "pushed", sampleRate: 0 }),
    ).toThrow("sampleRate must be a positive finite number");
    expect(() =>
      createSource({ kind: "pushed", sampleRate: SAMPLE_RATE, fftSize: 65_536 }),
    ).toThrow("fftSize must be a power of two from 32 to 32768");
  });

  it("copies valid frames so later caller mutations cannot change them", () => {
    const source = createSource({
      kind: "pushed",
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
    });
    const waveform = new Float32Array(FFT_SIZE).fill(0.5);
    const spectrum = new Float32Array(FFT_SIZE / 2).fill(0.25);

    source.push({ waveform, spectrum });
    waveform.fill(1);
    spectrum.fill(1);

    const analyser = createAnalyser({ source });
    analyser.update();

    expect(analyser.features.waveform[0]).toBe(0.5);
    expect(analyser.features.spectrum[0]).toBe(0.25);
  });

  it("rejects malformed values at the push boundary", () => {
    const source = createSource({
      kind: "pushed",
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
    });
    const waveform = new Float32Array(FFT_SIZE);
    const spectrum = new Float32Array(FFT_SIZE / 2);

    expect(() =>
      source.push({ waveform: waveform.subarray(1), spectrum }),
    ).toThrow("waveform must contain exactly 2048 values");

    spectrum[10] = 1.1;
    expect(() => source.push({ waveform, spectrum })).toThrow(
      "spectrum[10] must be a finite number from 0 to 1",
    );
  });
});

describe("Analyser", () => {
  it("updates one stable Features object and its typed arrays", () => {
    const source = createSource({
      kind: "pushed",
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
    });
    const analyser = createAnalyser({ source });
    const features = analyser.features;
    const waveform = features.waveform;
    const spectrum = features.spectrum;
    const bands = features.bands;

    source.push({
      waveform: new Float32Array(FFT_SIZE).fill(0.5),
      spectrum: createThreeBandSpectrum(),
    });
    analyser.update();

    expect(analyser.features).toBe(features);
    expect(analyser.features.waveform).toBe(waveform);
    expect(analyser.features.spectrum).toBe(spectrum);
    expect(analyser.features.bands).toBe(bands);
    expect(analyser.features.level).toBeCloseTo(0.5);
  });

  it("derives bass, mid, treble, and log-spaced bands", () => {
    const source = createSource({
      kind: "pushed",
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
    });
    source.push({
      waveform: new Float32Array(FFT_SIZE),
      spectrum: createThreeBandSpectrum(),
    });
    const analyser = createAnalyser({ source });

    analyser.update();

    expect(analyser.features.bass).toBeCloseTo(0.25);
    expect(analyser.features.mid).toBeCloseTo(0.5);
    expect(analyser.features.treble).toBeCloseTo(0.75);
    expect(analyser.features.bands.some((magnitude) => magnitude > 0)).toBe(true);
  });
});

function createThreeBandSpectrum(): Float32Array {
  const spectrum = new Float32Array(FFT_SIZE / 2);
  const frequencyPerBin = SAMPLE_RATE / FFT_SIZE;

  for (let binIndex = 1; binIndex < spectrum.length; binIndex += 1) {
    const frequency = binIndex * frequencyPerBin;
    if (frequency >= 20 && frequency < 250) {
      spectrum[binIndex] = 0.25;
    } else if (frequency < 4_000) {
      spectrum[binIndex] = 0.5;
    } else {
      spectrum[binIndex] = 0.75;
    }
  }

  return spectrum;
}
