import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiClientError } from '../api/errors';
import { Building2, AlertCircle } from 'lucide-react';

export const Register: React.FC = () => {
  const [role, setRole] = useState<'supplier' | 'buyer'>('supplier');
  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validation matching backend auth.schemas.ts
    // legal_name: z.string().min(2).max(200).trim()
    if (legalName.trim().length < 2) {
      setErrorMessage('Legal name must be at least 2 characters long.');
      return;
    }

    // Suppliers require GSTIN (15 characters)
    const trimmedGstin = gstin.trim().toUpperCase();
    if (role === 'supplier' && trimmedGstin.length !== 15) {
      setErrorMessage('GSTIN is required for suppliers and must be exactly 15 characters long.');
      return;
    }
    if (trimmedGstin.length > 0 && trimmedGstin.length !== 15) {
      setErrorMessage('GSTIN must be exactly 15 characters long if provided.');
      return;
    }

    // password: z.string().min(8)
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);

    try {
      const user = await register({
        role,
        legal_name: legalName.trim(),
        gstin: trimmedGstin || undefined,
        email: email.trim(),
        password,
      });

      // Per Change 1: automatically navigate to role dashboard
      const targetPath = user.role === 'buyer' ? '/buyer' : '/supplier';
      navigate(targetPath, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.readableMessage);
      } else {
        setErrorMessage('Failed to register organisation. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-600 text-white shadow-md mb-3">
          <Building2 className="w-7 h-7" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Register Organisation</h2>
        <p className="mt-1.5 text-sm text-slate-600">Join the Vanguard SME Settlement Platform</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-slate-200/80">
          {errorMessage && (
            <div className="mb-5 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-3 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <p className="font-medium">{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Organisation Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('supplier')}
                  className={`py-2 px-3 rounded-lg text-sm font-semibold border text-center transition ${
                    role === 'supplier'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Supplier (SME)
                </button>
                <button
                  type="button"
                  onClick={() => setRole('buyer')}
                  className={`py-2 px-3 rounded-lg text-sm font-semibold border text-center transition ${
                    role === 'buyer'
                      ? 'bg-sky-50 border-sky-500 text-sky-800 ring-2 ring-sky-500/20'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Buyer (Enterprise)
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="legal_name" className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Legal Organisation Name
              </label>
              <input
                id="legal_name"
                type="text"
                required
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Acme Technologies Pvt Ltd"
                className="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="gstin" className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                GSTIN {role === 'supplier' ? '(Required)' : '(Optional)'}
              </label>
              <input
                id="gstin"
                type="text"
                maxLength={15}
                required={role === 'supplier'}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="27AABCU9603R1ZM"
                className="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Work Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="finance@acme.com"
                className="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Password (min. 8 characters)
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 ${
                isSubmitting ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isSubmitting ? 'Registering...' : 'Register Organisation'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500 border-t border-slate-100 pt-5">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-emerald-600 hover:text-emerald-700 underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
