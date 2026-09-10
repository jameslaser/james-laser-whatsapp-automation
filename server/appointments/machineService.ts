import { MACHINE_NAMES, type MachineName } from "../types/operations";

export interface MachineReservation { machineName: MachineName; startsAt: Date; endsAt: Date; appointmentId?: string; }
export interface MachineRepository {
  listReservations(startsAt: Date, endsAt: Date): Promise<MachineReservation[]>;
  reserve(input: MachineReservation): Promise<void>;
  release(appointmentId: string): Promise<void>;
  block(machineName: MachineName, startsAt: Date, endsAt: Date, reason: string): Promise<void>;
}

export class MachineService {
  constructor(private readonly repository: MachineRepository) {}

  async getMachineAvailability(startsAt: Date, endsAt: Date): Promise<MachineName[]> {
    const reserved = await this.repository.listReservations(startsAt, endsAt);
    return MACHINE_NAMES.filter(machine => !reserved.some(item => item.machineName === machine));
  }

  async assignMachine(startsAt: Date, endsAt: Date, preferred?: MachineName, appointmentId?: string): Promise<MachineName> {
    const available = await this.getMachineAvailability(startsAt, endsAt);
    const selected = preferred && available.includes(preferred) ? preferred : available[0];
    if (!selected) throw new Error("No laser machine is available for the requested time");
    await this.repository.reserve({ machineName: selected, startsAt, endsAt, appointmentId });
    return selected;
  }

  releaseMachine(appointmentId: string) { return this.repository.release(appointmentId); }
  blockMachine(machineName: MachineName, startsAt: Date, endsAt: Date, reason: string) { return this.repository.block(machineName, startsAt, endsAt, reason); }
}
