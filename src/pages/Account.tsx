import { Navigate } from 'react-router-dom';

export default function Account() {
  return <Navigate to="/dashboard?tab=account" replace />;
}
