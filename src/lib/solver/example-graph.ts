import type { Edge, Graph, Node } from "./types";

function node(
  id: string,
  displayName: string,
  fixedColor: Node["fixedColor"],
  parentNodeId?: string,
): Node {
  return { id, parentNodeId, displayName, fixedColor };
}

function contrastEdge(id: string, sourceNodeId: string, targetNodeId: string, value: number): Edge {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    constraints: [{ type: "contrast", background: "source", value, tolerance: 2 }],
  };
}

function textEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  contrast: number,
  chroma: number,
): Edge {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    constraints: [
      { type: "contrast", background: "source", value: contrast, tolerance: 2 },
      { type: "fixed-chroma", value: chroma, tolerance: 0.005 },
    ],
  };
}

export function exampleGraph(): Graph {
  const bodyBg1 = node("node-bodyBg1", "bodyBg1", { l: 0.985, c: 0.006, h: 190 });
  const bodyBg2 = node("node-bodyBg2", "bodyBg2", undefined, bodyBg1.id);
  const bodyText1 = node("node-bodyText1", "bodyText1", undefined, bodyBg1.id);
  const bodyText2 = node("node-bodyText2", "bodyText2", undefined, bodyBg1.id);
  const bodyText3 = node("node-bodyText3", "bodyText3", undefined, bodyBg1.id);
  const border1 = node("node-border1", "border1", undefined, bodyBg1.id);
  const border2 = node("node-border2", "border2", undefined, bodyBg1.id);
  const border3 = node("node-border3", "border3", undefined, bodyBg1.id);

  const solidOrangeBg1 = node("node-solidOrangeBg1", "solidOrangeBg1", {
    l: 0.573242,
    c: 0.153125,
    h: 50,
  });
  const solidOrangeBg2 = node(
    "node-solidOrangeBg2",
    "solidOrangeBg2",
    undefined,
    solidOrangeBg1.id,
  );
  const solidOrangeText = node(
    "node-solidOrangeText",
    "solidOrangeText",
    undefined,
    solidOrangeBg1.id,
  );

  const solidTealBg1 = node("node-solidTealBg1", "solidTealBg1", {
    l: 0.58,
    c: 0.13495,
    h: 190,
  });
  const solidTealBg2 = node("node-solidTealBg2", "solidTealBg2", undefined, solidTealBg1.id);
  const solidTealText = node("node-solidTealText", "solidTealText", undefined, solidTealBg1.id);

  const lightTealBg1 = node("node-lightTealBg1", "lightTealBg1", {
    l: 0.935,
    c: 0.03,
    h: 190,
  });
  const lightTealBg2 = node("node-lightTealBg2", "lightTealBg2", undefined, lightTealBg1.id);
  const lightTealText = node("node-lightTealText", "lightTealText", undefined, lightTealBg1.id);

  const lightOrangeBg1 = node("node-lightOrangeBg1", "lightOrangeBg1", {
    l: 0.94,
    c: 0.03,
    h: 50,
  });
  const lightOrangeBg2 = node(
    "node-lightOrangeBg2",
    "lightOrangeBg2",
    undefined,
    lightOrangeBg1.id,
  );
  const lightOrangeText = node(
    "node-lightOrangeText",
    "lightOrangeText",
    undefined,
    lightOrangeBg1.id,
  );
  const lightOrangeBorder1 = node(
    "node-lightOrangeBorder1",
    "lightOrangeBorder1",
    undefined,
    lightOrangeBg1.id,
  );
  const lightOrangeBorder2 = node(
    "node-lightOrangeBorder2",
    "lightOrangeBorder2",
    undefined,
    lightOrangeBg1.id,
  );

  const lightRedBg1 = node("node-lightRedBg1", "lightRedBg1", { l: 0.945, c: 0.03576, h: 25 });
  const lightRedBg2 = node("node-lightRedBg2", "lightRedBg2", undefined, lightRedBg1.id);
  const lightRedText = node("node-lightRedText", "lightRedText", undefined, lightRedBg1.id);

  return {
    nodes: [
      bodyBg1,
      bodyBg2,
      bodyText1,
      bodyText2,
      bodyText3,
      border1,
      border2,
      border3,
      solidOrangeBg1,
      solidOrangeBg2,
      solidOrangeText,
      solidTealBg1,
      solidTealBg2,
      solidTealText,
      lightTealBg1,
      lightTealBg2,
      lightTealText,
      lightOrangeBg1,
      lightOrangeBg2,
      lightOrangeText,
      lightOrangeBorder1,
      lightOrangeBorder2,
      lightRedBg1,
      lightRedBg2,
      lightRedText,
    ],
    edges: [
      contrastEdge("edge-bodyBg1-bodyBg2", bodyBg1.id, bodyBg2.id, 10),
      textEdge("edge-bodyBg1-bodyText1", bodyBg1.id, bodyText1.id, 90, 0.0489),
      textEdge("edge-bodyBg1-bodyText2", bodyBg1.id, bodyText2.id, 70, 0.01),
      textEdge("edge-bodyBg1-bodyText3", bodyBg1.id, bodyText3.id, 50, 0.01),
      contrastEdge("edge-bodyBg1-border1", bodyBg1.id, border1.id, 25),
      contrastEdge("edge-bodyBg1-border2", bodyBg1.id, border2.id, 55),
      contrastEdge("edge-bodyBg1-border3", bodyBg1.id, border3.id, 85),
      contrastEdge("edge-solidOrangeBg1-solidOrangeBg2", solidOrangeBg1.id, solidOrangeBg2.id, 10),
      textEdge("edge-solidOrangeBg1-solidOrangeText", solidOrangeBg1.id, solidOrangeText.id, 90, 0),
      contrastEdge("edge-solidTealBg1-solidTealBg2", solidTealBg1.id, solidTealBg2.id, 10),
      textEdge("edge-solidTealBg1-solidTealText", solidTealBg1.id, solidTealText.id, 90, 0),
      contrastEdge("edge-lightTealBg1-lightTealBg2", lightTealBg1.id, lightTealBg2.id, 10),
      textEdge("edge-lightTealBg1-lightTealText", lightTealBg1.id, lightTealText.id, 90, 0.14),
      contrastEdge("edge-lightOrangeBg1-lightOrangeBg2", lightOrangeBg1.id, lightOrangeBg2.id, 10),
      textEdge(
        "edge-lightOrangeBg1-lightOrangeText",
        lightOrangeBg1.id,
        lightOrangeText.id,
        90,
        0.21,
      ),
      contrastEdge(
        "edge-lightOrangeBg1-lightOrangeBorder1",
        lightOrangeBg1.id,
        lightOrangeBorder1.id,
        60,
      ),
      contrastEdge(
        "edge-lightOrangeBg1-lightOrangeBorder2",
        lightOrangeBg1.id,
        lightOrangeBorder2.id,
        20,
      ),
      contrastEdge("edge-lightRedBg1-lightRedBg2", lightRedBg1.id, lightRedBg2.id, 10),
      textEdge("edge-lightRedBg1-lightRedText", lightRedBg1.id, lightRedText.id, 90, 0.275),
    ],
  };
}

export function testingExampleGraph(): Graph {
  const bgPrimary = node("node-bg-primary", "bg-primary", { l: 1, c: 0, h: 0 });
  const textPrimary = node("node-text-primary", "text-primary", undefined, bgPrimary.id);
  const textSecondary = node("node-text-secondary", "text-secondary", undefined, bgPrimary.id);
  const bgYellow = node("node-bg-yellow", "bg-yellow", { l: 0.987, c: 0.022, h: 95.277 });
  const textYellow = node("node-text-yellow", "text-yellow", undefined, bgYellow.id);
  const textYellowSecondary = node(
    "node-text-yellow-secondary",
    "text-yellow-secondary",
    undefined,
    bgYellow.id,
  );
  const bgPurple = node("node-bg-purple", "bg-purple", { l: 0.969, c: 0.016, h: 293.756 });
  const textPurple = node("node-text-purple", "text-purple", undefined, bgPurple.id);
  const textPurpleSecondary = node(
    "node-text-purple-secondary",
    "text-purple-secondary",
    undefined,
    bgPurple.id,
  );

  return {
    nodes: [
      bgPrimary,
      textPrimary,
      textSecondary,
      bgYellow,
      textYellow,
      textYellowSecondary,
      bgPurple,
      textPurple,
      textPurpleSecondary,
    ],
    edges: [
      contrastEdge("edge-bg-primary-text-primary", bgPrimary.id, textPrimary.id, 90),
      contrastEdge("edge-bg-primary-text-secondary", bgPrimary.id, textSecondary.id, 60),
      contrastEdge("edge-bg-yellow-text-yellow", bgYellow.id, textYellow.id, 90),
      contrastEdge("edge-bg-yellow-text-yellow-secondary", bgYellow.id, textYellowSecondary.id, 60),
      contrastEdge("edge-bg-purple-text-purple", bgPurple.id, textPurple.id, 90),
      contrastEdge("edge-bg-purple-text-purple-secondary", bgPurple.id, textPurpleSecondary.id, 60),
    ],
  };
}
