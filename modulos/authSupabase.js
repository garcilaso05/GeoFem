// Módulo mínimo para autenticar colaboradores en la ventana separada (collab_login.html)
// NO mezcla lógica con Firebase. Solo expone una función que el popup puede usar.
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_PUBLIC = {
  url: 'https://rroritvsvpabpkjtiskq.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyb3JpdHZzdnBhYnBranRpc2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDg2MDgsImV4cCI6MjA3NzMyNDYwOH0.kkK1B5kjo1NLHwvU_Tpu4jqtO1k5ctokuoWzSpZGeDI'
};

export async function authenticateCollaborator(email, password) {
  try {
    const supabase = createClient(SUPABASE_PUBLIC.url, SUPABASE_PUBLIC.key);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, message: error.message || 'Auth error' };
    }
    if (!data || !data.session) {
      return { success: false, message: 'No se pudo establecer sesión' };
    }
    // No persistimos nada en el opener: el popup notificará al opener vía postMessage
    return { success: true, email };
  } catch (err) {
    console.error('authSupabase: error', err);
    return { success: false, message: err.message || 'Error de autenticación' };
  }
}

export default { authenticateCollaborator };
