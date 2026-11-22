import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldAlert,
  Server,
  RefreshCw,
  RotateCw,
  Trash2,
  AlertOctagon,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
} from 'lucide-react';
import { FailedJobSummary } from '../../api/types';
import { getFailedJobs, retryFailedJob, discardFailedJob } from '../../api/admin';
import { ApiClientError } from '../../api/errors';
import { DiscardConfirmModal } from '../../components/admin/DiscardConfirmModal';

export function formatFailedAt(timestamp: number | undefined | null): string {
  if (timestamp === undefined || timestamp === null || typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return '—';
  }
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('en-IN');
}

export const PlatformAdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<FailedJobSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessRestricted, setAccessRestricted] = useState<{ restricted: boolean; message: string }>({
    restricted: false,
    message: '',
  });
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<FailedJobSummary | null>(null);
  const [isDiscarding, setIsDiscarding] = useState<boolean>(false);

  // Guard: auto-refresh skips while a retry or discard is in flight
  const isActionInFlightRef = useRef<boolean>(false);
  const initialFetchDoneRef = useRef<boolean>(false);

  const fetchJobs = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setLoadError(null);

    try {
      const data = await getFailedJobs();
      setJobs(data.jobs || []);
      setAccessRestricted({ restricted: false, message: '' });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) {
        setAccessRestricted({
          restricted: true,
          message: err.serverMessage || err.message || "Role is not permitted to perform this action",
        });
      } else if (err instanceof ApiClientError) {
        setLoadError(err.serverMessage || err.message);
      } else if (err instanceof Error) {
        setLoadError(err.message);
      } else {
        setLoadError('Failed to load dead-letter queue jobs. Please check network connection.');
      }
    } finally {
      if (isInitial) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  // Initial fetch and role gate check
  useEffect(() => {
    if (user && user.role !== 'platform_admin') {
      setAccessRestricted({
        restricted: true,
        message: `Role '${user.role}' is not permitted to perform this action`,
      });
      setLoading(false);
      return;
    }

    if (!initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      fetchJobs(true);
    }
  }, [user?.role, fetchJobs]);

  // 30-second auto-refresh polling with in-flight guard
  useEffect(() => {
    const dlqRefreshTimer = setInterval(() => {
      if (isActionInFlightRef.current) {
        return; // Guard: skip 30-second refresh while retry or discard is in flight
      }
      fetchJobs(false);
    }, 30000);

    return () => clearInterval(dlqRefreshTimer);
  }, [fetchJobs]);

  const handleRetry = async (job: FailedJobSummary) => {
    if (!job.id) return;
    isActionInFlightRef.current = true;
    setActionLoadingId(job.id);
    setActionFeedback(null);

    try {
      const res = await retryFailedJob(job.queue, job.id);
      setActionFeedback({
        type: 'success',
        message: res.message || `Job ${job.id} in queue ${job.queue} queued for retry`,
      });
      await fetchJobs(false);
    } catch (err) {
      let msg = 'Failed to retry job';
      if (err instanceof ApiClientError && err.serverMessage) {
        msg = err.serverMessage;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      isActionInFlightRef.current = false;
      setActionLoadingId(null);
    }
  };

  const handleOpenDiscard = (job: FailedJobSummary) => {
    setDiscardTarget(job);
  };

  const handleConfirmDiscard = async () => {
    if (!discardTarget || !discardTarget.id) return;
    isActionInFlightRef.current = true;
    setIsDiscarding(true);
    setActionFeedback(null);

    try {
      const res = await discardFailedJob(discardTarget.queue, discardTarget.id);
      setActionFeedback({
        type: 'success',
        message: res.message || `Job ${discardTarget.id} discarded from queue ${discardTarget.queue}`,
      });
      setDiscardTarget(null);
      await fetchJobs(false);
    } catch (err) {
      let msg = 'Failed to discard job';
      if (err instanceof ApiClientError && err.serverMessage) {
        msg = err.serverMessage;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setActionFeedback({ type: 'error', message: msg });
      setDiscardTarget(null);
    } finally {
      setIsDiscarding(false);
      isActionInFlightRef.current = false;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-700 to-indigo-800 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Platform Admin Console — {user?.legalName || 'Platform Administrator'}</h1>
          <p className="mt-1 text-purple-200 text-sm">
            Platform Operations • Dead-letter queue monitoring, job retry operations, and background worker telemetry.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => fetchJobs(false)}
            disabled={refreshing || loading}
            className="inline-flex items-center px-4 py-2 rounded-xl bg-purple-600/60 hover:bg-purple-600 text-white text-sm font-medium transition-colors border border-purple-400/30 disabled:opacity-50"
            aria-label="Refresh job list"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Now'}
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Failed Jobs (DLQ)</p>
            <p className="text-2xl font-bold text-slate-900 mt-1" data-testid="failed-jobs-count">
              {accessRestricted.restricted ? '—' : jobs.length}
            </p>
            <p className="text-xs text-slate-500 mt-1">Dead-letter queue backlog across all workers</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-slate-50 text-slate-600 rounded-lg">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Queue Telemetry</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {accessRestricted.restricted ? '—' : jobs.length > 0 ? 'Action Required' : 'Healthy'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Notification & document worker queues</p>
          </div>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          role="alert"
          className={`p-4 rounded-xl flex items-center justify-between border ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertOctagon className="w-5 h-5 text-red-600 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
            aria-label="Dismiss feedback"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content: Explicit Distinct Branches */}

      {/* BRANCH 1: Access Restricted */}
      {accessRestricted.restricted ? (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-900 shadow-sm flex items-start space-x-4"
        >
          <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
            <AlertOctagon className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-amber-950">Access Restricted</h2>
            <p className="mt-1 text-sm text-amber-800">
              {accessRestricted.message || 'You do not have permission to access the Dead-Letter Queue management console.'}
            </p>
            <p className="mt-2 text-xs text-amber-700 font-medium">
              Only users with the <span className="font-mono font-bold">platform_admin</span> role are authorized to inspect or retry failed background jobs.
            </p>
          </div>
        </div>
      ) : loading ? (
        /* Loading Skeleton */
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-sm">
          <div className="inline-block animate-spin text-purple-600 mb-3">
            <RotateCw className="w-8 h-8" />
          </div>
          <p className="text-sm font-medium text-slate-600">Loading dead-letter queue jobs...</p>
        </div>
      ) : loadError ? (
        /* BRANCH 2: Network / Fetch Error */
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-900 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        >
          <div className="flex items-center space-x-3">
            <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold">{loadError}</p>
              <p className="text-xs text-red-700 mt-0.5">Please check backend connectivity or try again.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchJobs(true)}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors shadow-sm"
          >
            Retry Connection
          </button>
        </div>
      ) : jobs.length === 0 ? (
        /* BRANCH 3: Clean Empty State */
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-sm">
          <div className="mx-auto w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">No failed background jobs.</h2>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            All background workers in notification and document queues are operating normally with zero dead-letter jobs.
          </p>
        </div>
      ) : (
        /* BRANCH 4: Failed Jobs Data Table */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-purple-600" />
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Dead-Letter Queue Backlog</h2>
            </div>
            <span className="text-xs font-medium text-slate-500">
              Showing {jobs.length} failed {jobs.length === 1 ? 'job' : 'jobs'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600" aria-label="Failed jobs table">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500 border-b border-slate-200/80">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Job Name</th>
                  <th scope="col" className="px-6 py-3.5">Queue</th>
                  <th scope="col" className="px-6 py-3.5">Failure Reason</th>
                  <th scope="col" className="px-6 py-3.5 text-center">Attempts</th>
                  <th scope="col" className="px-6 py-3.5">Failed At</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job, idx) => {
                  const key = job.id || `job-${idx}`;
                  const isRetrying = actionLoadingId === job.id;

                  return (
                    <tr key={key} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        <div className="flex flex-col">
                          <span>{job.job_name}</span>
                          {job.id && <span className="text-[11px] font-mono text-slate-400">ID: {job.id}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            job.queue === 'notification'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {job.queue}
                        </span>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <p className="text-xs font-mono text-red-700 line-clamp-2" title={job.failed_reason}>
                          {job.failed_reason || '—'}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                          {job.attempts_made}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600">
                        <div className="flex items-center space-x-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatFailedAt(job.failed_at)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => handleRetry(job)}
                            disabled={isRetrying || isActionInFlightRef.current}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200/80 transition-colors disabled:opacity-50"
                          >
                            <RotateCw className={`w-3.5 h-3.5 mr-1.5 ${isRetrying ? 'animate-spin' : ''}`} />
                            {isRetrying ? 'Retrying...' : 'Retry'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDiscard(job)}
                            disabled={isRetrying || isActionInFlightRef.current}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold border border-red-200/80 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                            Discard
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Discard Confirmation Modal */}
      <DiscardConfirmModal
        isOpen={discardTarget !== null}
        job={discardTarget}
        onConfirm={handleConfirmDiscard}
        onCancel={() => setDiscardTarget(null)}
        isDiscarding={isDiscarding}
      />
    </div>
  );
};
