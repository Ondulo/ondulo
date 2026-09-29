import type { Analyser, CreateAnalyserOptions } from "@ondulo/core";
import { createAnalyser } from "@ondulo/core";
import { useMemo } from "react";

/** Keeps an Analyser for one Source and set of frequency options. The app owns the Source. */
export function useAnalyser(options: CreateAnalyserOptions): Analyser {
  const { source, bandsPerOctave, minFrequency, maxFrequency } = options;

  return useMemo(
    () =>
      createAnalyser({
        source,
        ...(bandsPerOctave === undefined ? {} : { bandsPerOctave }),
        ...(minFrequency === undefined ? {} : { minFrequency }),
        ...(maxFrequency === undefined ? {} : { maxFrequency }),
      }),
    [source, bandsPerOctave, minFrequency, maxFrequency],
  );
}
