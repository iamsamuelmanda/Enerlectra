import { Navigate, Route, Routes } from 'react-router-dom';
import V2Home from '@/pages/V2Home';
import V2Onboarding from '@/pages/V2Onboarding';
import V2SignIn, { V2AuthGate } from '@/pages/V2SignIn';
import V2Workspace from '@/pages/V2Workspace';

export default function Router() {
  return (
    <Routes>
      <Route path="/" element={<V2Home />} />
      <Route path="/signin" element={<V2SignIn />} />
      <Route path="/onboarding" element={<V2AuthGate><V2Onboarding /></V2AuthGate>} />
      <Route path="/workspace" element={<V2AuthGate><V2Workspace /></V2AuthGate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
