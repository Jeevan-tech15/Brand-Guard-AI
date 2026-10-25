import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabaseServerClient(): SupabaseClient | null {
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
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
  missingVars: string[];
} {
  const hasUrl = Boolean(supabaseUrl);
  const hasServiceKey = Boolean(serviceRoleKey);
  const missingVars: string[] = [];

  if (!hasUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!hasServiceKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY');

  return {
    isConfigured: hasUrl && hasServiceKey,
    hasUrl,
    hasServiceKey,
    missingVars,
  };
}
