import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearToken } from '../api';

const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/patients', label: 'Pacientes' },
  { to: '/invoices', label: 'Facturas' },
  { to: '/config', label: 'Configuración' },
  { to: '/test', label: 'Factura de prueba' },
];

export default function Layout() {
  const navigate = useNavigate();

  function logout() {
    clearToken();
    navigate('/login');
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Facturalá</div>
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {link.label}
          </NavLink>
        ))}
        <button className="logout" onClick={logout}>
          Cerrar sesión
        </button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
