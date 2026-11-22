import { createClient } from '@supabase/supabase-js';

// Project invernadero-auth. The publishable key is public by design: access is
// enforced by RLS in Supabase and by the API guard.
const SUPABASE_URL = 'https://zitimtwdiuenycgrlftp.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_eeAbaX1DQhTlRDUx_9Ofiw_eGFNNtJ3';

export const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY);
