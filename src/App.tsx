import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserRole } from './lib/types';
import { roleHome, resolveUserRole } from './lib/roles';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Pricing from './pages/Pricing';
import Order from './pages/Order';
import Portal from './pages/Portal';
import OrderWizard from './pages/OrderWizard';
import COADetail from './pages/COADetail';
import EmbeddedCOA from './pages/EmbeddedCOA';
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
import AdminOrderDetail from './pages/admin/AdminOrderDetail';

function PublicLayout({ children }: { children: React.ReactNode }) {
  const [params] = useSearchParams();
  // COA PDF/export iframes must not paint site chrome.
  const hideChrome = params.get('export') === '1' || params.get('print') === '1';
  if (hideChrome) return <>{children}</>;
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

function RoleRoute({ allow, children }: { allow: UserRole[]; children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/auth" replace state={{ from: window.location.pathname }} />;
  const role = resolveUserRole(profile, user.email);
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
          <Route path="/verify" element={<PublicLayout><PublicVerify /></PublicLayout>} />
          <Route path="/coa-library" element={<PublicLayout><PublicLibrary /></PublicLayout>} />
          <Route path="/coa/:slug" element={<PublicLayout><COADetail /></PublicLayout>} />
          <Route path="/embed/coa/:slug" element={<EmbeddedCOA />} />
          <Route path="/sample/:sampleId/coa" element={<PublicLayout><SampleCOA /></PublicLayout>} />
          <Route path="/trust" element={<PublicLayout><Trust /></PublicLayout>} />
          <Route path="/roadmap" element={<PublicLayout><Roadmap /></PublicLayout>} />

          {/* Client portal */}
          <Route path="/dashboard" element={<RoleRoute allow={['client', 'admin']}><Portal /></RoleRoute>} />
          <Route path="/dashboard/orders" element={<RoleRoute allow={['client', 'admin']}><Portal /></RoleRoute>} />
          <Route path="/dashboard/coas" element={<RoleRoute allow={['client', 'admin']}><Portal /></RoleRoute>} />
          <Route path="/dashboard/api" element={<RoleRoute allow={['client', 'admin']}><APIKeys /></RoleRoute>} />
          <Route path="/support" element={<RoleRoute allow={['client', 'admin']}><Support /></RoleRoute>} />

          {/* Kyle submission workflow — client (superseded by unified orders) */}
          <Route path="/dashboard/submissions/*" element={<Navigate to="/dashboard/orders" replace />} />

          {/* Chemist lab console */}
          <Route path="/lab" element={<RoleRoute allow={['chemist', 'admin']}><Lab /></RoleRoute>} />

          {/* Verifier portal */}
          <Route path="/verify-portal" element={<RoleRoute allow={['verifier', 'admin']}><VerifyPortal /></RoleRoute>} />

          {/* Admin console */}
          <Route path="/admin" element={<RoleRoute allow={['admin']}><Admin /></RoleRoute>} />
          <Route path="/admin/orders/:id" element={<RoleRoute allow={['admin']}><AdminOrderDetail /></RoleRoute>} />

          {/* Kyle submission ops — superseded by unified orders */}
          <Route path="/admin/submissions" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/submissions/:id" element={<Navigate to="/admin" replace />} />

          <Route path="/account" element={<Navigate to="/dashboard?tab=account" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
