import { db } from "@/lib/kinship/db";
import {
  cloneChartDocument,
  createChartRecord,
  normaliseTitle,
} from "@/lib/kinship/document";
import type { ChartDocument, ChartRecord, RemoteChartRecord } from "@/lib/kinship/types";

export async function listCharts() {
  const charts = await db.charts.orderBy("updatedAt").reverse().toArray();
  return charts.filter((chart) => !chart.deleted);
}

export async function getChartRecord(id: string) {
  return db.charts.get(id);
}

export async function saveChartRecord(record: ChartRecord) {
  await db.charts.put(record);
  return record;
}

export async function ensureChartRecord(id: string, title = "Untitled chart") {
  const existing = await getChartRecord(id);

  if (existing) {
    return existing;
  }

  const created = createChartRecord(title, undefined, id);
  await saveChartRecord(created);
  return created;
}

export async function createChartFromDocument(
  title: string,
  document: ChartDocument,
  id = crypto.randomUUID(),
) {
  const record = createChartRecord(title, document, id);
  await saveChartRecord(record);
  return record;
}

export async function saveChartDocument(
  id: string,
  document: ChartDocument,
  options?: Partial<
    Pick<
      ChartRecord,
      | "cloudId"
      | "deleted"
      | "dirty"
      | "egoNodeId"
      | "lastSyncedAt"
      | "memberIds"
      | "ownerId"
    >
  >,
) {
  const existing = await db.charts.get(id);

  if (!existing) {
    const record = createChartRecord(document.meta.title, document, id);
    record.dirty = options?.dirty ?? true;
    record.deleted = options?.deleted ?? false;
    record.ownerId = options?.ownerId;
    record.memberIds = options?.memberIds;
    record.egoNodeId = options?.egoNodeId;
    record.cloudId = options?.cloudId;
    record.lastSyncedAt = options?.lastSyncedAt;
    await saveChartRecord(record);
    return record;
  }

  const record: ChartRecord = {
    ...existing,
    title: normaliseTitle(document.meta.title),
    document: cloneChartDocument(document),
    updatedAt: document.meta.updatedAt,
    dirty: options?.dirty ?? true,
    deleted: options?.deleted ?? existing.deleted,
    ownerId: options?.ownerId ?? existing.ownerId,
    memberIds: options?.memberIds ?? existing.memberIds,
    egoNodeId: options?.egoNodeId ?? existing.egoNodeId,
    cloudId: options?.cloudId ?? existing.cloudId,
    lastSyncedAt: options?.lastSyncedAt ?? existing.lastSyncedAt,
  };

  await saveChartRecord(record);
  return record;
}

export async function markChartDeleted(id: string) {
  const existing = await db.charts.get(id);

  if (!existing) {
    return;
  }

  await saveChartRecord({
    ...existing,
    deleted: true,
    dirty: true,
    updatedAt: new Date().toISOString(),
  });
}

export async function purgeChart(id: string) {
  await db.charts.delete(id);
}

/** Removes legacy anonymous rows (no `ownerId`) from IndexedDB after cloud auth. */
export async function purgeChartsWithoutOwner() {
  const rows = await db.charts.toArray();
  await Promise.all(
    rows
      .filter((chart) => chart.ownerId == null || chart.ownerId === "")
      .map((chart) => db.charts.delete(chart.id)),
  );
}

/**
 * Removes any local charts that aren't owned by `userId`. Run on sign-in so
 * the IndexedDB cache only ever holds the current account's data — this is
 * the single source of the `42501: row violates RLS` errors during sync,
 * which happen when a chart row left over from a previous Google account
 * collides on `id` with a remote row owned by a different `auth.uid()`.
 *
 * Includes ownerless rows (treated as legacy/anonymous) for the same
 * reason `purgeChartsWithoutOwner` did.
 */
export async function purgeChartsNotOwnedBy(userId: string) {
  const rows = await db.charts.toArray();
  await Promise.all(
    rows
      .filter(
        (chart) =>
          chart.ownerId !== userId && !chart.memberIds?.includes(userId),
      )
      .map((chart) => db.charts.delete(chart.id)),
  );
}

export function remoteChartToLocal(
  remote: RemoteChartRecord,
  accessUserId?: string,
  membership?: { ego_node_id?: string | null },
): ChartRecord {
  const memberIds = Array.from(
    new Set([remote.user_id, accessUserId].filter(Boolean) as string[]),
  );

  return {
    id: remote.id,
    title: normaliseTitle(remote.title),
    document: cloneChartDocument(remote.document),
    updatedAt: remote.updated_at,
    ownerId: remote.user_id,
    memberIds,
    egoNodeId: membership?.ego_node_id ?? null,
    cloudId: remote.id,
    dirty: false,
    deleted: false,
    lastSyncedAt: remote.updated_at,
  };
}
