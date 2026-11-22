import React from 'react';
import { InvoiceEvent } from '../../api/types';
import {
  FileText,
  CheckCircle,
  Zap,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface AuditTimelineProps {
  events: InvoiceEvent[];
}

interface EventConfig {
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeColor: string;
  iconBg: string;
}

const KNOWN_EVENTS: Record<string, EventConfig> = {
  'invoice.submitted': {
    label: 'Invoice Submitted',
    description: 'Invoice submitted by supplier for buyer approval',
    icon: FileText,
    badgeColor: 'text-sky-700 bg-sky-50 border-sky-200',
    iconBg: 'bg-sky-100 text-sky-600',
  },
  'invoice.buyer_approved': {
    label: 'Buyer Approved',
    description: 'Buyer digitally approved invoice and acknowledged liability',
    icon: CheckCircle,
    badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    iconBg: 'bg-emerald-100 text-emerald-600',
  },
  'invoice.financing_requested': {
    label: 'Financing Requested',
    description: 'Supplier submitted financing advance request to risk engine',
    icon: Zap,
    badgeColor: 'text-amber-700 bg-amber-50 border-amber-200',
    iconBg: 'bg-amber-100 text-amber-600',
  },
  'risk.assessment.approve': {
    label: 'Risk Assessment: Approved',
    description: 'Automated 3-way match & anomaly risk assessment approved',
    icon: ShieldCheck,
    badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    iconBg: 'bg-emerald-100 text-emerald-600',
  },
  'risk.assessment.reject': {
    label: 'Risk Assessment: Rejected',
    description: 'Risk assessment rejected financing request',
    icon: ShieldX,
    badgeColor: 'text-rose-700 bg-rose-50 border-rose-200',
    iconBg: 'bg-rose-100 text-rose-600',
  },
  'risk.assessment.manual_review': {
    label: 'Risk Assessment: Manual Review Required',
    description: 'Risk assessment flagged anomalies requiring manual compliance review',
    icon: AlertTriangle,
    badgeColor: 'text-amber-700 bg-amber-50 border-amber-200',
    iconBg: 'bg-amber-100 text-amber-600',
  },
  'van.created': {
    label: 'Virtual Account Created',
    description: 'Dedicated Virtual Account issued for buyer settlement',
    icon: CreditCard,
    badgeColor: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    iconBg: 'bg-indigo-100 text-indigo-600',
  },
  'van.partially_settled': {
    label: 'Partial Payment Settled',
    description: 'Partial settlement payment received and recorded in ledger',
    icon: Clock,
    badgeColor: 'text-blue-700 bg-blue-50 border-blue-200',
    iconBg: 'bg-blue-100 text-blue-600',
  },
  'invoice.repaid': {
    label: 'Fully Repaid',
    description: 'Full settlement received. Virtual Account closed and receipt generated',
    icon: CheckCircle2,
    badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    iconBg: 'bg-emerald-100 text-emerald-600',
  },
  'invoice.over_paid': {
    label: 'Over-Payment Recorded',
    description: 'Payment exceeded expected amount. Excess flagged for manual review',
    icon: AlertCircle,
    badgeColor: 'text-purple-700 bg-purple-50 border-purple-200',
    iconBg: 'bg-purple-100 text-purple-600',
  },
};

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ events }) => {
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );

  const formatTimestamp = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return dateStr;
    }
  };

  if (!events || events.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-slate-200/60 text-sm">
        No audit events recorded for this invoice yet.
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {sortedEvents.map((event, idx) => {
          const isLast = idx === sortedEvents.length - 1;
          const config = KNOWN_EVENTS[event.event_type];
          const IconComponent = config?.icon || HelpCircle;

          return (
            <li key={event.id || `${event.event_type}-${idx}`}>
              <div className="relative pb-8">
                {!isLast && (
                  <span
                    className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-200"
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex space-x-3.5 items-start">
                  <div>
                    <span
                      className={`h-8 w-8 rounded-full flex items-center justify-center ring-4 ring-white shadow-sm ${
                        config?.iconBg || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <div>
                        {config ? (
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.badgeColor}`}
                          >
                            {config.label}
                          </span>
                        ) : (
                          <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                            {event.event_type}
                          </span>
                        )}
                        <span className="ml-2 font-mono text-[11px] text-slate-400">
                          {event.event_type}
                        </span>
                      </div>
                      <time
                        dateTime={event.occurred_at}
                        className="text-xs text-slate-400 font-medium whitespace-nowrap"
                      >
                        {formatTimestamp(event.occurred_at)}
                      </time>
                    </div>

                    {config?.description && (
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {config.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
