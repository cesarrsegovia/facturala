/** Token de inyección para IWhatsAppGateway (regla di-use-interfaces-tokens). */
export const WHATSAPP_GATEWAY = Symbol('WHATSAPP_GATEWAY');

/**
 * Abstracción del canal de mensajería. Hoy Twilio; mañana Meta Cloud API.
 * El resto del sistema depende de esta interfaz, no de Twilio.
 */
export interface IWhatsAppGateway {
  sendMessage(to: string, body: string): Promise<void>;
  sendDocument(to: string, mediaUrl: string, caption?: string): Promise<void>;
}
