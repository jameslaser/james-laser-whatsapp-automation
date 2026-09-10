export interface TreatmentDuration {
  code: string;
  name: string;
  minMinutes: number;
  maxMinutes: number;
}

export const DEFAULT_TREATMENT_DURATIONS: TreatmentDuration[] = [
  { code: "full-face", name: "Full Face", minMinutes: 15, maxMinutes: 15 },
  { code: "underarms", name: "Underarms", minMinutes: 15, maxMinutes: 15 },
  { code: "bikini", name: "Bikini", minMinutes: 15, maxMinutes: 15 },
  { code: "hands", name: "Hands", minMinutes: 15, maxMinutes: 15 },
  { code: "feet", name: "Feet", minMinutes: 15, maxMinutes: 15 },
  { code: "chest", name: "Chest", minMinutes: 30, maxMinutes: 30 },
  { code: "abdomen", name: "Abdomen", minMinutes: 30, maxMinutes: 30 },
  { code: "thighs", name: "Thighs", minMinutes: 15, maxMinutes: 30 },
  { code: "legs", name: "Legs", minMinutes: 30, maxMinutes: 30 },
  { code: "full-back", name: "Full Back", minMinutes: 45, maxMinutes: 45 },
  { code: "shoulders", name: "Shoulders", minMinutes: 30, maxMinutes: 30 },
  { code: "buttocks", name: "Buttocks", minMinutes: 20, maxMinutes: 30 },
  { code: "full-body", name: "Full Body", minMinutes: 120, maxMinutes: 120 },
  { code: "mini-full-body", name: "Mini Full Body", minMinutes: 90, maxMinutes: 105 },
  { code: "full-body-retouch", name: "Full Body Retouch", minMinutes: 90, maxMinutes: 90 },
  { code: "mini-body-retouch", name: "Mini Body Retouch", minMinutes: 60, maxMinutes: 60 },
];

export class TreatmentCatalog {
  constructor(private readonly durations: TreatmentDuration[] = DEFAULT_TREATMENT_DURATIONS) {}
  get(treatmentCode: string): TreatmentDuration {
    const treatment = this.durations.find(item => item.code === treatmentCode);
    if (!treatment) throw new Error(`Unknown treatment: ${treatmentCode}`);
    return treatment;
  }
  calculateDuration(treatmentCode: string, preference: "minimum" | "maximum" = "maximum"): number {
    const treatment = this.get(treatmentCode);
    return preference === "minimum" ? treatment.minMinutes : treatment.maxMinutes;
  }
}
