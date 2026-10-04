import { Navigate, Route, Routes } from 'react-router-dom';
import V2Home from '@/pages/V2Home';

export default function Router() {
  return (
    <Routes>
      <Route path="/" element={<V2Home />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
