import { Routes, Route } from "react-router-dom";
import Dashboard        from "../pages/Dashboard";
import ClusterView      from "../pages/ClusterView";
import EnergyWalletPage from "../pages/EnergyWalletPage";
import TradingPage      from "../pages/TradingPage";
import Admin            from "../pages/Admin";
import SignIn           from "../pages/SignIn";
import SignUp           from "../pages/SignUp";
import ForgotPassword   from "../pages/ForgotPassword";
import ResetPassword    from "../pages/ResetPassword";
import PilotDashboard   from "../features/admin/pages/PilotDashboard";

export default function Router() {
  return (
    <Routes>
      <Route path="/"                element={<Dashboard />} />
      <Route path="/clusters/:id"    element={<ClusterView />} />
      <Route path="/wallet"          element={<EnergyWalletPage />} />
      <Route path="/trading"         element={<TradingPage />} />
      <Route path="/admin"           element={<Admin />} />
      <Route path="/admin/pilot"     element={<PilotDashboard />} />
      <Route path="/signin"          element={<SignIn />} />
      <Route path="/signup"          element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password"  element={<ResetPassword />} />
    </Routes>
  );
}