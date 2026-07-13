import { useEffect, useState } from 'react';
import { api } from '../api';

interface InvoiceRow {
  id: string;
  numeroComprobante: number | null;
  tipo: string;
  importe: string;
  fechaServicio: string;
  status: 'EMITTED' | 'PENDING' | 'FAILED';
  emittedAt: string;
  patient?: { fullName: string };
}

export default function Dashboard() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<InvoiceRow[]>('/invoices')
      .then(setInvoices)
      .catch((err: Error) => setError(err.message));
  }, []);

  const now = new Date();
  const thisMonth = invoices.filter((inv) => {
    const date = new Date(inv.emittedAt);
    return (
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear() &&
      inv.status === 'EMITTED'
    );
  });
  const totalMonth = thisMonth.reduce((sum, inv) => sum + Number(inv.importe), 0);
  const lastFive = invoices.slice(0, 5);

  return (
    <>
      <h1>Dashboard</h1>
      {error && <div className="error">{error}</div>}
      <div className="grid">
        <div className="card stat">
          <div className="label">Facturado este mes</div>
          <div className="value">${totalMonth.toLocaleString('es-AR')}</div>
        </div>
        <div className="card stat">
          <div className="label">Facturas este mes</div>
          <div className="value">{thisMonth.length}</div>
        </div>
        <div className="card stat">
          <div className="label">Pendientes de AFIP</div>
          <div className="value">
            {invoices.filter((inv) => inv.status === 'PENDING').length}
          </div>
        </div>
      </div>
      <div className="card">
        <h1>Últimas facturas</h1>
        {lastFive.length === 0 ? (
          <p className="muted">Todavía no emitiste facturas.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Paciente</th>
                <th>Fecha</th>
                <th>Importe</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lastFive.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.numeroComprobante ?? '—'}</td>
                  <td>{inv.patient?.fullName ?? '—'}</td>
                  <td>{inv.fechaServicio}</td>
                  <td>${Number(inv.importe).toLocaleString('es-AR')}</td>
                  <td>
                    <span className={`badge ${inv.status}`}>{inv.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
