import { and, eq, gt, lt, or } from "drizzle-orm";
import { availabilities } from "../../drizzle/schema";
import { getDb } from "../db";
import { DatabaseMachineRepository, normalizeMachine } from "../db/operationsRepository";
import type { MachineReservation } from "./machineService";
import type { MachineName } from "../types/operations";

export class BlockedAwareMachineRepository extends DatabaseMachineRepository {
  override async listReservations(startsAt: Date, endsAt: Date): Promise<MachineReservation[]> {
    const existing = await super.listReservations(startsAt, endsAt);
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is not configured");
    const blocked = await db.select().from(availabilities).where(
      and(
        eq(availabilities.kind, "BLOCKED"),
        lt(availabilities.startsAt, endsAt),
        gt(availabilities.endsAt, startsAt),
        or(eq(availabilities.machineName, "Deka Again 1"), eq(availabilities.machineName, "Clarity 2"), eq(availabilities.machineName, "Gentle Pro Max"), eq(availabilities.machineName, "Dueto")),
      ),
    );
    return [
      ...existing,
      ...blocked.map((row: any) => ({
        machineName: normalizeMachine(String(row.machineName)) as MachineName,
        startsAt: new Date(row.startsAt),
        endsAt: new Date(row.endsAt),
      })),
    ];
  }
}
