import { describe, expect, test, vi } from "vitest";

import { createDebouncedAction } from "@/lib/kinship/autosave";

describe("autosave debounce", () => {
  test("flushes only the latest queued value", () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const action = createDebouncedAction((value: string) => saved.push(value), 500);

    action.trigger("first");
    action.trigger("second");

    vi.advanceTimersByTime(499);
    expect(saved).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(saved).toEqual(["second"]);

    vi.useRealTimers();
  });
});
