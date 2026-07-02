import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserRole } from './lib/types';
import { roleHome, effectiveRole } from './lib/roles';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Pricing from './pages/Pricing';
import Order from './pages/Order';
import Portal from './pages/Portal';
import OrderWizard from './pages/OrderWizard';
import COADetail from './pages/COADetail';
import SampleCOA from './pages/SampleCOA';
import APIKeys from './pages/APIKeys';
import Support from './pages/Support';
import PublicVerify from './pages/PublicVerify';
import PublicLibrary from './pages/PublicLibrary';
import Trust from './pages/Trust';
import Roadmap from './pages/Roadmap';
import Lab from './pages/Lab';
import Admin from './pages/Admin';
import VerifyPortal from './pages/VerifyPortal';

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Gate a route by role. Redirects unauthenticated users to /auth and
// authenticated users lacking the required role to their own home.
function RoleRoute({ allow, children }: { allow: UserRole[]; children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/auth" replace state={{ from: window.location.pathname }} />;
  const role = effectiveRole(profile);
  if (!allow.includes(role)) return <Navigate to={roleHome(role)} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<PublicLayout><Landing /></PublicLayout>} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/pricing" element={<PublicLayout><Pricing /></PublicLayout>} />
          <Route path="/order-new" element={<OrderWizard />} />
          <Route path="/order" element={<PublicLayout><Order /></PublicLayout>} />
          <Route path="/verify" element={<PublicVerify />} />
          <Route path="/coa-library" element={<PublicLibrary />} />
          <Route path="/coa/:slug" element={<COADetail />} />
          <Route path="/sample/:sampleId/coa" element={<SampleCOA />} />
          <Route path="/trust" element={<Trust />} />
          <Route path="/roadmap" element={<Roadmap />} />

          {/* Client portal */}
          <Route path="/dashboard" element={<RoleRoute allow={['client', 'admin']}><Portal /></RoleRoute>} />
          <Route path="/dashboard/orders" element={<RoleRoute allow={['client', 'admin']}><Portal /></RoleRoute>} />
          <Route path="/dashboard/coas" element={<RoleRoute allow={['client', 'admin']}><Portal /></RoleRoute>} />
          <Route path="/dashboard/api" element={<RoleRoute allow={['client', 'admin']}><APIKeys /></RoleRoute>} />

          {/* Chemist COA input */}
          <Route path="/lab" element={<RoleRoute allow={['chemist', 'admin']}><Lab /></RoleRoute>} />

          {/* Verifier read-only portal */}
          <Route path="/verify-portal" element={<RoleRoute allow={['verifier', 'admin']}><VerifyPortal /></RoleRoute>} />

          {/* Admin console */}
          <Route path="/admin" element={<RoleRoute allow={['admin']}><Admin /></RoleRoute>} />

          <Route path="/account" element={<Navigate to="/dashboard?tab=account" replace />} />
          <Route path="/support" element={<Support />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
