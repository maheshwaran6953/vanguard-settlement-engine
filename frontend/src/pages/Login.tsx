import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiClientError } from '../api/errors';
import { ShieldCheck, AlertCircle, Clock } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setErrorMessage(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (countdown > 0) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const user = await login({ email: email.trim(), password });
      const targetPath =
        user.role === 'buyer' ? '/buyer' : user.role === 'platform_admin' ? '/admin' : '/supplier';
      navigate(targetPath, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 429 || err.code === 'TOO_MANY_LOGIN_ATTEMPTS' || err.code === 'TOO_MANY_REQUESTS') {
          const seconds = err.retryAfterSeconds && err.retryAfterSeconds > 0 ? err.retryAfterSeconds : 60;
          setCountdown(seconds);
          setErrorMessage(`Too many login attempts. Please wait ${seconds} seconds before trying again.`);
        } else {
          setErrorMessage(err.readableMessage);
        }
      } else {
        setErrorMessage('Failed to sign in. Please verify your connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-600 text-white shadow-md mb-3">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Vanguard Portal</h2>
        <p className="mt-1.5 text-sm text-slate-600">Enterprise SME Invoice Financing Engine</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-slate-200/80">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Sign in to your account</h3>

          {errorMessage && (
            <div
              data-testid="login-error-alert"
              className={`mb-5 p-4 rounded-xl border flex items-start space-x-3 text-sm ${
                countdown > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {countdown > 0 ? (
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-medium">{errorMessage}</p>
                {countdown > 0 && (
                  <p data-testid="countdown-timer" className="text-xs text-amber-700 mt-1 font-mono">
                    Countdown: {countdown}s remaining
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="finance@yourcompany.com"
                className="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || countdown > 0}
              className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 ${
                isSubmitting || countdown > 0
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center space-x-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Signing in...</span>
                </span>
              ) : countdown > 0 ? (
                `Locked (${countdown}s)`
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500 border-t border-slate-100 pt-5">
            Don't have an organisation account?{' '}
            <Link to="/register" className="font-semibold text-emerald-600 hover:text-emerald-700 underline">
              Register here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
