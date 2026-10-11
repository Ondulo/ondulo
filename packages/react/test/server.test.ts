import { createAnalyser, createSource } from "@ondulo/core";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";

import { Spectrum, useAnalyser, useFeatures } from "../src/index.js";

it("imports and renders hooks on a server without scheduling frames", () => {
  const source = createSource({ kind: "demo" });
  const analyser = createAnalyser({ source });

  function ServerVisualizer() {
    const analyser = useAnalyser({ source });
    useFeatures(analyser, () => {});
    return createElement("span", null, analyser.features.level);
  }

  expect(typeof window).toBe("undefined");
  expect(renderToString(createElement(ServerVisualizer))).toBe("<span>0</span>");
  expect(
    renderToString(createElement(Spectrum, { analyser, mode: "lines" })),
  ).toContain("<canvas");
});
