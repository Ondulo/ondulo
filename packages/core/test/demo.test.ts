import { describe, expect, it } from "vitest";

import { createAnalyser, createSource } from "../src/index.js";

const BEAT_SECONDS = 60 / 112;

/** Builds a Demo Source and Analyser driven by a clock the test controls. */
function createDemoAnalyser(seed: number) {
  const clock = { time: 0 };
  const source = createSource({ kind: "demo", seed, clock: () => clock.time });
  const analyser = createAnalyser({ source });
  return { clock, analyser };
}

describe("Demo Source", () => {
  it("produces the same frames for the same seed and time", () => {
    const first = createDemoAnalyser(7);
    const second = createDemoAnalyser(7);
    const other = createDemoAnalyser(8);

    for (const demo of [first, second, other]) {
      demo.clock.time = 1.234;
      demo.analyser.update();
    }

    expect(first.analyser.features.waveform).toEqual(
      second.analyser.features.waveform,
    );
    expect(first.analyser.features.spectrum).toEqual(
      second.analyser.features.spectrum,
    );
    expect(first.analyser.features.spectrum).not.toEqual(
      other.analyser.features.spectrum,
    );
  });

  it("fills the existing Analyser buffers with in-range values as time advances", () => {
    const { clock, analyser } = createDemoAnalyser(1);
    const { waveform, spectrum, bands } = analyser.features;
    const levels: number[] = [];

    for (let frame = 0; frame < 30; frame += 1) {
      clock.time = frame / 60;
      analyser.update();
      levels.push(analyser.features.level);
    }

    expect(analyser.features.waveform).toBe(waveform);
    expect(analyser.features.spectrum).toBe(spectrum);
    expect(analyser.features.bands).toBe(bands);
    expect(waveform.every((sample) => sample >= -1 && sample <= 1)).toBe(true);
    expect(
      spectrum.every((magnitude) => magnitude >= 0 && magnitude <= 1),
    ).toBe(true);
    expect(new Set(levels).size).toBeGreaterThan(1);
  });

  it("thumps on the beat: bass is louder at beat onset than halfway through", () => {
    const { clock, analyser } = createDemoAnalyser(3);

    clock.time = 4 * BEAT_SECONDS;
    analyser.update();
    const onsetBass = analyser.features.bass;
    const onsetLevel = analyser.features.level;

    clock.time = 4.5 * BEAT_SECONDS;
    analyser.update();

    expect(onsetBass).toBeGreaterThan(analyser.features.bass * 1.5);
    expect(onsetLevel).toBeGreaterThan(analyser.features.level);
    expect(analyser.features.mid).toBeGreaterThan(0);
    expect(analyser.features.treble).toBeGreaterThan(0);
  });
});
