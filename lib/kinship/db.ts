import Dexie, { type Table } from "dexie";

import type { ChartRecord } from "@/lib/kinship/types";

class KinshipMakerDatabase extends Dexie {
  charts!: Table<ChartRecord, string>;

  constructor() {
    super("kinship-maker");

    this.version(1).stores({
      charts: "id, updatedAt, ownerId, cloudId, dirty, deleted, lastSyncedAt",
    });
  }
}

export const db = new KinshipMakerDatabase();
