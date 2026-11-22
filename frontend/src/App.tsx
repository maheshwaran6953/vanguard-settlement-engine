import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/AuthGuard/ProtectedRoute';
import { PublicOnlyRoute } from './components/AuthGuard/PublicOnlyRoute';
import { AppShell } from './components/Layout/AppShell';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { SupplierDashboard } from './pages/dashboards/SupplierDashboard';
import { SubmitInvoicePage } from './pages/supplier/SubmitInvoicePage';
import { BuyerDashboard } from './pages/dashboards/BuyerDashboard';
import { PlatformAdminDashboard } from './pages/dashboards/PlatformAdminDashboard';
import { ApproveInvoicePage } from './pages/ApproveInvoicePage';
import { InvoiceDetailPage } from './pages/InvoiceDetailPage';

const RoleBasedRedirect: React.FC = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'buyer') return <Navigate to="/buyer" replace />;
  if (user.role === 'platform_admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/supplier" replace />;
};

export default function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Auth Routes */}
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <Login />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnlyRoute>
                <Register />
              </PublicOnlyRoute>
            }
          />

          {/* Authenticated Application Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<RoleBasedRedirect />} />
            <Route
              path="supplier"
              element={
                <ProtectedRoute allowedRoles={['supplier']}>
                  <SupplierDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="supplier/invoices/new"
              element={
                <ProtectedRoute allowedRoles={['supplier']}>
                  <SubmitInvoicePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="buyer"
              element={
                <ProtectedRoute allowedRoles={['buyer']}>
                  <BuyerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="buyer/invoices/:id/approve"
              element={
                <ProtectedRoute allowedRoles={['buyer']}>
                  <ApproveInvoicePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="invoices/:id"
              element={
                <ProtectedRoute allowedRoles={['supplier', 'buyer', 'platform_admin']}>
                  <InvoiceDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin"
              element={
                <ProtectedRoute allowedRoles={['platform_admin']}>
                  <PlatformAdminDashboard />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
