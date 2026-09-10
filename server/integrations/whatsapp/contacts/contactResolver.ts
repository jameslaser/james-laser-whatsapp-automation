export interface ResolvedContact {
  id: string;
  phoneNumber: string;
  kind: "patient" | "lead";
  created: boolean;
}

export interface ContactRepository {
  findByWhatsAppNumber(phoneNumber: string): Promise<ResolvedContact | null>;
  createLeadFromWhatsApp(phoneNumber: string): Promise<ResolvedContact>;
}

export class ContactResolver {
  constructor(private readonly repository: ContactRepository) {}

  async resolve(phoneNumber: string): Promise<ResolvedContact> {
    const normalized = normalizeWhatsAppNumber(phoneNumber);
    const existing = await this.repository.findByWhatsAppNumber(normalized);
    if (existing) return existing;
    return this.repository.createLeadFromWhatsApp(normalized);
  }
}

export function normalizeWhatsAppNumber(phoneNumber: string): string {
  const normalized = phoneNumber.replace(/[^0-9+]/g, "");
  if (normalized.length < 8) throw new Error("A valid WhatsApp phone number is required");
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}
