import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Pricing from './pages/Pricing';
import Order from './pages/Order';
import Portal from './pages/Portal';
import OrderWizard from './pages/OrderWizard';
import OrderHistory from './pages/OrderHistory';
import COALibrary from './pages/COALibrary';
import COADetail from './pages/COADetail';
import SampleCOA from './pages/SampleCOA';
import APIKeys from './pages/APIKeys';
import Support from './pages/Support';
import PublicVerify from './pages/PublicVerify';
import PublicLibrary from './pages/PublicLibrary';
import Trust from './pages/Trust';
import Roadmap from './pages/Roadmap';

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
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
          <Route path="/dashboard" element={<Portal />} />
          <Route path="/dashboard/orders" element={<Portal />} />
          <Route path="/dashboard/coas" element={<Portal />} />
          <Route path="/dashboard/api" element={<APIKeys />} />
          <Route path="/account" element={<Navigate to="/dashboard?tab=account" replace />} />
          <Route path="/support" element={<Support />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
