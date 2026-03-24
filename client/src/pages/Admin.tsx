import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';

export default function Admin() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-8">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  // In a real app, check if user has admin role

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2 text-white">Admin Panel</h1>
      <p className="text-purple-200 mb-6">Manage communities and view system health.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <button className="btn-primary w-full mb-2">Create New Community</button>
          <button className="btn-primary w-full">Trigger Settlement</button>
        </div>
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">System Status</h2>
          <p className="text-sm text-purple-200">All systems operational</p>
        </div>
      </div>
    </div>
  );
}
