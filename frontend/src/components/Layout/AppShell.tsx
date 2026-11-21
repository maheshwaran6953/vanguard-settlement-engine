import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sidebar } from './Sidebar';
import { LogOut, Building2 } from 'lucide-react';

export const AppShell: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'supplier':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'buyer':
        return 'bg-sky-100 text-sky-800 border-sky-200';
      case 'platform_admin':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div className="flex items-center space-x-3 truncate">
            <Building2 className="w-5 h-5 text-slate-500 shrink-0" />
            <span className="font-semibold text-slate-800 truncate" title={user?.legalName}>
              {user?.legalName || 'Vanguard Portal'}
            </span>
            <span
              className={`text-xs font-medium px-2.5 py-0.5 rounded-full border capitalize shrink-0 ${getRoleBadge(
                user?.role,
              )}`}
            >
              {user?.role?.replace('_', ' ') || 'User'}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="inline-flex items-center space-x-2 text-sm text-slate-600 hover:text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors font-medium border border-transparent hover:border-rose-100"
            title="Sign out of your account"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
