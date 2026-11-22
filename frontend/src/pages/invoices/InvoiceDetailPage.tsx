import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getInvoiceDetail } from '../../api/invoiceDetail';
import { getVanByInvoice } from '../../api/van';
import { apiClient } from '../../api/client';
import { Invoice, InvoiceEvent, VanWithLedger } from '../../api/types';
import { ApiClientError } from '../../api/errors';
import { formatPaiseToInr } from '../../utils/currency';
import { StatusBadge } from '../../components/invoices/StatusBadge';
import { AuditTimeline } from '../../components/invoices/AuditTimeline';
import { VirtualAccountPanel } from '../../components/invoices/VirtualAccountPanel';
import {
  FileText,
  Calendar,
  Building2,
  Lock,
  ArrowLeft,
  Loader2,
  Zap,
  CheckSquare,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

export const InvoiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [events, setEvents] = useState<InvoiceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessRestricted, setAccessRestricted] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [vanData, setVanData] = useState<VanWithLedger | null>(null);
  const [loadingVan, setLoadingVan] = useState(false);
  const [vanError, setVanError] = useState<ApiClientError | Error | null>(null);

  const [requestingFinancing, setRequestingFinancing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const role = user?.role;
  const dashboardPath = role === 'buyer' ? '/buyer' : role === 'platform_admin' ? '/admin' : '/supplier';

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setAccessRestricted(false);
    setNotFound(false);
    setErrorMsg(null);

    try {
      const history = await getInvoiceDetail(id);
      setInvoice(history.invoice);
      setEvents(history.events || []);

      // Now fetch VAN data in parallel / after invoice is retrieved
      setLoadingVan(true);
      setVanError(null);
      try {
        const van = await getVanByInvoice(id);
        setVanData(van);
      } catch (err) {
        setVanError(err as Error);
      } finally {
        setLoadingVan(false);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 403 || err.code === 'FORBIDDEN') {
          setAccessRestricted(true);
        } else if (err.status === 404 || err.code === 'INVOICE_NOT_FOUND') {
          setNotFound(true);
        } else {
          setErrorMsg(err.readableMessage || 'Failed to load invoice details.');
        }
      } else {
        setErrorMsg('An unexpected error occurred while loading invoice details.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRequestFinancing = async () => {
    if (!invoice || requestingFinancing) return;
    setRequestingFinancing(true);
    setActionSuccess(null);
    try {
      await apiClient.post(`/invoices/${invoice.id}/request-financing`);
      setActionSuccess('Financing advance requested successfully! Risk assessment initiated.');
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMsg(err.readableMessage);
      } else {
        setErrorMsg('Failed to request financing.');
      }
    } finally {
      setRequestingFinancing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
        <p className="text-sm font-medium text-slate-600">Loading invoice and audit history...</p>
      </div>
    );
  }

  // Graceful 403 Access Restriction Card
  if (accessRestricted) {
    return (
      <div className="max-w-xl mx-auto my-12">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm text-center">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-100 shadow-sm">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
          <p className="text-sm font-medium text-slate-700 mt-2">
            Access restricted: you are not authorised to view this invoice
          </p>
          <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
            Invoices can only be viewed by the designated supplier, the buyer organisation, or platform administrators.
          </p>
          <div className="mt-6">
            <Link
              to={dashboardPath}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 404 Invoice Not Found
  if (notFound) {
    return (
      <div className="max-w-xl mx-auto my-12">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm text-center">
          <div className="w-14 h-14 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200">
            <FileText className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Invoice Not Found</h2>
          <p className="text-sm text-slate-600 mt-2">
            The requested invoice could not be located in the settlement engine.
          </p>
          <div className="mt-6">
            <Link
              to={dashboardPath}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (errorMsg || !invoice) {
    return (
      <div className="max-w-xl mx-auto my-12">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-7 h-7 text-rose-600 mx-auto mb-2" />
          <h3 className="text-base font-semibold text-rose-900">Failed to Load Invoice</h3>
          <p className="text-xs text-rose-700 mt-1">{errorMsg || 'Unknown error occurred.'}</p>
          <div className="mt-4 flex items-center justify-center space-x-3">
            <button
              onClick={loadData}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-white border border-rose-300 text-rose-800 text-xs font-semibold rounded-lg hover:bg-rose-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
            <Link
              to={dashboardPath}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canSupplierRequestFinancing = role === 'supplier' && invoice.status === 'BUYER_APPROVED';
  const canBuyerApprove = role === 'buyer' && invoice.status === 'SUBMITTED';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          to={dashboardPath}
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>

        <div className="flex items-center space-x-2">
          {canBuyerApprove && (
            <Link
              to={`/buyer/invoices/${invoice.id}/approve`}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Review & Approve Invoice</span>
            </Link>
          )}

          {canSupplierRequestFinancing && (
            <button
              type="button"
              onClick={handleRequestFinancing}
              disabled={requestingFinancing}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50 transition-all"
            >
              {requestingFinancing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Requesting...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Request Financing Advance</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={loadData}
            className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            title="Refresh details"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-xl shadow-sm flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-700 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {/* Invoice Header Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
                {invoice.invoice_number}
              </h1>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Internal ID: <span className="font-mono text-slate-400">{invoice.id}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="border-l-0 lg:border-l border-slate-200 pl-0 lg:pl-6">
              <span className="text-xs font-medium text-slate-400 block">Total Amount</span>
              <span className="text-2xl font-bold text-slate-900 mt-0.5 block">
                {formatPaiseToInr(invoice.amount_cents)}
              </span>
            </div>
            <div className="border-l border-slate-200 pl-6">
              <span className="text-xs font-medium text-slate-400 block">Due Date</span>
              <span className="text-sm font-semibold text-slate-800 mt-0.5 block flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {new Date(invoice.due_date).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Counterparty Info Row */}
        <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center space-x-3">
            <div className="p-2 bg-white rounded-md border border-slate-200 text-slate-600">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-slate-400 block font-medium">Supplier Reference</span>
              <span className="font-mono text-slate-800 font-semibold truncate block" title={invoice.supplier_id}>
                {invoice.supplier_id}
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center space-x-3">
            <div className="p-2 bg-white rounded-md border border-slate-200 text-slate-600">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-slate-400 block font-medium">Buyer Reference</span>
              <span className="font-mono text-slate-800 font-semibold truncate block" title={invoice.buyer_id}>
                {invoice.buyer_id}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column Layout: VAN & Reconciliation (Left) and Audit Timeline (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Virtual Account Panel */}
        <div className="lg:col-span-7 space-y-6">
          <VirtualAccountPanel
            vanData={vanData}
            loading={loadingVan}
            error={vanError}
            invoiceStatus={invoice.status}
          />
        </div>

        {/* Right Column: Audit Timeline */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
          <div className="border-b border-slate-100 pb-3 mb-6">
            <h3 className="font-semibold text-slate-900 text-base">Audit Trail & Events</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Chronological immutable event history for compliance
            </p>
          </div>
          <AuditTimeline events={events} />
        </div>
      </div>
    </div>
  );
};
