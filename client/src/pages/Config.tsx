import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';

interface Profile {
  email: string;
  fullName: string;
  cuit: string;
  puntoVenta: number | null;
  invoiceType: 'B' | 'C';
  afipEnv: 'testing' | 'prod';
  whatsappNumber: string | null;
}

export default function Config() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);

  useEffect(() => {
    api<Profile>('/professionals/me').then(setProfile).catch((e: Error) => setError(e.message));
  }, []);

  if (!profile) return <p className="muted">Cargando…</p>;

  function flash(setter: (v: string) => void, msg: string) {
    setter(msg);
    setTimeout(() => setter(''), 4000);
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError('');
    try {
      const updated = await api<Profile>('/professionals/me', {
        method: 'PATCH',
        body: JSON.stringify({
          whatsappNumber: profile.whatsappNumber || undefined,
          invoiceType: profile.invoiceType,
          afipEnv: profile.afipEnv,
        }),
      });
      setProfile(updated);
      flash(setMessage, 'Perfil actualizado ✔');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function uploadAfip(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError('');
    if (!certFile || !keyFile) {
      setError('Seleccioná los dos archivos (.crt y .key)');
      return;
    }
    const form = new FormData();
    form.append('cert', certFile);
    form.append('key', keyFile);
    form.append('puntoVenta', String(profile.puntoVenta ?? 1));
    form.append('invoiceType', profile.invoiceType);
    form.append('afipEnv', profile.afipEnv);
    try {
      const updated = await api<Profile>('/professionals/me/afip-config', {
        method: 'POST',
        body: form,
      });
      setProfile(updated);
      flash(setMessage, 'Certificados AFIP guardados (cifrados) ✔');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1>Configuración</h1>
      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h1>Perfil</h1>
        <form onSubmit={saveProfile}>
          <div className="row">
            <label>
              Email
              <input value={profile.email} disabled />
            </label>
            <label>
              CUIT
              <input value={profile.cuit} disabled />
            </label>
          </div>
          <label>
            Número de WhatsApp (con código de país)
            <input
              placeholder="+5491112345678"
              value={profile.whatsappNumber ?? ''}
              onChange={(e) => setProfile({ ...profile, whatsappNumber: e.target.value })}
            />
          </label>
          <div className="row">
            <label>
              Tipo de factura
              <select
                value={profile.invoiceType}
                onChange={(e) =>
                  setProfile({ ...profile, invoiceType: e.target.value as 'B' | 'C' })
                }
              >
                <option value="B">Factura B</option>
                <option value="C">Factura C</option>
              </select>
            </label>
            <label>
              Entorno AFIP
              <select
                value={profile.afipEnv}
                onChange={(e) =>
                  setProfile({ ...profile, afipEnv: e.target.value as 'testing' | 'prod' })
                }
              >
                <option value="testing">Homologación (pruebas)</option>
                <option value="prod">Producción</option>
              </select>
            </label>
          </div>
          <button>Guardar perfil</button>
        </form>
      </div>

      <div className="card">
        <h1>Certificados AFIP</h1>
        <p className="muted">
          Se guardan cifrados (AES-256-GCM). Necesitás el certificado (.crt) y la clave
          privada (.key) generados en el portal de AFIP.
        </p>
        <form onSubmit={uploadAfip}>
          <div className="row">
            <label>
              Certificado (.crt)
              <input type="file" onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} />
            </label>
            <label>
              Clave privada (.key)
              <input type="file" onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <label>
            Punto de venta
            <input
              type="number"
              min={1}
              value={profile.puntoVenta ?? ''}
              onChange={(e) =>
                setProfile({ ...profile, puntoVenta: Number(e.target.value) || null })
              }
            />
          </label>
          <button>Subir certificados</button>
        </form>
      </div>
    </>
  );
}
