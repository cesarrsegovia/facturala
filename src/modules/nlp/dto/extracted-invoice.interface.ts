/** Resultado estructurado de la extracción NLP de un mensaje de facturación. */
export interface ExtractedInvoice {
  patientName: string | null;
  amount: number | null;
  date: string | null; // ISO yyyy-mm-dd
  consultationType: string | null;
  confidence: 'high' | 'low';
}
