import React from 'react';
import { VanWithLedger } from '../../api/types';
import { ApiClientError } from '../../api/errors';
import { formatPaiseToInr } from '../../utils/currency';
import {
  CreditCard,
  Building2,
  AlertTriangle,
  Clock,
  Loader2,
  Info,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';

interface VirtualAccountPanelProps {
  vanData?: VanWithLedger | null;
  loading?: boolean;
  error?: ApiClientError | Error | null;
  invoiceStatus?: string;
}

export const VirtualAccountPanel: React.FC<VirtualAccountPanelProps> = ({
  vanData,
  loading = false,
  error = null,
  invoiceStatus,
}) => {
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/80 p-8 text-center shadow-sm">
        <div className="flex items-center justify-center space-x-2 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
          <span className="text-sm font-medium">Loading virtual account details...</span>
        </div>
      </div>
    );
  }

  if (error) {
    const isNotFound =
      (error instanceof ApiClientError && (error.code === 'VAN_NOT_FOUND' || error.status === 404)) ||
      (error as { code?: string })?.code === 'VAN_NOT_FOUND' ||
      (error as { status?: number })?.status === 404;

    if (isNotFound) {
      return (
        <div className="bg-sky-50/60 rounded-xl border border-sky-100 p-6 shadow-sm">
          <div className="flex items-start space-x-3.5">
            <div className="p-2 bg-sky-100 text-sky-700 rounded-lg shrink-0 mt-0.5">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Virtual Account Status</h4>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                No virtual account issued yet. A virtual account is created when financing is approved.
              </p>
              {invoiceStatus && (
                <p className="text-xs text-slate-400 mt-2">
                  Current Invoice Status: <span className="font-semibold text-slate-600">{invoiceStatus}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    const errCode = (error instanceof ApiClientError ? error.code : null) || (error as { code?: string })?.code || 'UNKNOWN_ERROR';
    return (
      <div className="bg-rose-50/60 rounded-xl border border-rose-200 p-6 shadow-sm">
        <div className="flex items-start space-x-3.5">
          <div className="p-2 bg-rose-100 text-rose-700 rounded-lg shrink-0 mt-0.5">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-rose-900">Unable to Load Virtual Account</h4>
            <p className="text-sm text-rose-700 mt-1">
              Unable to load virtual account details: {errCode}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!vanData) {
    return null;
  }

  const { virtual_account: va, ledger_entries: ledger = [] } = vanData;

  // Calculate settlement progress with BigInt precision
  let pctNumber = 0;
  let expectedPaise = 0n;
  let receivedPaise = 0n;
  try {
    expectedPaise = BigInt(va.expected_amount_cents || '0');
    receivedPaise = BigInt(va.received_amount_cents || '0');
    if (expectedPaise > 0n) {
      pctNumber = Number((receivedPaise * 10000n) / expectedPaise) / 100;
    }
  } catch {
    pctNumber = 0;
  }

  const isOverpaid = va.status === 'over_paid' || pctNumber > 100;
  const isPartiallySettled = va.status === 'partially_settled';
  const isSettled = va.status === 'settled' || vanData.is_fully_settled;

  const progressFillWidth = Math.min(100, Math.max(0, pctNumber));

  return (
    <div className="space-y-6">
      {/* Over-Payment Alert Banner */}
      {isOverpaid && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-purple-900">Over-Payment Detected</h4>
            <p className="text-xs text-purple-700 mt-0.5 leading-relaxed">
              Total received funds ({formatPaiseToInr(va.received_amount_cents)}) exceed expected settlement (
              {formatPaiseToInr(va.expected_amount_cents)}). Account is flagged for compliance and manual review.
            </p>
          </div>
        </div>
      )}

      {/* Main VAN Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-base">Virtual Settlement Account</h3>
              <p className="text-xs text-slate-500">Dedicated payment destination for buyer NEFT/RTGS</p>
            </div>
          </div>
          <div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                isSettled
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : isOverpaid
                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                  : isPartiallySettled
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
              }`}
            >
              {va.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Account Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/60">
              <p className="text-xs font-medium text-slate-500">Virtual Account Number</p>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono font-semibold text-slate-900 text-sm">
                  {va.account_number}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(va.account_number, 'van')}
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Copy Account Number"
                >
                  {copiedField === 'van' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/60">
              <p className="text-xs font-medium text-slate-500">IFSC Code</p>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono font-semibold text-slate-900 text-sm">
                  {va.ifsc_code}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(va.ifsc_code, 'ifsc')}
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Copy IFSC Code"
                >
                  {copiedField === 'ifsc' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/60">
              <p className="text-xs font-medium text-slate-500">Expected Settlement</p>
              <p className="font-bold text-slate-900 text-sm mt-1">
                {formatPaiseToInr(va.expected_amount_cents)}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/60">
              <p className="text-xs font-medium text-slate-500">Received So Far</p>
              <p className="font-bold text-slate-900 text-sm mt-1">
                {formatPaiseToInr(va.received_amount_cents)}
              </p>
            </div>
          </div>

          {/* Settlement Progress Bar */}
          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/70 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Settlement Progress</span>
              </span>
              <span className="font-bold text-slate-900 font-mono">
                {pctNumber.toFixed(2)}%
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isOverpaid
                    ? 'bg-purple-600'
                    : isSettled
                    ? 'bg-emerald-600'
                    : 'bg-indigo-600'
                }`}
                style={{ width: `${progressFillWidth}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <span>₹0</span>
              {isPartiallySettled && (
                <span className="text-blue-600 font-medium">
                  Partially settled — invoice remains FUNDED until full balance received
                </span>
              )}
              <span>Expected: {formatPaiseToInr(va.expected_amount_cents)}</span>
            </div>
          </div>
        </div>

        {/* Ledger Entries Table */}
        <div className="border-t border-slate-200">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
                Reconciliation Ledger ({ledger.length})
              </h4>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Date</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Reference</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Type</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Description</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-slate-400">
                      No ledger transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  ledger.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleString('en-IN', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-600 max-w-[160px] truncate" title={entry.idempotency_key}>
                        {entry.idempotency_key}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            entry.entry_type === 'credit'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {entry.entry_type}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {entry.description}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                        {formatPaiseToInr(entry.amount_cents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
