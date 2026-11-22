import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { Invoice } from '../../api/types';
import { ApiClientError } from '../../api/errors';
import { formatPaiseToInr } from '../../utils/currency';
import { StatusBadge } from '../../components/invoices/StatusBadge';
import {
  Clock,
  CheckCircle,
  IndianRupee,
  CreditCard,
  Info,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckSquare,
} from 'lucide-react';

export interface BuyerSummaryMetrics {
  awaitingApproval: number;
  approved: number;
  totalApprovedValuePaise: bigint;
  totalPaidPaise: bigint;
}

export function computeBuyerSummaryMetrics(invoices: Invoice[]): BuyerSummaryMetrics {
  let awaitingApproval = 0;
  let approved = 0;
  let totalApprovedValuePaise = 0n;
  let totalPaidPaise = 0n;

  for (const inv of invoices) {
    if (inv.status === 'SUBMITTED') {
      awaitingApproval += 1;
    }
    if (inv.status === 'BUYER_APPROVED') {
      approved += 1;
    }

    // Total Approved Value: sum of amount_cents for BUYER_APPROVED, FINANCING_REQUESTED, FUNDED and REPAID
    if (
      inv.status === 'BUYER_APPROVED' ||
      inv.status === 'FINANCING_REQUESTED' ||
      inv.status === 'FUNDED' ||
      inv.status === 'REPAID'
    ) {
      try {
        totalApprovedValuePaise += BigInt(inv.amount_cents);
      } catch {
        totalApprovedValuePaise += BigInt(Math.round(Number(inv.amount_cents) || 0));
      }
    }

    // Total Paid: sum of amount_cents for REPAID invoices only
    if (inv.status === 'REPAID') {
      try {
        totalPaidPaise += BigInt(inv.amount_cents);
      } catch {
        totalPaidPaise += BigInt(Math.round(Number(inv.amount_cents) || 0));
      }
    }
  }

  return {
    awaitingApproval,
    approved,
    totalApprovedValuePaise,
    totalPaidPaise,
  };
}

export const BuyerDashboard: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tab filter: 'ALL' | 'SUBMITTED' | 'BUYER_APPROVED' | 'REPAID'
  const [activeTab, setActiveTab] = useState<string>('ALL');

  // Pagination
  const [offset, setOffset] = useState<number>(0);
  const limit = 10;

  // Flash message passed via navigation state (e.g. from ApproveInvoicePage)
  const [flashMessage, setFlashMessage] = useState<string | null>(
    (location.state as { message?: string })?.message || null
  );

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Backend /invoices scopes automatically to caller's role (buyer)
      const queryStatus = activeTab === 'ALL' ? '' : `&status=${activeTab}`;
      const res = await apiClient.get<Invoice[]>(`/invoices?limit=${limit}&offset=${offset}${queryStatus}`);
      setInvoices(res || []);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.readableMessage);
      } else {
        setError('Failed to load buyer invoices. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, offset, limit]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Compute live summary metrics across loaded invoices
  const metrics = computeBuyerSummaryMetrics(invoices);

  const canGoPrev = offset > 0;
  const canGoNext = invoices.length === limit;

  const formatDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-sky-700 via-indigo-700 to-slate-900 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-sky-200 text-xs font-semibold uppercase tracking-wider">
            <span>Enterprise Buyer Console</span>
            <span>&bull;</span>
            <span>Vanguard Engine</span>
          </div>
          <h1 className="text-2xl font-bold mt-1 tracking-tight">
            Welcome back, {user?.legalName}
          </h1>
          <p className="mt-1 text-sky-100/80 text-xs max-w-xl leading-relaxed">
            Inspect supplier invoices, authorize digital approval signatures, and track payments settled through Virtual Accounts.
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={fetchInvoices}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-sm border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {flashMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-4 rounded-xl shadow-sm flex items-center justify-between">
          <span className="font-medium">{flashMessage}</span>
          <button onClick={() => setFlashMessage(null)} className="text-emerald-700 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-4 rounded-xl shadow-sm flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Awaiting Approval */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Awaiting Approval
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {metrics.awaitingApproval}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Invoices requiring digital signature</p>
          </div>
        </div>

        {/* Card 2: Approved */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Approved
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {metrics.approved}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Digitally signed & verified</p>
          </div>
        </div>

        {/* Card 3: Total Approved Value */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
            <IndianRupee className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-1.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Approved Value
              </p>
              <div
                className="group relative cursor-help text-slate-400 hover:text-slate-600"
                title="Includes invoices in BUYER_APPROVED, FINANCING_REQUESTED, FUNDED, and REPAID statuses."
              >
                <Info className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {formatPaiseToInr(metrics.totalApprovedValuePaise)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate" title="Includes invoices in BUYER_APPROVED, FINANCING_REQUESTED, FUNDED, and REPAID statuses.">
              Includes BUYER_APPROVED to REPAID
            </p>
          </div>
        </div>

        {/* Card 4: Total Paid */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-sky-50 text-sky-600 rounded-lg shrink-0">
            <CreditCard className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-1.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Paid
              </p>
              <div
                className="group relative cursor-help text-slate-400 hover:text-slate-600"
                title="Includes REPAID invoices only. Does not include partial payments or over-payments."
              >
                <Info className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {formatPaiseToInr(metrics.totalPaidPaise)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate" title="Includes REPAID invoices only. Does not include partial payments or over-payments.">
              REPAID invoices only
            </p>
          </div>
        </div>
      </div>

      {/* Invoices List Card with Filter Tabs */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Header with Tabs */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-900 text-base">Invoices Awaiting Review & Settlement</h3>
            <p className="text-xs text-slate-500 mt-0.5">Filter by status or review details</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'SUBMITTED', label: 'Awaiting Approval' },
              { id: 'BUYER_APPROVED', label: 'Approved' },
              { id: 'REPAID', label: 'Settled' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setOffset(0);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Invoice #</th>
                <th scope="col" className="px-5 py-3 font-semibold">Supplier ID</th>
                <th scope="col" className="px-5 py-3 font-semibold">Due Date</th>
                <th scope="col" className="px-5 py-3 font-semibold text-right">Amount</th>
                <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                <th scope="col" className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center space-x-2">
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                      <span className="text-xs font-medium">Loading buyer invoices...</span>
                    </div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                    <p className="text-sm font-semibold text-slate-700">No invoices found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {activeTab === 'ALL'
                        ? 'No invoices have been issued to your organisation yet.'
                        : `No invoices currently match the "${activeTab}" filter.`}
                    </p>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const isSubmitted = inv.status === 'SUBMITTED';

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-bold font-mono text-slate-900">
                        {inv.invoice_number}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-600 max-w-[140px] truncate" title={inv.supplier_id}>
                        {inv.supplier_id}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatPaiseToInr(inv.amount_cents)}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-2">
                          {isSubmitted && (
                            <Link
                              to={`/buyer/invoices/${inv.id}/approve`}
                              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                              <span>Review & Approve</span>
                            </Link>
                          )}
                          <Link
                            to={`/invoices/${inv.id}`}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Details</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50/30">
          <div>
            Showing records <span className="font-semibold text-slate-700">{offset + 1}</span> to{' '}
            <span className="font-semibold text-slate-700">{offset + invoices.length}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={!canGoPrev || loading}
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              onClick={() => setOffset(offset + limit)}
              disabled={!canGoNext || loading}
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
