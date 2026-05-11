import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { KinshipSymbolPreview } from "@/components/editor/kinship-symbol-preview";

describe("kinship symbol preview", () => {
  test("renders circles for female symbols and triangles for male symbols", () => {
    const female = render(
      React.createElement(KinshipSymbolPreview, { symbolType: "female" }),
    );
    const male = render(
      React.createElement(KinshipSymbolPreview, { symbolType: "male" }),
    );

    expect(female.container.querySelector("circle")).toBeTruthy();
    expect(female.container.querySelector("path")).toBeFalsy();
    expect(male.container.querySelector("path")).toBeTruthy();
  });

  test("shows slash and inner dot variants when needed", () => {
    const deceased = render(
      React.createElement(KinshipSymbolPreview, {
        symbolType: "deceased-female",
      }),
    );
    const adopted = render(
      React.createElement(KinshipSymbolPreview, {
        symbolType: "adopted-male",
      }),
    );

    expect(deceased.container.querySelectorAll("path")).toHaveLength(1);
    expect(adopted.container.querySelectorAll("circle")).toHaveLength(1);
  });
});
