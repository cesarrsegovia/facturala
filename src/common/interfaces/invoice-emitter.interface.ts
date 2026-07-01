/** Token de inyección para IInvoiceEmitter (regla di-use-interfaces-tokens). */
export const INVOICE_EMITTER = Symbol('INVOICE_EMITTER');

export interface EmitInvoiceInput {
  professionalId: string;
  patientId: string;
  amount: number;
  serviceDate: string;
}

/**
 * Resultado de la emisión. `EMITTED` incluye CAE y link al PDF;
 * `PENDING` significa que AFIP no estaba disponible y se reintentará por cron.
 */
export interface EmittedInvoice {
  status: 'EMITTED' | 'PENDING';
  invoiceId: string;
  cae?: string;
  caeVencimiento?: string;
  numeroComprobante?: number;
  pdfUrl?: string;
}

/**
 * Emite una factura y la persiste. Implementado por InvoicesService (AFIP real).
 */
export interface IInvoiceEmitter {
  emit(input: EmitInvoiceInput): Promise<EmittedInvoice>;
}
