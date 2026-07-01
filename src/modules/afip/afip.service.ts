import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Afip from '@afipsdk/afip.js';

/** AFIP no respondió (timeout / red). La factura queda PENDING y se reintenta. */
export class AfipUnavailableError extends Error {
  constructor(cause: string) {
    super(`AFIP unavailable: ${cause}`);
  }
}

export interface AfipEmitInput {
  cuit: string;
  cert: string; // PEM descifrado
  key: string; // PEM descifrado
  production: boolean;
  puntoVenta: number;
  tipo: 'B' | 'C';
  amount: number;
  serviceDate: string; // yyyy-mm-dd
}

export interface AfipEmitResult {
  cae: string;
  caeVencimiento: string;
  numeroComprobante: number;
}

const CBTE_TIPO: Record<'B' | 'C', number> = { B: 6, C: 11 };
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1_000;
const CONNECTION_ERRORS = /timeout|timed out|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|network/i;

/**
 * Encapsula el SDK de AFIP (WSFE). Sin estado ni persistencia: recibe
 * credenciales ya descifradas y devuelve el resultado de la emisión.
 * Concepto 2 = Servicios. DocTipo 99 / DocNro 0 = consumidor final.
 */
@Injectable()
export class AfipService {
  private readonly logger = new Logger(AfipService.name);

  constructor(private readonly config: ConfigService) {}

  async emitVoucher(input: AfipEmitInput): Promise<AfipEmitResult> {
    const afip = new Afip({
      CUIT: Number(input.cuit),
      cert: input.cert,
      key: input.key,
      production: input.production,
      // Token del servicio de AfipSDK; opcional en homologación.
      access_token: this.config.get<string>('AFIP_SDK_ACCESS_TOKEN') ?? '',
    });
    const cbteTipo = CBTE_TIPO[input.tipo];

    return this.withRetries(async () => {
      const last = (await afip.ElectronicBilling.getLastVoucher(
        input.puntoVenta,
        cbteTipo,
      )) as number;
      const numero = last + 1;
      const serviceDateNum = this.toAfipDate(input.serviceDate);
      const todayNum = this.toAfipDate(new Date().toISOString().slice(0, 10));

      const voucher = {
        CantReg: 1,
        PtoVta: input.puntoVenta,
        CbteTipo: cbteTipo,
        Concepto: 2, // Servicios
        DocTipo: 99, // Consumidor final
        DocNro: 0,
        CondicionIVAReceptorId: 5, // Consumidor final
        CbteDesde: numero,
        CbteHasta: numero,
        CbteFch: todayNum,
        FchServDesde: serviceDateNum,
        FchServHasta: serviceDateNum,
        FchVtoPago: todayNum,
        ImpTotal: input.amount,
        ImpTotConc: 0,
        ImpNeto: input.amount,
        ImpOpEx: 0,
        ImpIVA: 0,
        ImpTrib: 0,
        MonId: 'PES',
        MonCotiz: 1,
      };
      const res = (await afip.ElectronicBilling.createVoucher(voucher)) as {
        CAE: string;
        CAEFchVto: string;
      };
      return {
        cae: res.CAE,
        caeVencimiento: res.CAEFchVto,
        numeroComprobante: numero,
      };
    });
  }

  /**
   * Reintenta errores de conexión/timeout con backoff exponencial.
   * Al agotar los reintentos lanza AfipUnavailableError; los errores de
   * negocio de AFIP (certificado inválido, datos rechazados) se propagan tal cual.
   */
  private async withRetries<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error = new Error('unknown');
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (!CONNECTION_ERRORS.test(lastError.message)) throw lastError;
        this.logger.warn(
          `AFIP connection error (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError.message}`,
        );
        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_BASE_MS * 2 ** attempt);
        }
      }
    }
    throw new AfipUnavailableError(lastError.message);
  }

  /** yyyy-mm-dd → yyyymmdd numérico (formato WSFE). */
  private toAfipDate(isoDate: string): number {
    return Number(isoDate.replace(/-/g, ''));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
