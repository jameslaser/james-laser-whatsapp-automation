import axios, { type AxiosInstance } from "axios";
import { getWhatsAppConfig } from "../config/env";
import type {
  WhatsAppInteractiveInput,
  WhatsAppMediaInput,
  WhatsAppMessageInput,
  WhatsAppTemplateInput,
} from "../../../types/operations";

export interface WhatsAppApiResponse {
  messaging_product: "whatsapp";
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string; message_status?: string }>;
  error?: { message?: string; type?: string; code?: number; fbtrace_id?: string };
}

export class WhatsAppClient {
  private readonly http: AxiosInstance;
  private readonly phoneNumberId: string;

  constructor() {
    const config = getWhatsAppConfig();
    this.phoneNumberId = config.phoneNumberId;
    this.http = axios.create({
      baseURL: `https://graph.facebook.com/${config.graphApiVersion}`,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 15_000,
    });
  }

  async sendTextMessage(input: WhatsAppMessageInput): Promise<WhatsAppApiResponse> {
    return this.send({ messaging_product: "whatsapp", to: input.to, type: "text", text: { body: input.text, preview_url: input.previewUrl ?? false } });
  }

  async sendTemplateMessage(input: WhatsAppTemplateInput): Promise<WhatsAppApiResponse> {
    return this.send({
      messaging_product: "whatsapp",
      to: input.to,
      type: "template",
      template: { name: input.templateName, language: { code: input.languageCode }, components: input.components },
    });
  }

  async sendInteractiveMessage(input: WhatsAppInteractiveInput): Promise<WhatsAppApiResponse> {
    return this.send({ messaging_product: "whatsapp", to: input.to, type: "interactive", interactive: input.interactive });
  }

  async sendMediaMessage(input: WhatsAppMediaInput): Promise<WhatsAppApiResponse> {
    const media = { ...(input.mediaId ? { id: input.mediaId } : {}), ...(input.link ? { link: input.link } : {}), ...(input.caption ? { caption: input.caption } : {}), ...(input.filename ? { filename: input.filename } : {}) };
    return this.send({ messaging_product: "whatsapp", to: input.to, type: input.mediaType, [input.mediaType]: media });
  }

  async markMessageAsRead(messageId: string): Promise<WhatsAppApiResponse> {
    return this.send({ messaging_product: "whatsapp", status: "read", message_id: messageId });
  }

  private async send(payload: Record<string, unknown>): Promise<WhatsAppApiResponse> {
    const response = await this.http.post<WhatsAppApiResponse>(`/${this.phoneNumberId}/messages`, payload);
    return response.data;
  }
}

export function createWhatsAppClient(): WhatsAppClient {
  return new WhatsAppClient();
}
