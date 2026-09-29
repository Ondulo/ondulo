import { createSource } from "@ondulo/core";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";

import { useAnalyser, useFeatures } from "../src/index.js";

it("imports and renders hooks on a server without scheduling frames", () => {
  const source = createSource({ kind: "demo" });

  function ServerVisualizer() {
    const analyser = useAnalyser({ source });
    useFeatures(analyser, () => {});
    return createElement("span", null, analyser.features.level);
  }

  expect(typeof window).toBe("undefined");
  expect(renderToString(createElement(ServerVisualizer))).toBe("<span>0</span>");
});
