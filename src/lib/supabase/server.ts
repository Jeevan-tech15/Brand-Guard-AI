import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const rawServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const effectiveKey = rawServiceRoleKey || rawAnonKey;

export function getSupabaseServerClient(): SupabaseClient | null {
  if (!supabaseUrl || !effectiveKey) {
    return null;
  }

  return createClient(supabaseUrl, effectiveKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getServerDbConfigStatus(): {
  isConfigured: boolean;
  hasUrl: boolean;
  hasServiceKey: boolean;
  hasAnonKey: boolean;
  missingVars: string[];
} {
  const hasUrl = Boolean(supabaseUrl);
  const hasServiceKey = Boolean(rawServiceRoleKey);
  const hasAnonKey = Boolean(rawAnonKey);
  const missingVars: string[] = [];

  if (!hasUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!hasServiceKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY');

  return {
    isConfigured: hasUrl && (hasServiceKey || hasAnonKey),
    hasUrl,
    hasServiceKey,
    hasAnonKey,
    missingVars,
  };
}
