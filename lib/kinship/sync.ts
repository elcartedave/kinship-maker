import type { SupabaseClient } from "@supabase/supabase-js";

import { createConflictCopy } from "@/lib/kinship/document";
import { db } from "@/lib/kinship/db";
import {
  getChartRecord,
  purgeChart,
  remoteChartToLocal,
  saveChartRecord,
} from "@/lib/kinship/local-store";
import type {
  ChartRecord,
  RemoteChartRecord,
  SyncSummary,
} from "@/lib/kinship/types";

type SyncDecision = "pull" | "push" | "conflict" | "noop";

function toTimestamp(value?: string) {
  return value ? new Date(value).getTime() : 0;
}

export function decideSyncAction(local: ChartRecord, remote: RemoteChartRecord) {
  const localUpdatedAt = toTimestamp(local.updatedAt);
  const remoteUpdatedAt = toTimestamp(remote.updated_at);
  const lastSyncedAt = toTimestamp(local.lastSyncedAt);

  const localChangedAfterSync = local.dirty || localUpdatedAt > lastSyncedAt;
  const remoteChangedAfterSync = remoteUpdatedAt > lastSyncedAt;

  if (localChangedAfterSync && remoteChangedAfterSync) {
    return "conflict" as const;
  }

  if (localChangedAfterSync && localUpdatedAt >= remoteUpdatedAt) {
    return "push" as const;
  }

  if (remoteUpdatedAt > localUpdatedAt) {
    return "pull" as const;
  }

  return "noop" as const;
}

async function pushChart(
  client: SupabaseClient,
  local: ChartRecord,
  userId: string,
) {
  const remoteId = local.cloudId ?? local.id;
  const payload = {
    id: remoteId,
    user_id: userId,
    title: local.title,
    document: local.document,
    updated_at: local.updatedAt,
  };

  // We deliberately do NOT chain `.select().single()` here. That used to add
  // a second roundtrip just to read back the row we already know — the
  // server stores `updated_at` exactly as we send it (no trigger in
  // `supabase/charts.sql`). Skipping the readback halves the cloud-save
  // latency the user perceives.
  const { error } = await client.from("charts").upsert(payload);

  if (error) {
    throw error;
  }

  // Re-read from Dexie so we don't clobber edits the user made while the
  // upsert was in flight. If their edit landed first (different
  // updatedAt), keep `dirty: true` so the next sync picks it up.
  const fresh = await getChartRecord(local.id);
  const base = fresh ?? local;
  const stillDirty = base.updatedAt !== local.updatedAt;

  await saveChartRecord({
    ...base,
    ownerId: userId,
    cloudId: remoteId,
    dirty: stillDirty,
    deleted: false,
    lastSyncedAt: local.updatedAt,
  });
}

/**
 * Fast path used while editing a single chart. Pushes ONLY the given
 * chart instead of scanning the user's full library — the bulk
 * `syncChartsForUser` query is appropriate on auth/online events but is
 * far too expensive to run after every keystroke or node move.
 *
 * Returns a {@link SyncSummary} so callers can fold it into the same
 * `lastSync` state used by the bulk path.
 */
export async function pushSingleChart(
  client: SupabaseClient,
  chartId: string,
  userId: string,
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    deleted: 0,
  };

  const local = await getChartRecord(chartId);
  if (!local) {
    return summary;
  }
  // Defense in depth: if the local row was authored under a different
  // user (purgeChartsNotOwnedBy missed it for some reason), do not push
  // it — that path produces RLS 42501 errors.
  if (local.ownerId != null && local.ownerId !== userId) {
    return summary;
  }

  if (local.deleted) {
    await deleteRemoteChart(client, local);
    summary.deleted += 1;
    return summary;
  }

  if (!local.dirty) {
    return summary;
  }

  await pushChart(client, local, userId);
  summary.pushed += 1;
  return summary;
}

async function pullChart(remote: RemoteChartRecord) {
  await saveChartRecord(remoteChartToLocal(remote));
}

async function deleteRemoteChart(
  client: SupabaseClient,
  local: ChartRecord,
) {
  const remoteId = local.cloudId ?? local.id;

  await client.from("charts").delete().eq("id", remoteId);
  await purgeChart(local.id);
}

export async function syncChartsForUser(
  client: SupabaseClient,
  userId: string,
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    deleted: 0,
  };

  const { data, error } = await client
    .from("charts")
    .select("id, user_id, title, document, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  const remoteCharts = (data ?? []) as RemoteChartRecord[];
  const remoteMap = new Map(remoteCharts.map((chart) => [chart.id, chart]));
  const allLocalCharts = await db.charts.toArray();
  // Only consider rows that belong to the current user (or legacy
  // ownerless rows, which we treat as theirs). Any row whose `ownerId`
  // is set to a different user must be skipped — pushing it would hit a
  // 42501 RLS error on the existing remote row owned by that other user.
  const localCharts = allLocalCharts.filter(
    (chart) => chart.ownerId == null || chart.ownerId === userId,
  );

  for (const local of localCharts) {
    if (local.deleted) {
      await deleteRemoteChart(client, local);
      summary.deleted += 1;
      continue;
    }

    const remote = remoteMap.get(local.cloudId ?? local.id);

    if (!remote) {
      if (local.dirty || !local.cloudId) {
        await pushChart(client, local, userId);
        summary.pushed += 1;
      }

      continue;
    }

    const decision = decideSyncAction(local, remote) as SyncDecision;

    if (decision === "conflict") {
      await saveChartRecord(createConflictCopy(local));
      await pullChart(remote);
      summary.conflicts += 1;
      continue;
    }

    if (decision === "push") {
      await pushChart(client, local, userId);
      summary.pushed += 1;
      continue;
    }

    if (decision === "pull") {
      await pullChart(remote);
      summary.pulled += 1;
      continue;
    }

    if (!local.cloudId || local.lastSyncedAt !== remote.updated_at) {
      await saveChartRecord({
        ...local,
        ownerId: userId,
        cloudId: remote.id,
        dirty: false,
        lastSyncedAt: remote.updated_at,
      });
    }
  }

  for (const remote of remoteCharts) {
    const existing = await getChartRecord(remote.id);

    if (!existing) {
      await pullChart(remote);
      summary.pulled += 1;
    }
  }

  return summary;
}
