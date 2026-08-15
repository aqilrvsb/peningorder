import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Lock, Mail, Bot } from 'lucide-react';

const Auth: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  // Prefill email when redirected here from checkout (e.g. "email already exists").
  useEffect(() => {
    const prefill = searchParams.get('email');
    if (prefill) setEmail(prefill);
  }, [searchParams]);

  const paymentState = searchParams.get('payment'); // 'success' | 'pending' after checkout

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!email.trim() || !password.trim()) {
      toast({ title: 'Validation Error', description: 'Email and password required', variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    try {
      // Staff log in with their ID staff (no @) → mapped to a synthetic email.
      const raw = email.trim();
      const loginEmail = raw.includes('@')
        ? raw.toLowerCase()
        : `${raw.toLowerCase().replace(/[^a-z0-9-]/g, '')}@staff.peningorder.local`;
      const { error } = await signIn(loginEmail, password);
      if (error) {
        toast({ title: 'Login Failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Welcome back!', description: 'Signed in successfully.' });
        navigate('/dashboard');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Unexpected error', variant: 'destructive' });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4">
            <Bot className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold">
            <span className="text-primary">Pening</span>
            <span className="text-foreground">Order</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            All-in-one order manager for individual sellers
          </p>
        </div>

        <div className="bg-card rounded-2xl shadow-lg border border-border p-8">
          <h2 className="text-xl font-bold text-foreground mb-1">Sign In</h2>
          <p className="text-muted-foreground text-sm mb-6">Welcome back! Sign in to your business.</p>

          {paymentState === 'success' && (
            <div className="mb-6 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
              ✅ Pembayaran berjaya! Kami dah hantar <span className="font-semibold">email & password login</span> ke WhatsApp anda. Guna untuk log masuk di bawah.
            </div>
          )}
          {paymentState === 'pending' && (
            <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              ⏳ Akaun anda dah dibuat. Login & password akan dihantar ke WhatsApp anda sebaik pendaftaran anda diluluskan.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email atau ID Staff</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="text"
                  placeholder="you@email.com atau PO-XXXX-1"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-11"
                  required
                  minLength={6}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-11 mt-2" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-sm text-muted-foreground">Belum ada akaun? </span>
            <Link to="/#pricing" className="text-sm text-primary font-medium hover:underline">
              Pilih pelan &amp; daftar
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
