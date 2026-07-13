import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, saveToken } from '../api';

export default function Login() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    cuit: '',
  });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [field]: e.target.value });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const path = isRegister ? '/auth/register' : '/auth/login';
      const body = isRegister
        ? form
        : { email: form.email, password: form.password };
      const { token } = await api<{ token: string }>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      saveToken(token);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="card login-card">
        <h1>Facturalá</h1>
        <form onSubmit={submit}>
          {isRegister && (
            <>
              <label>
                Nombre completo
                <input value={form.fullName} onChange={set('fullName')} required minLength={2} />
              </label>
              <label>
                CUIT (11 dígitos, sin guiones)
                <input value={form.cuit} onChange={set('cuit')} required pattern="\d{11}" />
              </label>
            </>
          )}
          <label>
            Email
            <input type="email" value={form.email} onChange={set('email')} required />
          </label>
          <label>
            Contraseña
            <input type="password" value={form.password} onChange={set('password')} required minLength={8} />
          </label>
          {error && <div className="error">{error}</div>}
          <button disabled={loading}>
            {isRegister ? 'Crear cuenta' : 'Ingresar'}
          </button>
          <button
            type="button"
            className="login-toggle"
            onClick={() => setIsRegister(!isRegister)}
          >
            {isRegister ? 'Ya tengo cuenta' : 'No tengo cuenta, registrarme'}
          </button>
        </form>
      </div>
    </div>
  );
}
