'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Github, Mail, Loader2, AlertCircle } from 'lucide-react';
import { LogoWithTagline } from '@/components/logo';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setIsLoading(false);
      return;
    }

    try {
      // Call Next.js API route which sets the auth cookie
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      const user = data.user;

      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      // Store user info in localStorage
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('userId', user.id);

      // Redirect to profile setup after successful registration
      router.push('/profile-setup');
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Email may already exist.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/50 to-slate-100 p-4 md:p-6">
      <div className="pointer-events-none absolute -top-20 -left-14 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-blue-200/35 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-200/20 blur-3xl" />

      <Card className="group relative z-10 w-full max-w-md rounded-2xl border border-white/80 bg-white/80 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-primary/10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/60 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-100" />

        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <LogoWithTagline size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mt-4">Create an account</h1>
          <p className="text-muted-foreground mt-2">Get started with Arth-Mitra</p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-sm flex items-center gap-2 animate-in fade-in-0 duration-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* OAuth Buttons */}
        <div className="space-y-3 mb-6">
          <Button
            variant="outline"
            className="group relative w-full h-11 overflow-hidden rounded-xl border-border/60 bg-white/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-300/60 hover:shadow-lg hover:shadow-blue-200/40 active:translate-y-0 active:scale-[0.99]"
            onClick={() => (window.location.href = '/api/auth/google')}
          >
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-red-100/50 via-yellow-100/45 to-blue-100/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <span className="relative z-10 flex items-center">
              <svg className="w-5 h-5 mr-2 text-slate-700 transition-colors duration-300 group-hover:text-blue-700" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </span>
          </Button>

          <Button
            variant="outline"
            className="group relative w-full h-11 overflow-hidden rounded-xl border-border/60 bg-white/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-300/55 hover:shadow-lg hover:shadow-slate-300/40 active:translate-y-0 active:scale-[0.99]"
            onClick={() => (window.location.href = '/api/auth/github')}
          >
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-200/45 via-indigo-100/40 to-blue-100/45 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <span className="relative z-10 flex items-center">
              <Github className="w-5 h-5 mr-2 text-slate-700 transition-colors duration-300 group-hover:text-indigo-700" />
              Continue with GitHub
            </span>
          </Button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white/80 px-2 text-muted-foreground">
              Or register with email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Full Name
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              className="h-11 rounded-xl border-border/60 bg-white/70 transition-all duration-300 hover:border-blue-300/40 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 rounded-xl border-border/60 bg-white/70 transition-all duration-300 hover:border-blue-300/40 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              className="h-11 rounded-xl border-border/60 bg-white/70 transition-all duration-300 hover:border-blue-300/40 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Confirm Password
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="********"
              className="h-11 rounded-xl border-border/60 bg-white/70 transition-all duration-300 hover:border-blue-300/40 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-border/60 text-primary focus:ring-2 focus:ring-primary/25"
            />
            <label htmlFor="remember-me" className="text-sm text-muted-foreground select-none cursor-pointer">
              Remember me
            </label>
          </div>

          <Button type="submit" className="w-full h-11 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-primary-foreground transition-all duration-300 hover:-translate-y-0.5 hover:from-blue-600 hover:to-primary hover:shadow-lg hover:shadow-primary/25 active:translate-y-0 active:scale-[0.99]" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating account...
              </>
            ) : (
              <>
                <Mail className="w-4 h-4 mr-2" />
                Create Account
              </>
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium transition-colors hover:text-primary/80">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
