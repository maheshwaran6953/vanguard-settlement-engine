import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { Invoice } from '../../api/types';
import { ApiClientError } from '../../api/errors';
import { formatPaiseToInr } from '../../utils/currency';
import { InvoiceTable } from '../../components/invoices/InvoiceTable';
import { 
  FileText, 
  IndianRupee, 
  Clock, 
  Activity, 
  PlusCircle, 
  Info, 
  AlertCircle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

export interface SummaryMetrics {
  totalInvoices: number;
  totalFinancedPaise: bigint;
  awaitingApproval: number;
  activeAccounts: number;
}

export function computeSummaryMetrics(invoices: Invoice[]): SummaryMetrics {
  let totalInvoices = 0;
  let totalFinancedPaise = 0n;
  let awaitingApproval = 0;
  let activeAccounts = 0;

  for (const inv of invoices) {
    totalInvoices += 1;

    // Sum amount_cents with BigInt on the string value for FUNDED or REPAID
    if (inv.status === 'FUNDED' || inv.status === 'REPAID') {
      try {
        totalFinancedPaise += BigInt(inv.amount_cents);
      } catch {
        // Fallback if string conversion fails
        totalFinancedPaise += BigInt(Math.round(Number(inv.amount_cents) || 0));
      }
    }

    if (inv.status === 'SUBMITTED') {
      awaitingApproval += 1;
    }

    if (inv.status === 'FUNDED') {
      activeAccounts += 1;
    }
  }

  return {
    totalInvoices,
    totalFinancedPaise,
    awaitingApproval,
    activeAccounts,
  };
}

export const SupplierDashboard: React.FC = () => {
  const { user } = useAuth();

  // Invoices for table
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filters & Pagination
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [limit] = useState<number>(20);
  const [offset, setOffset] = useState<number>(0);

  // Overall summary invoices (to keep 4 cards accurate across status filter changes)
  const [summaryInvoices, setSummaryInvoices] = useState<Invoice[]>([]);

  // Request Financing state
  const [pendingFinancingId, setPendingFinancingId] = useState<string | null>(null);

  // Fetch summary invoices once or on manual refresh
  const loadSummaryData = useCallback(async () => {
    try {
      const all = await apiClient.get<Invoice[]>('/invoices?limit=100');
      setSummaryInvoices(all || []);
    } catch {
      // Non-fatal if summary fails, table will handle main error
    }
  }, []);

  // Fetch table data based on current status and pagination
  const loadTableData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let query = `?limit=${limit}&offset=${offset}`;
      if (selectedStatus) {
        query += `&status=${encodeURIComponent(selectedStatus)}`;
      }
      const data = await apiClient.get<Invoice[]>(`/invoices${query}`);
      setInvoices(data || []);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to fetch invoices. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [limit, offset, selectedStatus]);

  useEffect(() => {
    loadSummaryData();
  }, [loadSummaryData]);

  useEffect(() => {
    loadTableData();
  }, [loadTableData]);

  const handleStatusChange = (newStatus: string) => {
    setSelectedStatus(newStatus);
    setOffset(0); // Reset to first page
  };

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
  };

  const handleRequestFinancing = async (invoiceId: string) => {
    setPendingFinancingId(invoiceId);
    setFeedback(null);
    try {
      const updated = await apiClient.post<Invoice>(`/invoices/${invoiceId}/request-financing`);

      // Update table state
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: updated.status } : inv))
      );

      // Update summary state
      setSummaryInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: updated.status } : inv))
      );

      setFeedback({
        type: 'success',
        message: `Financing requested successfully for invoice ${updated.invoice_number}!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to request financing';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setPendingFinancingId(null);
    }
  };

  // Derive metrics using BigInt math
  const metrics = computeSummaryMetrics(summaryInvoices);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-block text-[11px] font-semibold tracking-wider uppercase bg-emerald-500/40 px-2.5 py-0.5 rounded-full mb-2">
            Supplier Portal
          </span>
          <h1 className="text-2xl font-bold">Welcome back, {user?.legalName}!</h1>
          <p className="mt-1 text-emerald-100 text-xs sm:text-sm max-w-xl">
            Submit commercial invoices, initiate financing advances on buyer approval, and track automated settlement reconciliations.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => {
              loadSummaryData();
              loadTableData();
            }}
            title="Refresh dashboard data"
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/supplier/invoices/new"
            className="inline-flex items-center space-x-2 bg-white text-emerald-700 hover:bg-emerald-50 px-4 py-2.5 rounded-xl font-semibold text-xs shadow-sm transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Submit Invoice</span>
          </Link>
        </div>
      </div>

      {/* Global Alerts / Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-sm flex items-start space-x-3 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs">
            <span className="font-semibold">{feedback.type === 'success' ? 'Success: ' : 'Error: '}</span>
            {feedback.message}
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Four Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Invoices */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start justify-between"
          data-testid="card-total-invoices"
        >
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Invoices</p>
            <p className="text-2xl font-bold text-slate-900 mt-1" data-testid="metric-total-invoices">
              {metrics.totalInvoices}
            </p>
            <p className="text-xs text-slate-500 mt-1">Submitted in portal</p>
          </div>
          <div className="p-3 bg-slate-50 text-slate-600 rounded-lg">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Total Financed */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start justify-between"
          data-testid="card-total-financed"
        >
          <div>
            <div className="flex items-center space-x-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Financed</p>
              <span
                title="Includes invoices now FUNDED and invoices already REPAID."
                className="cursor-help text-slate-400 hover:text-slate-600"
                data-testid="tooltip-financed"
              >
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1" data-testid="metric-total-financed">
              {formatPaiseToInr(metrics.totalFinancedPaise.toString())}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">FUNDED + REPAID invoices</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <IndianRupee className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Awaiting Approval */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start justify-between"
          data-testid="card-awaiting-approval"
        >
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Awaiting Approval</p>
            <p className="text-2xl font-bold text-amber-600 mt-1" data-testid="metric-awaiting-approval">
              {metrics.awaitingApproval}
            </p>
            <p className="text-xs text-slate-500 mt-1">Status: SUBMITTED</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Active Accounts */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start justify-between"
          data-testid="card-active-accounts"
        >
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Accounts</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1" data-testid="metric-active-accounts">
              {metrics.activeAccounts}
            </p>
            <p className="text-xs text-slate-500 mt-1">Status: FUNDED</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <Activity className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Invoice Table with Filters and Pagination */}
      <InvoiceTable
        invoices={invoices}
        loading={loading}
        selectedStatus={selectedStatus}
        onStatusChange={handleStatusChange}
        limit={limit}
        offset={offset}
        onPageChange={handlePageChange}
        onRequestFinancing={handleRequestFinancing}
        pendingFinancingId={pendingFinancingId}
      />
    </div>
  );
};
