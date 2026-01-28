/**
 * authSupabase.js
 * - Única responsabilidad: autenticar colaborador con Supabase
 * - No mezclar con Firebase
 * - Exporta una función authenticateSupabase(url, key, email, password)
 */
export async function authenticateSupabase(url, key, email, password) {
  try {
  // Use the local shim which re-exports an ESM build from a CDN.
  const { createClient } = await import('./supabase-shim.js');
  const supabase = createClient(url, key);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, error };
    }
    if (!data || !data.session) {
      return { success: false, error: new Error('No se pudo establecer sesión') };
    }
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err };
  }
}

export default { authenticateSupabase };
