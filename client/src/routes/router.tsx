import { Navigate, Route, Routes } from 'react-router-dom';
import V2Home from '@/pages/V2Home';
import V2Onboarding from '@/pages/V2Onboarding';
import EnerlectraSignIn, { AuthGate } from '@/pages/EnerlectraSignIn';
import V2Workspace from '@/pages/V2Workspace';

export default function Router() {
  return (
    <Routes>
      <Route path="/" element={<V2Home />} />
      <Route path="/signin" element={<EnerlectraSignIn />} />
      <Route path="/onboarding" element={<AuthGate><V2Onboarding /></AuthGate>} />
      <Route path="/workspace" element={<AuthGate><V2Workspace /></AuthGate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
