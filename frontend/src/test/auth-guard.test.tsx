import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ProtectedRoute } from '../components/AuthGuard/ProtectedRoute';
import { PublicOnlyRoute } from '../components/AuthGuard/PublicOnlyRoute';
import { VSE_STORAGE_KEYS } from '../api/client';

describe('Auth Guards', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects unauthenticated users to /login', async () => {
    render(
      <MemoryRouter initialEntries={['/supplier']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login Page</div>} />
            <Route
              path="/supplier"
              element={
                <ProtectedRoute allowedRoles={['supplier']}>
                  <div>Supplier Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Supplier Content')).not.toBeInTheDocument();
  });

  it('allows authenticated users with authorized role to view content', async () => {
    localStorage.setItem(VSE_STORAGE_KEYS.TOKEN, 'valid-token');
    localStorage.setItem(VSE_STORAGE_KEYS.ROLE, 'supplier');
    localStorage.setItem(VSE_STORAGE_KEYS.ORG_ID, 'org-id-123');
    localStorage.setItem(VSE_STORAGE_KEYS.LEGAL_NAME, 'Acme SME');

    render(
      <MemoryRouter initialEntries={['/supplier']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login Page</div>} />
            <Route
              path="/supplier"
              element={
                <ProtectedRoute allowedRoles={['supplier']}>
                  <div>Supplier Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Supplier Content')).toBeInTheDocument();
  });

  it('redirects authenticated users away from public-only routes (/login)', async () => {
    localStorage.setItem(VSE_STORAGE_KEYS.TOKEN, 'valid-token');
    localStorage.setItem(VSE_STORAGE_KEYS.ROLE, 'buyer');
    localStorage.setItem(VSE_STORAGE_KEYS.ORG_ID, 'buyer-org-123');
    localStorage.setItem(VSE_STORAGE_KEYS.LEGAL_NAME, 'Big Corp Buyer');

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <div>Public Login Page</div>
                </PublicOnlyRoute>
              }
            />
            <Route path="/buyer" element={<div>Buyer Dashboard</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Buyer Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Public Login Page')).not.toBeInTheDocument();
  });
});
