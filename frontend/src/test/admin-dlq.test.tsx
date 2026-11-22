import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlatformAdminDashboard, formatFailedAt } from '../pages/dashboards/PlatformAdminDashboard';
import { AuthProvider } from '../context/AuthContext';
import { VSE_STORAGE_KEYS } from '../api/client';
import { ApiClientError } from '../api/errors';
import * as adminApi from '../api/admin';
import { FailedJobSummary } from '../api/types';

describe('Admin Dead-Letter Queue Dashboard', () => {
  const sampleJobNotification: FailedJobSummary = {
    id: 'job-notify-101',
    queue: 'notification',
    job_name: 'invoice-approved',
    failed_reason: 'connect ECONNREFUSED 127.0.0.1:1025',
    attempts_made: 3,
    failed_at: 1732279200000,
    payload: {
      invoice_id: 'inv-test-111',
      supplier_email: 'supplier@example.com',
      canary_marker: 'CANARY_PAYLOAD_MARKER_NOT_FOR_DOM',
    },
  };

  const sampleJobDocument: FailedJobSummary = {
    id: 'job-doc-202',
    queue: 'document',
    job_name: 'settlement-receipt-pdf',
    failed_reason: 'PDF generation failed: timeout',
    attempts_made: 2,
    failed_at: 1732282800000,
    payload: {
      invoice_id: 'inv-test-222',
      buyer_id: 'buyer-org-222',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(VSE_STORAGE_KEYS.TOKEN, 'mock-admin-token');
    localStorage.setItem(VSE_STORAGE_KEYS.ROLE, 'platform_admin');
    localStorage.setItem(VSE_STORAGE_KEYS.ORG_ID, 'admin-org-000');
    localStorage.setItem(VSE_STORAGE_KEYS.LEGAL_NAME, 'Vanguard Platform Administration');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function renderAdminDashboard() {
    return render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route path="/admin" element={<PlatformAdminDashboard />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  // 1. Header & Metrics
  it('renders platform admin header with legal name and failed jobs count metric', async () => {
    vi.spyOn(adminApi, 'getFailedJobs').mockResolvedValue({
      count: 2,
      jobs: [sampleJobNotification, sampleJobDocument],
    });

    renderAdminDashboard();

    expect(await screen.findByText(/Platform Admin Console — Vanguard Platform Administration/i)).toBeInTheDocument();
    expect(screen.getByTestId('failed-jobs-count')).toHaveTextContent('2');
  });

  // 2. Empty State
  it('renders empty state with message \'No failed background jobs.\' when authorized and queue is clean', async () => {
    vi.spyOn(adminApi, 'getFailedJobs').mockResolvedValue({
      count: 0,
      jobs: [],
    });

    renderAdminDashboard();

    expect(await screen.findByText('No failed background jobs.')).toBeInTheDocument();
    expect(screen.getByText(/All background workers in notification and document queues are operating normally/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // 3. Access Restricted
  it('renders access restricted message and does not render table when caller lacks platform_admin role or receives 403', async () => {
    // Return real backend 403 body: { success: false, error: { code: 'FORBIDDEN', message: "Role 'buyer' is not permitted to perform this action" } }
    vi.spyOn(adminApi, 'getFailedJobs').mockRejectedValue(
      new ApiClientError(
        'FORBIDDEN',
        "Role 'buyer' is not permitted to perform this action",
        403,
        undefined,
        undefined,
        "Role 'buyer' is not permitted to perform this action"
      )
    );

    renderAdminDashboard();

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
    expect(screen.getByText("Role 'buyer' is not permitted to perform this action")).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // 4. Data Table
  it('renders failed jobs table with job name, queue badge, failure reason, and attempts', async () => {
    vi.spyOn(adminApi, 'getFailedJobs').mockResolvedValue({
      count: 1,
      jobs: [sampleJobNotification],
    });

    renderAdminDashboard();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('invoice-approved')).toBeInTheDocument();
    expect(screen.getByText('notification')).toBeInTheDocument();
    expect(screen.getByText('connect ECONNREFUSED 127.0.0.1:1025')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  // 5. Timestamp formatting from epoch ms
  it('formats failed_at timestamp correctly from millisecond epoch value', () => {
    const epoch = 1732279200000;
    const formatted = formatFailedAt(epoch);
    expect(formatted).toBe(new Date(epoch).toLocaleString('en-IN'));
  });

  // 6. Timestamp fallback to dash for invalid/undefined
  it('displays dash \'—\' when failed_at timestamp is undefined or not a finite number', async () => {
    expect(formatFailedAt(undefined)).toBe('—');
    expect(formatFailedAt(null)).toBe('—');
    expect(formatFailedAt(NaN)).toBe('—');
    expect(formatFailedAt(Infinity)).toBe('—');
    expect(formatFailedAt(-Infinity)).toBe('—');

    const jobWithUndefinedTime: FailedJobSummary = {
      ...sampleJobNotification,
      id: 'job-no-time',
      failed_at: undefined,
    };

    vi.spyOn(adminApi, 'getFailedJobs').mockResolvedValue({
      count: 1,
      jobs: [jobWithUndefinedTime],
    });

    renderAdminDashboard();

    await screen.findByRole('table');
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/i)).not.toBeInTheDocument();
  });

  // 7. 30s Polling Setup and Cleanup
  it('sets up 30-second polling interval and clears interval on unmount', async () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

    const getJobsMock = vi.spyOn(adminApi, 'getFailedJobs').mockResolvedValue({
      count: 1,
      jobs: [sampleJobNotification],
    });

    const { unmount } = renderAdminDashboard();

    // Allow mount microtasks to flush
    await act(async () => {
      await Promise.resolve();
    });

    // Initial mount call
    expect(getJobsMock).toHaveBeenCalledTimes(1);

    // Fast-forward 30 seconds
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(getJobsMock).toHaveBeenCalledTimes(2);

    // Fast-forward another 30 seconds
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(getJobsMock).toHaveBeenCalledTimes(3);

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  // 8. Auto-refresh skip when action in flight
  it('skips 30-second auto-refresh when a retry or discard action is in flight', async () => {
    vi.useFakeTimers();

    const getJobsMock = vi.spyOn(adminApi, 'getFailedJobs').mockResolvedValue({
      count: 1,
      jobs: [sampleJobNotification],
    });

    let resolveRetryPromise: (val: any) => void;
    const retryPromise = new Promise((resolve) => {
      resolveRetryPromise = resolve;
    });

    vi.spyOn(adminApi, 'retryFailedJob').mockReturnValue(retryPromise as any);

    renderAdminDashboard();

    await act(async () => {
      await Promise.resolve();
    });

    expect(getJobsMock).toHaveBeenCalledTimes(1);

    // Trigger retry to set isActionInFlightRef.current = true
    const retryButton = screen.getByRole('button', { name: /retry/i });
    await act(async () => {
      fireEvent.click(retryButton);
    });

    // Now an action is in flight. Advance timers by 30 seconds.
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    // Auto-refresh must have been SKIPPED, so getFailedJobs is still called only 1 time
    expect(getJobsMock).toHaveBeenCalledTimes(1);

    // Now resolve retry action
    await act(async () => {
      resolveRetryPromise!({ success: true, message: 'Queued for retry' });
      await Promise.resolve();
    });

    // After action resolves, it re-fetches once to refresh list
    expect(getJobsMock).toHaveBeenCalledTimes(2);

    // Subsequent 30s timer triggers normally again
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(getJobsMock).toHaveBeenCalledTimes(3);
  });

  // 9. Retry action submission & list refresh
  it('submits retry request for failed job and refreshes job list on success', async () => {
    const getJobsMock = vi.spyOn(adminApi, 'getFailedJobs')
      .mockResolvedValueOnce({
        count: 1,
        jobs: [sampleJobNotification],
      })
      .mockResolvedValueOnce({
        count: 0,
        jobs: [],
      });

    const retryMock = vi.spyOn(adminApi, 'retryFailedJob').mockResolvedValue({
      success: true,
      message: 'Job job-notify-101 in queue notification queued for retry',
    });

    renderAdminDashboard();

    expect(await screen.findByRole('table')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    expect(retryMock).toHaveBeenCalledWith('notification', 'job-notify-101');
    expect(await screen.findByText('Job job-notify-101 in queue notification queued for retry')).toBeInTheDocument();
    expect(getJobsMock).toHaveBeenCalledTimes(2);
  });

  // 10. Retry 400 Bad Request error verbatim display
  it('displays server error message exactly as returned when retry returns 400 BAD_REQUEST', async () => {
    vi.spyOn(adminApi, 'getFailedJobs').mockResolvedValue({
      count: 1,
      jobs: [sampleJobNotification],
    });

    const serverErrorMessage = 'Job job-notify-101 not found in queue notification';
    vi.spyOn(adminApi, 'retryFailedJob').mockRejectedValue(
      new ApiClientError('BAD_REQUEST', serverErrorMessage, 400, undefined, undefined, serverErrorMessage)
    );

    renderAdminDashboard();

    expect(await screen.findByRole('table')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    expect(await screen.findByText(serverErrorMessage)).toBeInTheDocument();
  });

  // 11. Discard 400 Bad Request error verbatim display
  it('displays server error message exactly as returned when discard returns 400 BAD_REQUEST', async () => {
    vi.spyOn(adminApi, 'getFailedJobs').mockResolvedValue({
      count: 1,
      jobs: [sampleJobNotification],
    });

    const serverErrorMessage = 'Cannot discard job while currently active';
    vi.spyOn(adminApi, 'discardFailedJob').mockRejectedValue(
      new ApiClientError('BAD_REQUEST', serverErrorMessage, 400, undefined, undefined, serverErrorMessage)
    );

    renderAdminDashboard();

    expect(await screen.findByRole('table')).toBeInTheDocument();

    const discardBtn = screen.getByRole('button', { name: /discard/i });
    fireEvent.click(discardBtn);

    // Modal opens
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /confirm discard/i });
    fireEvent.click(confirmBtn);

    expect(await screen.findByText(serverErrorMessage)).toBeInTheDocument();
  });

  // 12. Discard confirmation dialog cancel behavior
  it('opens confirmation dialog before discarding a failed job', async () => {
    vi.spyOn(adminApi, 'getFailedJobs').mockResolvedValue({
      count: 1,
      jobs: [sampleJobNotification],
    });

    const discardMock = vi.spyOn(adminApi, 'discardFailedJob');

    renderAdminDashboard();

    expect(await screen.findByRole('table')).toBeInTheDocument();

    const discardBtn = screen.getByRole('button', { name: /discard/i });
    fireEvent.click(discardBtn);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to discard this job\?/i)).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    expect(discardMock).not.toHaveBeenCalled();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  // 13. Discard confirmation and refresh
  it('submits discard request upon confirmation and refreshes job list', async () => {
    const getJobsMock = vi.spyOn(adminApi, 'getFailedJobs')
      .mockResolvedValueOnce({
        count: 1,
        jobs: [sampleJobNotification],
      })
      .mockResolvedValueOnce({
        count: 0,
        jobs: [],
      });

    const discardMock = vi.spyOn(adminApi, 'discardFailedJob').mockResolvedValue({
      success: true,
      message: 'Job job-notify-101 discarded from queue notification',
    });

    renderAdminDashboard();

    expect(await screen.findByRole('table')).toBeInTheDocument();

    const discardBtn = screen.getByRole('button', { name: /discard/i });
    fireEvent.click(discardBtn);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /confirm discard/i });
    fireEvent.click(confirmBtn);

    expect(discardMock).toHaveBeenCalledWith('notification', 'job-notify-101');
    expect(await screen.findByText('Job job-notify-101 discarded from queue notification')).toBeInTheDocument();
    expect(getJobsMock).toHaveBeenCalledTimes(2);
  });

  // 14. Network error on initial fetch shows retry button
  it('displays error banner with retry button when initial fetch encounters network failure', async () => {
    const getJobsMock = vi.spyOn(adminApi, 'getFailedJobs')
      .mockRejectedValueOnce(new Error('Network connection failure'))
      .mockResolvedValueOnce({
        count: 1,
        jobs: [sampleJobNotification],
      });

    renderAdminDashboard();

    expect(await screen.findByText('Network connection failure')).toBeInTheDocument();
    const retryConnBtn = screen.getByRole('button', { name: /retry connection/i });
    expect(retryConnBtn).toBeInTheDocument();

    fireEvent.click(retryConnBtn);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(getJobsMock).toHaveBeenCalledTimes(2);
  });

  // 15. Canary marker in raw payload is NEVER rendered in DOM
  it('asserts raw job payload content does not appear in the DOM using a fixture marker', async () => {
    const secretMarker = 'CANARY_PAYLOAD_MARKER_NOT_FOR_DOM';
    vi.spyOn(adminApi, 'getFailedJobs').mockResolvedValue({
      count: 1,
      jobs: [sampleJobNotification],
    });

    renderAdminDashboard();

    expect(await screen.findByRole('table')).toBeInTheDocument();

    expect(screen.queryByText(new RegExp(secretMarker))).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(secretMarker);
  });
});
