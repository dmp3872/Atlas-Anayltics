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
import SubmissionList from './pages/submissions/SubmissionList';
import SubmissionNew from './pages/submissions/SubmissionNew';
import SubmissionDetail from './pages/submissions/SubmissionDetail';
import SubmissionConfirm from './pages/submissions/SubmissionConfirm';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminSubmissionDetail from './pages/admin/AdminSubmissionDetail';

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

          {/* Kyle submission workflow — client */}
          <Route path="/dashboard/submissions" element={<RoleRoute allow={['client', 'admin']}><SubmissionList /></RoleRoute>} />
          <Route path="/dashboard/submissions/new" element={<RoleRoute allow={['client', 'admin']}><SubmissionNew /></RoleRoute>} />
          <Route path="/dashboard/submissions/:id" element={<RoleRoute allow={['client', 'admin']}><SubmissionDetail /></RoleRoute>} />
          <Route path="/dashboard/submissions/:id/confirm" element={<RoleRoute allow={['client', 'admin']}><SubmissionConfirm /></RoleRoute>} />

          {/* Chemist lab console */}
          <Route path="/lab" element={<RoleRoute allow={['chemist', 'admin']}><Lab /></RoleRoute>} />

          {/* Verifier portal */}
          <Route path="/verify-portal" element={<RoleRoute allow={['verifier', 'admin']}><VerifyPortal /></RoleRoute>} />

          {/* Admin console + Kyle submission ops */}
          <Route path="/admin" element={<RoleRoute allow={['admin']}><Admin /></RoleRoute>} />
          <Route path="/admin/submissions" element={<RoleRoute allow={['admin', 'reviewer']}><AdminDashboard /></RoleRoute>} />
          <Route path="/admin/submissions/:id" element={<RoleRoute allow={['admin', 'reviewer']}><AdminSubmissionDetail /></RoleRoute>} />

          <Route path="/account" element={<Navigate to="/dashboard?tab=account" replace />} />
          <Route path="/support" element={<Support />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
