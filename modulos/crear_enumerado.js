import { createClient } from './supabase-shim.js';
import { sanitizeIdentifier, escapeSqlValue } from "./seguridad.js";

// Usar una sola instancia global de supabase
function getSupabaseInstance() {
  if (!window._supabaseInstance) {
    const { url, key } = window.getSupabaseCreds();
    if (!url || !key) {
      alert("Error: No hay credenciales de Supabase disponibles");
      return null;
    }
    window._supabaseInstance = createClient(url, key);
  }
  return window._supabaseInstance;
}

function addEnumElement() {
  const container = document.getElementById("enumElements");
  const div = document.createElement("div");
  div.className = "enumElementDef";
  div.style.cssText = "display: flex; align-items: center; margin-bottom: 8px;";
  div.innerHTML = `
    <input type="text" placeholder="Valor del enumerado" class="enumElement" required 
           style="flex: 1; margin-right: 8px; padding: 6px;">
    <button type="button" onclick="this.parentElement.remove()" 
            style="width: 28px; height: 28px; border-radius: 50%; background-color: #f44336; color: white; border: none; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; padding: 0; line-height: 1;" 
            title="Eliminar este elemento">×</button>
  `;
  container.appendChild(div);
}

document.getElementById("addEnumElementBtn").onclick = addEnumElement;

document.getElementById("formCrearEnum").onsubmit = async function(e) {
  e.preventDefault();
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  const status = document.getElementById("enumStatus");
  status.textContent = "⏳ Creando enumerado...";
  status.style.color = "orange";

  try {
    const name = sanitizeIdentifier(document.getElementById("enumName").value.trim());
    const elements = Array.from(document.querySelectorAll('.enumElement'))
      .map(el => el.value.trim())
      .filter(v => v);

    if (!name || elements.length === 0) {
      status.textContent = "⚠️ Debes indicar un nombre y al menos un elemento.";
      status.style.color = "red";
      return;
    }

    // Crear el SQL para el ENUM (se creará en schema public automáticamente)
    const sql = `CREATE TYPE ${name} AS ENUM (${elements.map(escapeSqlValue).join(', ')});`;
    const schema = window.getCurrentSchema();
    
    console.log('🔨 Creando ENUM:', sql);
    
    const { error } = await supabase.rpc('exec_create_enum', {
      p_schema: schema,
      p_query: sql
    });

    if (error) {
      console.error('❌ Error creando ENUM:', error);
      status.textContent = `❌ Error: ${error.message}`;
      status.style.color = "red";
    } else {
      status.textContent = `✅ Enumerado '${name}' creado con éxito! Recargando ENUMs...`;
      status.style.color = "green";
      
      // Recargar SOLO los ENUMs (optimizado, no recarga tablas ni columnas)
      console.log('♻️ Recargando solo ENUMs...');
      if (window.dbCache) {
        await window.dbCache.reloadEnums();
        status.textContent = `✅ Enumerado '${name}' creado y cargado correctamente!`;
      }
      
      // Limpiar formulario
      document.getElementById("enumName").value = '';
      document.getElementById("enumElements").innerHTML = '';
    }
  } catch (err) {
    console.error('❌ Excepción creando ENUM:', err);
    status.textContent = `❌ Error: ${err.message}`;
    status.style.color = "red";
  }
};

// Escuchar cambios de esquema
window.addEventListener('schema:change', () => {
  console.log('Esquema cambiado');
  document.getElementById("enumStatus").textContent = '';
});
