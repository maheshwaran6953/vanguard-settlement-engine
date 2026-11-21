import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { FilePlus2, DollarSign, Clock, ShieldCheck } from 'lucide-react';

export const SupplierDashboard: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-md">
        <h1 className="text-2xl font-bold">Welcome back, {user?.legalName}!</h1>
        <p className="mt-1 text-emerald-100 text-sm">
          SME Supplier Portal • Submit invoices, request capital advances, and monitor real-time settlements.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <FilePlus2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Invoices</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">Ready for M4</p>
            <p className="text-xs text-slate-500 mt-1">Invoice submission & lifecycle view</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-sky-50 text-sky-600 rounded-lg">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Financing Status</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">Ready for M4</p>
            <p className="text-xs text-slate-500 mt-1">Three-way match & anomaly checks</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Settlements</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">Ready for M4</p>
            <p className="text-xs text-slate-500 mt-1">Virtual Account payment updates</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex items-center space-x-2 text-slate-700 mb-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-800">Module M3 Frontend Foundation Complete</h2>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          The frontend foundation is successfully running with authenticated session management, strict role-based route
          guards, and API error code mapping. The Invoice Management & Submission interface will be implemented in Module
          M4.
        </p>
      </div>
    </div>
  );
};
