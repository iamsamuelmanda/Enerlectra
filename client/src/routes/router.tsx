import { Routes, Route, Outlet } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";

// Page Imports - Using @ Alias for clean resolution
import Dashboard from "@/pages/Dashboard";
import ClusterDetailPage from "@/pages/ClusterDetailPage"; 
import EnergyWalletPage from "@/pages/EnergyWalletPage";
import TradingPage from "@/pages/TradingPage";
import Admin from "@/pages/Admin";
import SignIn from "@/pages/SignIn";
import SignUp from "@/pages/SignUp";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import PilotDashboard from "@/features/admin/pages/PilotDashboard";
import TransactionsPage from "@/pages/TransactionsPage";

// Auth Guard
import ProtectedRoute from "@/components/ProtectedRoute";

export default function Router() {
  return (
    <Routes>
      {/* 1. PUBLIC ROUTES WITH GLOBAL LAYOUT */}
      <Route
        element={
          <MainLayout>
            <Outlet />
          </MainLayout>
        }
      >
        <Route path="/" element={<Dashboard />} />
        {/* Pointing the old ClusterView path to the new Detail Page */}
        <Route path="/clusters/:id" element={<ClusterDetailPage />} />
      </Route>

      {/* 2. PROTECTED ROUTES WITH GLOBAL LAYOUT */}
      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <MainLayout>
              <Outlet />
            </MainLayout>
          }
        >
          <Route path="/wallet" element={<EnergyWalletPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/trading" element={<TradingPage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/pilot" element={<PilotDashboard />} />
        </Route>
      </Route>

      {/* 3. AUTH ROUTES (NO SIDEBAR/HEADER) */}
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  );
}
