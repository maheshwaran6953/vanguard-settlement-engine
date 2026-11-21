import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { BuyerOrgSummary, Invoice } from '../../api/types';
import { ApiClientError } from '../../api/errors';
import { rupeesToPaise } from '../../utils/money';
import { 
  ArrowLeft, 
  FilePlus2, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  RotateCcw,
  Send
} from 'lucide-react';

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const SubmitInvoicePage: React.FC = () => {
  const navigate = useNavigate();

  // Form fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Dropdown data & loading
  const [buyers, setBuyers] = useState<BuyerOrgSummary[]>([]);
  const [loadingBuyers, setLoadingBuyers] = useState(true);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Idempotency key: component state only, never in localStorage
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateIdempotencyKey());

  useEffect(() => {
    let isMounted = true;
    async function fetchBuyers() {
      try {
        setLoadingBuyers(true);
        const data = await apiClient.get<BuyerOrgSummary[]>('/organisations?role=buyer');
        if (isMounted) {
          setBuyers(data || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Failed to load eligible buyers. Please refresh.'
          );
        }
      } finally {
        if (isMounted) setLoadingBuyers(false);
      }
    }

    fetchBuyers();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleReset = () => {
    if (submitting) return; // Do not reset if request in flight
    setInvoiceNumber('');
    setBuyerId('');
    setAmountRupees('');
    setDueDate('');
    setError(null);
    setSuccessMessage(null);
    // On manual reset, discard key and generate a fresh one
    setIdempotencyKey(generateIdempotencyKey());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSuccessMessage(null);

    // Basic required field validations
    if (!invoiceNumber.trim()) {
      setError('Invoice number is required');
      return;
    }
    if (!buyerId) {
      setError('Please select a buyer organisation');
      return;
    }
    if (!dueDate) {
      setError('Due date is required');
      return;
    }

    // Convert rupees to paise with decimal precision guard
    let amountCents: number;
    try {
      amountCents = rupeesToPaise(amountRupees);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid amount format');
      return;
    }

    try {
      setSubmitting(true);

      // Reuses the identical idempotencyKey for retries until 201 is returned
      const result = await apiClient.post<Invoice>(
        '/invoices',
        {
          invoice_number: invoiceNumber.trim(),
          buyer_id: buyerId,
          amount_cents: amountCents,
          currency: 'INR',
          due_date: dueDate,
        },
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
        }
      );

      // On 201 Created: discard key and generate a new one for subsequent invoices
      setIdempotencyKey(generateIdempotencyKey());
      setSuccessMessage(`Invoice ${result.invoice_number} submitted successfully!`);

      // Reset form fields
      setInvoiceNumber('');
      setBuyerId('');
      setAmountRupees('');
      setDueDate('');

      // Redirect after a brief confirmation
      setTimeout(() => {
        navigate('/supplier');
      }, 1200);
    } catch (err: unknown) {
      // Keep identical idempotencyKey so the user can safely retry
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while submitting the invoice.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Breadcrumb Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/supplier"
          className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Supplier Dashboard
        </Link>
        <span className="text-[11px] text-slate-400 font-mono" title="Idempotency Key in session state">
          Key: {idempotencyKey.slice(0, 8)}...
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8">
        <div className="flex items-center space-x-3 pb-6 border-b border-slate-100">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <FilePlus2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Submit New Invoice</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Initiate financing by submitting an invoice for verified buyer digital approval.
            </p>
          </div>
        </div>

        {error && (
          <div
            className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start space-x-3"
            data-testid="submit-error"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
            <div className="flex-1">
              <p className="font-semibold text-rose-800">Submission Error</p>
              <p className="mt-0.5 text-xs text-rose-700">{error}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div
            className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-start space-x-3"
            data-testid="submit-success"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-900">Success</p>
              <p className="mt-0.5 text-xs text-emerald-700">{successMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* Invoice Number */}
          <div>
            <label htmlFor="invoice-number" className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
              Invoice Number <span className="text-rose-500">*</span>
            </label>
            <input
              id="invoice-number"
              type="text"
              maxLength={50}
              placeholder="e.g. INV-2026-001"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              disabled={submitting}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-50"
              required
            />
          </div>

          {/* Buyer Selection */}
          <div>
            <label htmlFor="buyer-select" className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
              Buyer Organisation <span className="text-rose-500">*</span>
            </label>
            {loadingBuyers ? (
              <div className="flex items-center space-x-2 text-xs text-slate-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span>Loading eligible buyers...</span>
              </div>
            ) : (
              <select
                id="buyer-select"
                value={buyerId}
                onChange={(e) => setBuyerId(e.target.value)}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-50 bg-white"
                required
              >
                <option value="">Select a buyer organisation...</option>
                {buyers.map((buyer) => (
                  <option key={buyer.id} value={buyer.id}>
                    {buyer.legal_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Amount & Currency Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="amount-rupees" className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                Amount (₹ Rupees) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-sm font-semibold text-slate-400">
                  ₹
                </span>
                <input
                  id="amount-rupees"
                  type="text"
                  inputMode="decimal"
                  placeholder="10000.50"
                  value={amountRupees}
                  onChange={(e) => setAmountRupees(e.target.value)}
                  disabled={submitting}
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-50"
                  required
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Exact decimals supported (max 2 places). Converted safely to integer paise.
              </p>
            </div>

            <div>
              <label htmlFor="currency-input" className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                Currency
              </label>
              <input
                id="currency-input"
                type="text"
                value="INR"
                disabled
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-100 text-sm text-slate-500 font-semibold"
              />
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label htmlFor="due-date" className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
              Due Date <span className="text-rose-500">*</span>
            </label>
            <input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={submitting}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-50 bg-white"
              required
            />
          </div>

          {/* Form Action Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={submitting}
              className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Invoice</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
