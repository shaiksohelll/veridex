import { describe, expect, it } from "vitest";
import { NODE_LABELS, RELATIONSHIP_TYPES, assertFrozenGraphDefinition } from "./schema";

describe("frozen graph schema", () => {
  it("contains exactly twelve unique node labels and sixteen unique relationship types", () => {
    expect(NODE_LABELS).toHaveLength(12);
    expect(new Set(NODE_LABELS)).toHaveLength(12);
    expect(RELATIONSHIP_TYPES).toHaveLength(16);
    expect(new Set(RELATIONSHIP_TYPES)).toHaveLength(16);
    expect(() => assertFrozenGraphDefinition()).not.toThrow();
  });
});
