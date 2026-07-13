import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../api';

interface Patient {
  id: string;
  fullName: string;
  dni: string | null;
  email: string | null;
  phone: string | null;
}

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ fullName: '', dni: '', email: '', phone: '' });

  const load = useCallback(async (term: string) => {
    try {
      const query = term ? `?search=${encodeURIComponent(term)}` : '';
      setPatients(await api<Patient[]>(`/patients${query}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(search), 250);
    return () => clearTimeout(timer);
  }, [search, load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/patients', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName,
          dni: form.dni || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
        }),
      });
      setForm({ fullName: '', dni: '', email: '', phone: '' });
      await load(search);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este paciente?')) return;
    try {
      await api(`/patients/${id}`, { method: 'DELETE' });
      await load(search);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1>Pacientes</h1>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h1>Nuevo paciente</h1>
        <form onSubmit={create}>
          <div className="row">
            <label>
              Nombre completo *
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
                minLength={2}
              />
            </label>
            <label>
              DNI
              <input value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              Teléfono
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
          </div>
          <button>Agregar</button>
        </form>
      </div>

      <div className="card">
        <label>
          Buscar
          <input
            placeholder="Nombre del paciente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>DNI</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr key={patient.id}>
                <td>{patient.fullName}</td>
                <td>{patient.dni ?? '—'}</td>
                <td>{patient.email ?? '—'}</td>
                <td>{patient.phone ?? '—'}</td>
                <td>
                  <button className="danger" onClick={() => void remove(patient.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {patients.length === 0 && <p className="muted">Sin pacientes.</p>}
      </div>
    </>
  );
}
