import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';

interface Patient {
  id: string;
  fullName: string;
}

interface EmitResult {
  status: 'EMITTED' | 'PENDING';
  numeroComprobante?: number;
  cae?: string;
  caeVencimiento?: string;
}

export default function TestInvoice() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [afipEnv, setAfipEnv] = useState('');
  const [form, setForm] = useState({
    patientId: '',
    amount: '',
    serviceDate: new Date().toISOString().slice(0, 10),
  });
  const [result, setResult] = useState<EmitResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<Patient[]>('/patients').then(setPatients).catch(() => undefined);
    api<{ afipEnv: string }>('/professionals/me')
      .then((profile) => setAfipEnv(profile.afipEnv))
      .catch(() => undefined);
  }, []);

  async function emit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      setResult(
        await api<EmitResult>('/invoices/emit', {
          method: 'POST',
          body: JSON.stringify({
            patientId: form.patientId,
            amount: Number(form.amount),
            serviceDate: form.serviceDate,
          }),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Factura de prueba</h1>
      <div className="card">
        <p className="muted">
          Emite una factura real contra el entorno AFIP configurado:{' '}
          <strong>{afipEnv === 'prod' ? '⚠️ PRODUCCIÓN' : 'homologación (pruebas)'}</strong>.
          Usala para verificar tus certificados antes de activar producción.
        </p>
        <form onSubmit={emit}>
          <label>
            Paciente
            <select
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
              required
            >
              <option value="">Elegí un paciente…</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.fullName}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <label>
              Importe ($)
              <input
                type="number"
                min={1}
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </label>
            <label>
              Fecha del servicio
              <input
                type="date"
                value={form.serviceDate}
                onChange={(e) => setForm({ ...form, serviceDate: e.target.value })}
                required
              />
            </label>
          </div>
          <button disabled={loading}>{loading ? 'Emitiendo…' : 'Emitir factura'}</button>
        </form>
        {error && <div className="error">{error}</div>}
        {result?.status === 'EMITTED' && (
          <div className="success">
            ✅ Emitida — N° {result.numeroComprobante} · CAE {result.cae} · Vence{' '}
            {result.caeVencimiento}
          </div>
        )}
        {result?.status === 'PENDING' && (
          <div className="muted">
            ⚠️ AFIP no respondió: quedó PENDING y se reintenta automáticamente cada 15 minutos.
          </div>
        )}
      </div>
    </>
  );
}
