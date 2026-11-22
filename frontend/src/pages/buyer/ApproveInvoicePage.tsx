import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getInvoiceDetail, approveInvoice } from '../../api/invoiceDetail';
import { Invoice } from '../../api/types';
import { ApiClientError } from '../../api/errors';
import { formatPaiseToInr } from '../../utils/currency';
import { StatusBadge } from '../../components/invoices/StatusBadge';
import {
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  FileText,
  KeyRound,
  AlertCircle,
  Building2,
} from 'lucide-react';

export const ApproveInvoicePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [signature, setSignature] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusConflict, setStatusConflict] = useState(false);

  const loadInvoice = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setFetchError(null);
    try {
      const data = await getInvoiceDetail(id);
      setInvoice(data.invoice);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 403 || err.code === 'FORBIDDEN') {
          setFetchError('Access restricted: you are not authorised to approve this invoice.');
        } else if (err.status === 404 || err.code === 'INVOICE_NOT_FOUND') {
          setFetchError('Invoice not found.');
        } else {
          setFetchError(err.readableMessage || 'Failed to load invoice details.');
        }
      } else {
        setFetchError('An unexpected error occurred while loading the invoice.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  const isSignatureValid = signature.trim().length >= 10;
  const isSubmitEnabled = isSignatureValid && acknowledged && !submitting && invoice?.status === 'SUBMITTED';

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !isSubmitEnabled) return;

    setSubmitting(true);
    setSubmitError(null);
    setStatusConflict(false);

    try {
      await approveInvoice(id, { buyer_signature: signature.trim() });
      navigate('/buyer', {
        state: { message: `Invoice ${invoice?.invoice_number} approved successfully!` },
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 409 || err.code === 'INVALID_TRANSITION') {
          setStatusConflict(true);
          setSubmitError(
            'The invoice status was modified and is no longer awaiting approval. Refreshing invoice status...'
          );
          // Refresh invoice data
          await loadInvoice();
        } else if (err.status === 403 || err.code === 'FORBIDDEN') {
          setSubmitError('Forbidden: Only the designated buyer organisation can approve this invoice.');
        } else {
          setSubmitError(err.readableMessage || 'Failed to approve invoice.');
        }
      } else {
        setSubmitError('An unexpected error occurred during invoice approval.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
        <p className="text-sm font-medium text-slate-600">Loading invoice approval details...</p>
      </div>
    );
  }

  if (fetchError || !invoice) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
          <h3 className="text-base font-semibold text-rose-900">Unable to Load Invoice</h3>
          <p className="text-sm text-rose-700 mt-1">{fetchError || 'Invoice record not found.'}</p>
          <div className="mt-5">
            <Link
              to="/buyer"
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-white border border-rose-300 text-rose-800 text-sm font-medium rounded-lg hover:bg-rose-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Buyer Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isSubmitted = invoice.status === 'SUBMITTED';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Header / Back Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/buyer"
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
        <span className="text-xs text-slate-400">Step: Buyer Approval</span>
      </div>

      {/* Main Title Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                Invoice Approval
              </span>
              <StatusBadge status={invoice.status} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">
              Review Invoice {invoice.invoice_number}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Verify invoice particulars and submit your digital approval signature
            </p>
          </div>
          <div className="text-left sm:text-right bg-slate-50 p-4 rounded-xl border border-slate-100">
            <p className="text-xs font-medium text-slate-500">Invoice Amount</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {formatPaiseToInr(invoice.amount_cents)}
            </p>
          </div>
        </div>
      </div>

      {/* Ineligible Status Warning */}
      {!isSubmitted && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start space-x-3.5 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-amber-900">Invoice Not Awaiting Approval</h4>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              This invoice is currently in <span className="font-bold">{invoice.status}</span> status. Only invoices in{' '}
              <span className="font-bold">SUBMITTED</span> status can be approved.
            </p>
            <div className="mt-3">
              <Link
                to={`/invoices/${invoice.id}`}
                className="text-xs font-semibold text-amber-900 underline hover:text-amber-950"
              >
                View full invoice details and timeline &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Status Conflict Alert */}
      {statusConflict && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start space-x-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-800">
            <p className="font-semibold">{submitError}</p>
          </div>
        </div>
      )}

      {/* Invoice Particulars Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center space-x-2">
          <FileText className="w-4 h-4 text-emerald-600" />
          <span>Invoice Particulars</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-slate-400 block font-medium">Invoice Number</span>
            <span className="font-semibold text-slate-800 mt-1 block">{invoice.invoice_number}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-slate-400 block font-medium">Due Date</span>
            <span className="font-semibold text-slate-800 mt-1 block">
              {new Date(invoice.due_date).toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-slate-400 block font-medium">Supplier Reference</span>
            <span className="font-mono text-slate-700 mt-1 block truncate" title={invoice.supplier_id}>
              {invoice.supplier_id}
            </span>
          </div>
        </div>
      </div>

      {/* Approval Form */}
      {isSubmitted && (
        <form onSubmit={handleApprove} className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center space-x-2">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>Digital Approval Declaration</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Cryptographic approval confirms acceptance of delivered goods/services and validates settlement.
            </p>
          </div>

          {submitError && !statusConflict && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              {submitError}
            </div>
          )}

          {/* Legal Notice Box */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/70 text-xs text-slate-600 space-y-2">
            <div className="flex items-center space-x-1.5 text-slate-800 font-semibold">
              <Building2 className="w-4 h-4 text-slate-500" />
              <span>Commercial Liability Acknowledgement</span>
            </div>
            <p className="leading-relaxed">
              I hereby confirm receipt and inspection of the goods/services associated with invoice{' '}
              <span className="font-semibold text-slate-800">{invoice.invoice_number}</span> and irrevocably approve
              this invoice for settlement. I acknowledge that the supplier may pledge this approved invoice to Vanguard
              Settlement Engine for financing advances, and that our organization is committed to settle funds into the
              designated Virtual Account on or before the due date.
            </p>
          </div>

          {/* Acknowledgement Checkbox */}
          <div className="flex items-start space-x-3">
            <input
              type="checkbox"
              id="acknowledge-checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 mt-0.5 cursor-pointer"
            />
            <label htmlFor="acknowledge-checkbox" className="text-xs text-slate-700 font-medium cursor-pointer">
              I confirm the goods/services are received in satisfactory order and authorize digital approval of this invoice.
            </label>
          </div>

          {/* Signature Input */}
          <div className="space-y-1.5">
            <label htmlFor="buyer-signature-input" className="block text-xs font-semibold text-slate-700">
              Digital Approval Signature <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              id="buyer-signature-input"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="e.g. sha256-omega-approval-sig-m5"
              className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder:text-slate-400 placeholder:font-sans"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <span>
                {signature.length < 10 ? (
                  <span className="text-amber-600 font-medium">
                    Minimum 10 characters required ({signature.length}/10)
                  </span>
                ) : (
                  <span className="text-emerald-600 font-medium flex items-center space-x-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>Cryptographic signature format valid ({signature.length} characters)</span>
                  </span>
                )}
              </span>
              <span>Required for non-repudiation</span>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
            <Link
              to="/buyer"
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!isSubmitEnabled}
              className="inline-flex items-center space-x-1.5 px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Approval...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Approve Invoice</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
