import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Pricing from './pages/Pricing';
import Order from './pages/Order';
import Dashboard from './pages/Dashboard';
import OrderHistory from './pages/OrderHistory';
import COALibrary from './pages/COALibrary';
import COADetail from './pages/COADetail';
import APIKeys from './pages/APIKeys';
import Account from './pages/Account';
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
          <Route path="/order" element={<PublicLayout><Order /></PublicLayout>} />
          <Route path="/verify" element={<PublicVerify />} />
          <Route path="/coa-library" element={<PublicLibrary />} />
          <Route path="/coa/:slug" element={<COADetail />} />
          <Route path="/trust" element={<Trust />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/orders" element={<OrderHistory />} />
          <Route path="/dashboard/coas" element={<COALibrary />} />
          <Route path="/dashboard/api" element={<APIKeys />} />
          <Route path="/account" element={<Account />} />
          <Route path="/support" element={<Support />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
