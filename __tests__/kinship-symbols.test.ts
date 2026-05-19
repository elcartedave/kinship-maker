import { describe, expect, it } from "vitest";

import {
  isSymbolTypeAllowedForSexAssignedAtBirth,
  normalizeSexAssignedAtBirth,
} from "@/lib/kinship/symbols";

describe("isSymbolTypeAllowedForSexAssignedAtBirth", () => {
  it("allows any symbol when sex is unknown", () => {
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("male", null)).toBe(true);
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("female", undefined)).toBe(
      true,
    );
  });

  it("restricts male-linked nodes to male symbol variants", () => {
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("male", "male")).toBe(true);
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("adopted-male", "male")).toBe(
      true,
    );
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("deceased-male", "male")).toBe(
      true,
    );
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("male-ego", "male")).toBe(
      true,
    );
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("female", "male")).toBe(
      false,
    );
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("adopted-female", "male")).toBe(
      false,
    );
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("deceased-female", "male")).toBe(
      false,
    );
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("female-ego", "male")).toBe(
      false,
    );
  });

  it("restricts female-linked nodes to female symbol variants", () => {
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("female", "female")).toBe(
      true,
    );
    expect(
      isSymbolTypeAllowedForSexAssignedAtBirth("adopted-female", "female"),
    ).toBe(true);
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("male", "female")).toBe(
      false,
    );
    expect(isSymbolTypeAllowedForSexAssignedAtBirth("male-ego", "female")).toBe(
      false,
    );
  });
});

describe("normalizeSexAssignedAtBirth", () => {
  it("normalizes known values", () => {
    expect(normalizeSexAssignedAtBirth("Male")).toBe("male");
    expect(normalizeSexAssignedAtBirth(" female ")).toBe("female");
    expect(normalizeSexAssignedAtBirth("other")).toBe(null);
  });
});
