import { supabase } from '@/integrations/supabase/client';

/**
 * Superadmin "log in as client" (Admin → Clients, click the email). The superadmin's own session is
 * kept aside (never signed out) so "Kembali ke Admin" switches straight back. While in this mode,
 * Logout returns to the admin too — it must never sign the real client out of their own devices.
 */
const KEY = 'po_admin_impersonation';

interface Impersonation {
  adminAccess: string;
  adminRefresh: string;
  adminEmail: string;
  targetEmail: string;
}

export function getImpersonation(): Impersonation | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Impersonation) : null;
  } catch {
    return null;
  }
}

export async function startImpersonation(userId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesi admin tiada — sila log masuk semula.');
  const { data, error } = await supabase.functions.invoke('admin-login-as', { body: { userId } });
  if (error) throw error;
  if (!data?.access_token || !data?.refresh_token) throw new Error(data?.error || 'Gagal log masuk sebagai client.');

  localStorage.setItem(KEY, JSON.stringify({
    adminAccess: session.access_token,
    adminRefresh: session.refresh_token,
    adminEmail: session.user?.email || '',
    targetEmail: data.email || '',
  } satisfies Impersonation));
  // Switch the stored session to the client's (the admin session is not revoked).
  const { error: setErr } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  if (setErr) {
    localStorage.removeItem(KEY);
    throw setErr;
  }
  window.location.href = '/dashboard';
}

export async function stopImpersonation(): Promise<void> {
  const imp = getImpersonation();
  localStorage.removeItem(KEY);
  // End only THIS browser's client session (local) — the client stays logged in on their devices.
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
  if (imp) {
    const { error } = await supabase.auth.setSession({ access_token: imp.adminAccess, refresh_token: imp.adminRefresh });
    if (!error) {
      window.location.href = '/dashboard/admin/clients';
      return;
    }
  }
  window.location.href = '/auth';
}
