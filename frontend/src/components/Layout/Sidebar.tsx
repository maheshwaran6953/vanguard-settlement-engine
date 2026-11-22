import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  FilePlus2,
  CheckSquare, 
  LayoutDashboard, 
  ShieldAlert,
  Layers
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center space-x-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${
      isActive
        ? 'bg-emerald-600 text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-slate-200">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            V
          </div>
          <div>
            <div className="font-bold text-slate-900 text-base leading-tight">Vanguard</div>
            <div className="text-[11px] text-slate-500 font-medium tracking-wide">SETTLEMENT ENGINE</div>
          </div>
        </div>
      </div>

      <nav className="p-4 space-y-1.5 flex-1">
        {role === 'supplier' && (
          <>
            <NavLink to="/supplier" end className={linkClass}>
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </NavLink>
            <div className="pt-3 pb-1 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Financing
            </div>
            <NavLink to="/supplier/invoices/new" className={linkClass}>
              <FilePlus2 className="w-4 h-4" />
              <span>Submit Invoice</span>
            </NavLink>
          </>
        )}

        {role === 'buyer' && (
          <>
            <NavLink to="/buyer" end className={linkClass}>
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </NavLink>
            <div className="pt-3 pb-1 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Settlement
            </div>
            <NavLink to="/buyer" className={linkClass}>
              <CheckSquare className="w-4 h-4" />
              <span>Approvals & Invoices</span>
            </NavLink>
          </>
        )}

        {role === 'platform_admin' && (
          <>
            <NavLink to="/admin" end className={linkClass}>
              <LayoutDashboard className="w-4 h-4" />
              <span>Admin Console</span>
            </NavLink>
            <div className="pt-3 pb-1 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Resilience (M6)
            </div>
            <div className="flex items-center space-x-3 px-3 py-2 text-sm text-slate-400 cursor-not-allowed">
              <ShieldAlert className="w-4 h-4" />
              <span>Failed Jobs (DLQ)</span>
              <span className="ml-auto text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Soon</span>
            </div>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-slate-100">
        <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 flex items-start space-x-2">
          <Layers className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-slate-700">Clean Architecture</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Vanguard MVP v1.0.0</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
