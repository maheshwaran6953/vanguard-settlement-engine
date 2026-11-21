import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { Login } from '../pages/Login';

describe('Login 429 Countdown with Fake Timers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays countdown and locks submit button on HTTP 429, then unlocks when finished', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 429,
      ok: false,
      headers: new Headers({
        'Content-Type': 'application/json',
        'Retry-After': '5',
      }),
      json: async () => ({
        success: false,
        error: {
          code: 'TOO_MANY_LOGIN_ATTEMPTS',
          message: 'Too many attempts',
          retry_after_seconds: 5,
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>,
    );

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole('button', { name: /Sign In/i });

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });

    await act(async () => {
      fireEvent.click(submitButton);
    });

    // Verify countdown alert is displayed
    expect(screen.getByTestId('login-error-alert')).toBeInTheDocument();
    expect(screen.getByText(/Countdown: 5s remaining/i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveTextContent(/Locked \(5s\)/i);

    // Fast-forward 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText(/Countdown: 3s remaining/i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent(/Locked \(3s\)/i);
    expect(screen.getByRole('button')).toBeDisabled();

    // Fast-forward remaining 3 seconds (total 5s)
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Alert cleared and button re-enabled
    expect(screen.queryByTestId('countdown-timer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeEnabled();
  });
});
