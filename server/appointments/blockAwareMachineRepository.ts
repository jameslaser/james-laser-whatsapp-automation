import { and, gt, lt } from "drizzle-orm";
import { availabilities } from "../../drizzle/schema";
import { getDb } from "../db";
import type { MachineName } from "../types/operations";
import type { MachineRepository, MachineReservation } from "./machineService";
import { DatabaseMachineRepository, normalizeMachine } from "../db/operationsRepository";

/** Adds persisted machine BLOCKED windows to the normal appointment reservations. */
export class BlockAwareMachineRepository implements MachineRepository {
  constructor(private readonly base = new DatabaseMachineRepository()) {}

  async listReservations(startsAt: Date, endsAt: Date): Promise<MachineReservation[]> {
    const reservations = await this.base.listReservations(startsAt, endsAt);
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is not configured");
    const rows = await db.select().from(availabilities).where(and(lt(availabilities.startsAt, endsAt), gt(availabilities.endsAt, startsAt)));
    for (const row of rows as any[]) {
      if (row.kind !== "BLOCKED" || !row.machineName) continue;
      reservations.push({ machineName: normalizeMachine(String(row.machineName)), startsAt: new Date(row.startsAt), endsAt: new Date(row.endsAt), appointmentId: `blocked:${row.id}` });
    }
    return reservations;
  }

  reserve(input: MachineReservation) { return this.base.reserve(input); }
  release(appointmentId: string) { return this.base.release(appointmentId); }
  block(machineName: MachineName, startsAt: Date, endsAt: Date, reason: string) { return this.base.block(machineName, startsAt, endsAt, reason); }
}
