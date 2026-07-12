import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exposed for manual verification in the browser console (Task 4). The anon key is
// public by design in Supabase's model — RLS policies are what protect the data.
window.supabase = supabase;
