import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, Server, Activity } from 'lucide-react';

export const PlatformAdminDashboard: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-700 to-indigo-800 rounded-2xl p-6 text-white shadow-md">
        <h1 className="text-2xl font-bold">Platform Admin Console — {user?.legalName}</h1>
        <p className="mt-1 text-purple-200 text-sm">
          Platform Operations • Dead-letter queue monitoring, job retry operations, and background worker telemetry.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Failed Jobs (DLQ)</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">Ready for M6</p>
            <p className="text-xs text-slate-500 mt-1">Retry and discard dead-letter jobs</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-slate-50 text-slate-600 rounded-lg">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Queue Health</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">Ready for M6</p>
            <p className="text-xs text-slate-500 mt-1">Notification & document workers</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex items-center space-x-2 text-slate-700 mb-2">
          <Activity className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-slate-800">Module M3 Platform Guard Enforced</h2>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          Admin authentication and restricted routing are enforced. The full Dead-Letter Queue management interface with
          30-second polling and retry actions will be delivered in Module M6.
        </p>
      </div>
    </div>
  );
};
