import { describe, expect, test } from "vitest";

import { decideSyncAction } from "@/lib/kinship/sync";
import { createChartRecord } from "@/lib/kinship/document";
import type { RemoteChartRecord } from "@/lib/kinship/types";

function createRemoteRecord(overrides?: Partial<RemoteChartRecord>): RemoteChartRecord {
  const local = createChartRecord("Remote");

  return {
    id: local.id,
    user_id: "user-1",
    title: local.title,
    document: local.document,
    updated_at: local.updatedAt,
    ...overrides,
  };
}

describe("sync decisions", () => {
  test("pushes newer dirty local charts", () => {
    const local = createChartRecord("Local");
    local.lastSyncedAt = "2026-05-08T00:00:00.000Z";
    local.updatedAt = "2026-05-08T01:00:00.000Z";
    local.dirty = true;

    const remote = createRemoteRecord({
      id: local.id,
      updated_at: "2026-05-08T00:00:00.000Z",
    });

    expect(decideSyncAction(local, remote)).toBe("push");
  });

  test("pulls newer remote charts", () => {
    const local = createChartRecord("Local");
    local.lastSyncedAt = "2026-05-08T00:00:00.000Z";
    local.updatedAt = "2026-05-08T00:00:00.000Z";
    local.dirty = false;

    const remote = createRemoteRecord({
      id: local.id,
      updated_at: "2026-05-08T01:30:00.000Z",
    });

    expect(decideSyncAction(local, remote)).toBe("pull");
  });

  test("flags concurrent local and remote edits as conflicts", () => {
    const local = createChartRecord("Local");
    local.lastSyncedAt = "2026-05-08T00:00:00.000Z";
    local.updatedAt = "2026-05-08T01:00:00.000Z";
    local.dirty = true;

    const remote = createRemoteRecord({
      id: local.id,
      updated_at: "2026-05-08T01:15:00.000Z",
    });

    expect(decideSyncAction(local, remote)).toBe("conflict");
  });
});
