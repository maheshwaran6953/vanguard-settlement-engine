import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { FailedJobSummary } from '../../api/types';

export interface DiscardConfirmModalProps {
  isOpen: boolean;
  job: FailedJobSummary | null;
  onConfirm: () => void;
  onCancel: () => void;
  isDiscarding?: boolean;
}

export const DiscardConfirmModal: React.FC<DiscardConfirmModalProps> = ({
  isOpen,
  job,
  onConfirm,
  onCancel,
  isDiscarding = false,
}) => {
  if (!isOpen || !job) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
          aria-hidden="true"
          onClick={onCancel}
        />

        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-slate-200">
          <div className="bg-white p-6 sm:p-7">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
              </div>
              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold leading-6 text-slate-900" id="modal-title">
                    Discard Failed Job
                  </h3>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="text-slate-400 hover:text-slate-500 rounded-lg p-1 hover:bg-slate-100"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="mt-2">
                  <p className="text-sm text-slate-600">
                    Are you sure you want to discard this job? This will remove the job permanently from the dead-letter queue. This action cannot be undone.
                  </p>
                </div>

                <div className="mt-4 rounded-lg bg-slate-50 p-3.5 border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-500">Job ID:</span>
                    <span className="font-mono text-slate-800">{job.id || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-500">Queue:</span>
                    <span className="font-semibold text-slate-800">{job.queue}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-500">Job Name:</span>
                    <span className="font-medium text-slate-800">{job.job_name}</span>
                  </div>
                  {job.failed_reason && (
                    <div className="pt-1 border-t border-slate-200">
                      <span className="font-semibold text-slate-500 block mb-1">Reason:</span>
                      <span className="text-red-700 font-mono text-[11px] break-words line-clamp-3">
                        {job.failed_reason}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 px-6 py-4 sm:flex sm:flex-row-reverse sm:px-6 gap-3 border-t border-slate-100">
            <button
              type="button"
              disabled={isDiscarding}
              onClick={onConfirm}
              className="inline-flex w-full justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 sm:w-auto disabled:opacity-50 transition-colors"
            >
              {isDiscarding ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Discarding...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2 self-center" />
                  Confirm Discard
                </>
              )}
            </button>
            <button
              type="button"
              disabled={isDiscarding}
              onClick={onCancel}
              className="mt-3 inline-flex w-full justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 sm:mt-0 sm:w-auto transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
