import { Navigate, Route, Routes } from 'react-router-dom';
import Home from '@/pages/Home';
import Onboarding from '@/pages/Onboarding';
import SignIn, { AuthGate } from '@/pages/SignIn';
import Workspace from '@/pages/Workspace';

export default function Router() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/onboarding" element={<AuthGate><Onboarding /></AuthGate>} />
      <Route path="/workspace" element={<AuthGate><Workspace /></AuthGate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
