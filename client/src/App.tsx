import { Navigate, Route, Routes } from 'react-router-dom';
import { hasToken } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Config from './pages/Config';
import Patients from './pages/Patients';
import Invoices from './pages/Invoices';
import TestInvoice from './pages/TestInvoice';

function Protected({ children }: { children: React.ReactNode }) {
  return hasToken() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/config" element={<Config />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/test" element={<TestInvoice />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
