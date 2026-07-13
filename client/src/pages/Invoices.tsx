import { useCallback, useEffect, useState } from 'react';
import { api, downloadPdf } from '../api';

interface InvoiceRow {
  id: string;
  numeroComprobante: number | null;
  tipo: string;
  importe: string;
  fechaServicio: string;
  cae: string | null;
  status: 'EMITTED' | 'PENDING' | 'FAILED';
  patient?: { fullName: string };
}

const STATUSES = ['', 'EMITTED', 'PENDING', 'FAILED'] as const;

export default function Invoices() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (filter: string) => {
    try {
      const query = filter ? `?status=${filter}` : '';
      setInvoices(await api<InvoiceRow[]>(`/invoices${query}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [status, load]);

  async function pdf(invoice: InvoiceRow) {
    try {
      await downloadPdf(
        `/invoices/${invoice.id}/pdf`,
        `factura-${invoice.numeroComprobante ?? invoice.id}.pdf`,
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1>Facturas</h1>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <label>
          Filtrar por estado
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || 'Todas'}
              </option>
            ))}
          </select>
        </label>
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Tipo</th>
              <th>Paciente</th>
              <th>Fecha servicio</th>
              <th>Importe</th>
              <th>CAE</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.numeroComprobante ?? '—'}</td>
                <td>{inv.tipo}</td>
                <td>{inv.patient?.fullName ?? '—'}</td>
                <td>{inv.fechaServicio}</td>
                <td>${Number(inv.importe).toLocaleString('es-AR')}</td>
                <td>{inv.cae ?? '—'}</td>
                <td>
                  <span className={`badge ${inv.status}`}>{inv.status}</span>
                </td>
                <td>
                  {inv.status === 'EMITTED' && (
                    <button className="secondary" onClick={() => void pdf(inv)}>
                      PDF
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && <p className="muted">Sin facturas.</p>}
      </div>
    </>
  );
}
