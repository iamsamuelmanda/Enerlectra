import { Navigate, Route, Routes } from 'react-router-dom';
import Home from '@/pages/Home';
import Onboarding from '@/pages/Onboarding';
import SignIn, { V2AuthGate } from '@/pages/SignIn';
import Workspace from '@/pages/Workspace';

export default function Router() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/onboarding" element={<V2AuthGate><Onboarding /></V2AuthGate>} />
      <Route path="/workspace" element={<V2AuthGate><Workspace /></V2AuthGate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
