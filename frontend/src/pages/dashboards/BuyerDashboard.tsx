import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { CheckSquare, CreditCard, ShieldCheck } from 'lucide-react';

export const BuyerDashboard: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-sky-600 to-indigo-700 rounded-2xl p-6 text-white shadow-md">
        <h1 className="text-2xl font-bold">Buyer Portal — {user?.legalName}</h1>
        <p className="mt-1 text-sky-100 text-sm">
          Corporate Buyer Console • Digitally approve supplier invoices and settle payments via designated Virtual Accounts.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-sky-50 text-sky-600 rounded-lg">
            <CheckSquare className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Approvals</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">Ready for M5</p>
            <p className="text-xs text-slate-500 mt-1">Digital approval workflow</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Virtual Accounts (VAN)</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">Ready for M5</p>
            <p className="text-xs text-slate-500 mt-1">Bank payment reconciliation</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex items-center space-x-2 text-slate-700 mb-2">
          <ShieldCheck className="w-5 h-5 text-sky-600" />
          <h2 className="text-lg font-semibold text-slate-800">Module M3 Buyer Integration Ready</h2>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          Buyer authentication, role scoping, and session termination are verified. Detailed invoice approval actions and
          VAN settlement progress tracking will be activated in Module M5.
        </p>
      </div>
    </div>
  );
};
