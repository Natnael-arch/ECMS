'use client';
import React, { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await authClient.signIn.email({ email, password });

    if (error) {
      setError('Invalid credentials');
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  };

  const demoAccounts = [
    { role: 'Project Manager', email: 'pm@ecms.app', pass: 'demo1234' },
    { role: 'Site Supervisor', email: 'supervisor@ecms.app', pass: 'demo1234' },
    { role: 'Storekeeper', email: 'store@ecms.app', pass: 'demo1234' },
  ];

  return (
    <div className="min-h-screen bg-ecms-bg flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[420px] flex flex-col items-center">
        <Logo variant="full" className="mb-4 scale-[1.4]" />
        <p className="text-ecms-muted text-sm mb-8 text-center">Built for construction. Designed for control.</p>
        
        <div className="bg-ecms-card border border-ecms-border w-full rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {error && (
              <div className="bg-ecms-danger/10 text-ecms-danger text-sm p-3 rounded-lg border border-ecms-danger/20 text-center">
                {error}
              </div>
            )}
            
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-ecms-muted font-medium">Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-ecms-elevated border border-ecms-border-strong rounded-lg px-4 py-2.5 text-ecms-text focus:outline-none focus:border-ecms-amber transition-colors"
                placeholder="Enter your email"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-ecms-muted font-medium">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-ecms-elevated border border-ecms-border-strong rounded-lg px-4 py-2.5 text-ecms-text focus:outline-none focus:border-ecms-amber transition-colors"
                placeholder="Enter your password"
                required
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="mt-4 w-full bg-ecms-amber text-ecms-navy font-bold py-2.5 rounded-lg hover:bg-opacity-90 transition-all disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-ecms-border">
            <p className="text-xs text-ecms-muted mb-3 uppercase tracking-wider font-semibold text-center">
              Demo accounts — click to autofill
            </p>
            <div className="flex flex-col gap-2">
              {demoAccounts.map(acc => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => { setEmail(acc.email); setPassword(acc.pass); }}
                  className="flex justify-between items-center text-xs p-2.5 rounded-md hover:bg-ecms-elevated border border-transparent hover:border-ecms-border-strong transition-all text-left"
                >
                  <span className="text-ecms-text font-medium">{acc.role}</span>
                  <span className="text-ecms-muted">{acc.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
