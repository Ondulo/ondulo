import type { Analyser, Features } from "@ondulo/core";
import { useEffect, useRef } from "react";

/** Reads Features on animation frames without rendering React for every frame. */
export function useFeatures(
  analyser: Analyser,
  onFrame: (features: Features, time: number) => void,
  onError?: (error: unknown) => void,
): void {
  const onFrameRef = useRef(onFrame);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onFrameRef.current = onFrame;
    onErrorRef.current = onError;
  }, [onFrame, onError]);

  useEffect(() => {
    let active = true;
    let lastError: string | undefined;
    let frameId = requestAnimationFrame(readFrame);

    function readFrame(time: number): void {
      try {
        analyser.update();
      } catch (error) {
        if (active) {
          frameId = requestAnimationFrame(readFrame);
        }
        const message = error instanceof Error ? error.message : String(error);
        if (message !== lastError) {
          lastError = message;
          if (onErrorRef.current) {
            onErrorRef.current(error);
          } else {
            throw error;
          }
        }
        return;
      }

      lastError = undefined;
      onFrameRef.current(analyser.features, time);
      if (active) {
        frameId = requestAnimationFrame(readFrame);
      }
    }

    return () => {
      active = false;
      cancelAnimationFrame(frameId);
    };
  }, [analyser]);
}
