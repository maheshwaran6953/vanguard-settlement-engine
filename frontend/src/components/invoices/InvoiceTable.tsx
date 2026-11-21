import React from 'react';
import { Invoice } from '../../api/types';
import { StatusBadge } from './StatusBadge';
import { formatPaiseToInr } from '../../utils/currency';
import { ChevronLeft, ChevronRight, Loader2, Zap } from 'lucide-react';

export const VALID_STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'BUYER_APPROVED', label: 'Buyer Approved' },
  { value: 'FINANCING_REQUESTED', label: 'Financing Requested' },
  { value: 'FUNDED', label: 'Funded' },
  { value: 'REPAID', label: 'Repaid' },
  { value: 'DEFAULTED', label: 'Defaulted' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export interface InvoiceTableProps {
  invoices: Invoice[];
  loading?: boolean;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
  onRequestFinancing?: (invoiceId: string) => Promise<void>;
  pendingFinancingId?: string | null;
}

export const InvoiceTable: React.FC<InvoiceTableProps> = ({
  invoices,
  loading = false,
  selectedStatus,
  onStatusChange,
  limit,
  offset,
  onPageChange,
  onRequestFinancing,
  pendingFinancingId,
}) => {
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
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
        <div>
          <h3 className="font-semibold text-slate-800 text-base">Invoices</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time status tracking and financing advance triggers
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <label htmlFor="status-filter" className="text-xs font-medium text-slate-600">
            Filter:
          </label>
          <select
            id="status-filter"
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
          >
            {VALID_STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">Invoice #</th>
              <th scope="col" className="px-5 py-3 font-semibold">Due Date</th>
              <th scope="col" className="px-5 py-3 font-semibold text-right">Amount</th>
              <th scope="col" className="px-5 py-3 font-semibold">Status</th>
              <th scope="col" className="px-5 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                    <span className="text-sm font-medium">Loading invoices...</span>
                  </div>
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                  <p className="text-sm font-medium text-slate-600">No invoices found</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {selectedStatus
                      ? `No invoices match status filter "${selectedStatus}"`
                      : 'Submit your first invoice to begin financing'}
                  </p>
                </td>
              </tr>
            ) : (
              invoices.map((inv) => {
                const isPending = pendingFinancingId === inv.id;
                const canRequestFinancing = inv.status === 'BUYER_APPROVED';

                return (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-slate-900">
                      {inv.invoice_number}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 text-xs">
                      {formatDate(inv.due_date)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium text-slate-900">
                      {formatPaiseToInr(inv.amount_cents)}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {canRequestFinancing ? (
                        <button
                          type="button"
                          onClick={() => onRequestFinancing?.(inv.id)}
                          disabled={isPending}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          {isPending ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Requesting...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-3.5 h-3.5" />
                              <span>Request Financing</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
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
            onClick={() => onPageChange(Math.max(0, offset - limit))}
            disabled={!canGoPrev || loading}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>
          <button
            type="button"
            onClick={() => onPageChange(offset + limit)}
            disabled={!canGoNext || loading}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
