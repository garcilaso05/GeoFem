import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { sanitizeIdentifier } from "./seguridad.js";

function getSupabaseInstance() {
  // 1. Si ya existe una instancia global (posiblemente autenticada), usarla
  if (window._supabaseInstance) {
    return window._supabaseInstance;
  }
  
  // 2. Si no existe, crear nueva instancia con credenciales públicas
  const { url, key } = window.getSupabaseCreds();
  if (!url || !key) {
    alert("Error: No hay credenciales de Supabase disponibles");
    return null;
  }
  
  // 3. Crear cliente con ANON KEY
  // Si el usuario está autenticado, Supabase recupera automáticamente el JWT de localStorage
  window._supabaseInstance = createClient(url, key);
  
  return window._supabaseInstance;
}

async function cargarTablas() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  const select = document.getElementById("editTableSelect");
  select.innerHTML = '<option value="">Selecciona una tabla...</option>';
  const schema = window.getCurrentSchema();
  const { data, error } = await supabase.rpc(`${schema}_get_public_tables`);
  if (error || !data) {
    console.error("Error completo:", error);
    return;
  }
  data.forEach(row => {
    const opt = document.createElement("option");
    opt.value = row.table_name;
    opt.textContent = row.table_name;
    select.appendChild(opt);
  });
}

async function cargarCamposTabla(tabla) {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  
  const container = document.getElementById("editFieldsContainer");
  const addFieldBtn = document.getElementById("addFieldBtn");
  
  container.innerHTML = '';
  container.style.display = 'none';
  addFieldBtn.disabled = true;
  
  if (!tabla) {
    console.log('No hay tabla seleccionada');
    return;
  }
  
  console.log('Cargando columnas para tabla:', tabla);
  
  try {
    const schema = window.getCurrentSchema();
    const { data, error } = await supabase.rpc(`${schema}_get_table_columns`, { tabla });
    
    if (error) {
      console.error('Error con get_table_columns:', error);
      throw new Error(`Error obteniendo columnas: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      container.innerHTML = '<p style="color: orange;">No se encontraron columnas para esta tabla.</p>';
      container.style.display = 'block';
      return;
    }
    
    console.log('Columnas obtenidas:', data);
    
    // Crear elementos para cada columna
    data.forEach(col => {
      const div = document.createElement('div');
      div.className = 'editFieldRow';
      div.style.marginBottom = '10px';
      div.style.padding = '10px';
      div.style.border = '1px solid #ddd';
      div.style.borderRadius = '4px';
      
      const columnName = col.column_name;
      const dataType = col.data_type;
      const maxLength = col.character_maximum_length;
      const fkComment = col.fk_comment || '';
      const isPrimary = col.is_primary;
      
      // Mostrar tipo con longitud si existe
      let typeDisplay = dataType;
      if (maxLength) {
        typeDisplay += `(${maxLength})`;
      }
      
      // Agregar comentario de FK si existe
      if (fkComment) {
        typeDisplay += ` - ${fkComment}`;
      }
      
      div.innerHTML = `
        <div style="margin-bottom: 8px;">
          <input type="text" value="${columnName}" class="editFieldName" data-original="${columnName}" 
                 style="margin-right: 10px; padding: 4px; width: 150px;" />
          <span style="color:#888; margin-right: 10px; font-size: 12px;">${typeDisplay}</span>
          <button type="button" class="renameFieldBtn btn-secondary" style="margin-right: 5px; padding: 4px 8px;">Renombrar</button>
          <button type="button" class="deleteFieldBtn btn-primary" style="background-color: #f44336; padding: 4px 8px;">Borrar</button>
          ${isPrimary ? '<span style="color: #4CAF50; font-weight: bold; margin-left: 10px;">PK</span>' : ''}
          ${fkComment ? '<span style="color: #2196F3; font-weight: bold; margin-left: 5px;">FK</span>' : ''}
        </div>
      `;
      
      if (isPrimary) {
        const deleteBtn = div.querySelector('.deleteFieldBtn');
        deleteBtn.disabled = true;
        deleteBtn.title = 'No se puede borrar la clave primaria';
        deleteBtn.style.opacity = '0.5';
      }
      
      container.appendChild(div);
    });
    
    // Mostrar contenedor y habilitar botón
    container.style.display = 'block';
    addFieldBtn.disabled = false;
    
    console.log('Columnas cargadas exitosamente');
    
  } catch (err) {
    console.error('Error cargando columnas:', err);
    container.innerHTML = `<p style="color:red;">Error obteniendo columnas: ${err.message}</p>`;
    container.style.display = 'block';
  }
}

async function renombrarCampo(tabla, oldName, newName) {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  try {
    const schema = window.getCurrentSchema();
    const { error } = await supabase.rpc(`${schema}_alter_table_safe`, {
      tabla,
      alter_sql: `RENAME COLUMN ${sanitizeIdentifier(oldName)} TO ${sanitizeIdentifier(newName)}`
    });
    if (error) throw error;
    mostrarMsg('Campo renombrado con éxito', 'green');
    cargarCamposTabla(tabla);
  } catch (err) {
    mostrarMsg('Error renombrando campo: ' + err.message, 'red');
  }
}

async function borrarCampo(tabla, colName) {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  try {
    const schema = window.getCurrentSchema();
    const { error } = await supabase.rpc(`${schema}_alter_table_safe`, {
      tabla,
      alter_sql: `DROP COLUMN ${sanitizeIdentifier(colName)}`
    });
    if (error) throw error;
    mostrarMsg('Campo borrado con éxito', 'green');
    cargarCamposTabla(tabla);
  } catch (err) {
    mostrarMsg('Error borrando campo: ' + err.message, 'red');
  }
}

async function borrarTabla(tabla) {
  if (!confirm('¿Seguro que quieres borrar la tabla? Esta acción es irreversible.')) return;
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  try {
    const schema = window.getCurrentSchema();
    const { error } = await supabase.rpc(`${schema}_drop_table_safe`, { tabla });
    if (error) throw error;
    mostrarMsg('Tabla borrada con éxito', 'green');
    cargarTablas();
    document.getElementById("editFieldsContainer").innerHTML = '';
  } catch (err) {
    mostrarMsg('Error borrando tabla: ' + err.message, 'red');
  }
}

async function anadirCampo(tabla) {
  if (document.getElementById('addFieldForm')) return;
  const container = document.getElementById("editFieldsContainer");
  const formDiv = document.createElement('div');
  formDiv.id = 'addFieldForm';
  formDiv.style.margin = '10px 0';
  
  const tablasExistentes = await (async () => {
    const supabase = getSupabaseInstance();
    if (!supabase) return [];
    const schema = window.getCurrentSchema();
    const { data, error } = await supabase.rpc(`${schema}_get_public_tables`);
    if (error || !data) return [];
    return data.map(row => row.table_name);
  })();
  
  // Tipos de datos
  const tipos = [
    { value: "INT", label: "Entero" },
    { value: "DECIMAL", label: "Número con decimales" },
    { value: "VARCHAR(25)", label: "Texto corto (25)" },
    { value: "VARCHAR(50)", label: "Texto medio (50)" },
    { value: "VARCHAR(255)", label: "Texto grande (255)" },
    { value: "BOOLEAN", label: "Booleano" },
    { value: "REFERENCIA", label: "Referencia a..." }
  ];
  // Formulario
  formDiv.innerHTML = `
    <input type="text" id="newFieldName" placeholder="Nombre del campo" style="width:140px;" />
    <select id="newFieldType"></select>
    <span id="refTableContainer" style="display:none;"><select id="newRefTable"></select></span>
    <button id="confirmAddFieldBtn">Añadir</button>
    <button id="cancelAddFieldBtn">Cancelar</button>
  `;
  // Rellenar tipos
  const typeSelect = formDiv.querySelector('#newFieldType');
  tipos.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    typeSelect.appendChild(o);
  });
  // Rellenar tablas para referencias
  const refSelect = formDiv.querySelector('#newRefTable');
  tablasExistentes.forEach(tablaRef => {
    const o = document.createElement('option');
    o.value = tablaRef;
    o.textContent = tablaRef;
    refSelect.appendChild(o);
  });
  // Mostrar/ocultar selector de tabla de referencia
  typeSelect.addEventListener('change', function() {
    if (typeSelect.value === "REFERENCIA") {
      formDiv.querySelector('#refTableContainer').style.display = '';
    } else {
      formDiv.querySelector('#refTableContainer').style.display = 'none';
    }
  });
  // Confirmar añadir campo
  formDiv.querySelector('#confirmAddFieldBtn').onclick = async function() {
    const nombre = formDiv.querySelector('#newFieldName').value.trim();
    let tipo = typeSelect.value;
    if (!nombre) return mostrarMsg('Introduce un nombre de campo', 'red');
    let alterSql;
    if (tipo === 'REFERENCIA') {
      const refTable = refSelect.value;
      if (!refTable) return mostrarMsg('Selecciona la tabla a referenciar', 'red');
      tipo = 'INT';
      alterSql = `ADD COLUMN ${sanitizeIdentifier(nombre)} ${tipo} REFERENCES ${sanitizeIdentifier(refTable)}(id)`;
    } else {
      alterSql = `ADD COLUMN ${sanitizeIdentifier(nombre)} ${tipo}`;
    }
    const supabase = getSupabaseInstance();
    if (!supabase) return;
    try {
      const schema = window.getCurrentSchema();
      const { error } = await supabase.rpc(`${schema}_alter_table_safe`, {
        tabla,
        alter_sql: alterSql
      });
      if (error) throw error;
      mostrarMsg('Campo añadido con éxito', 'green');
      cargarCamposTabla(tabla);
      formDiv.remove();
    } catch (err) {
      mostrarMsg('Error añadiendo campo: ' + err.message, 'red');
    }
  };
  // Cancelar
  formDiv.querySelector('#cancelAddFieldBtn').onclick = function() {
    formDiv.remove();
  };
  container.appendChild(formDiv);
}

function mostrarMsg(msg, color) {
  const el = document.getElementById('editTableMsg');
  el.textContent = msg;
  el.style.color = color;
  setTimeout(() => { el.textContent = ''; }, 3000);
}

function setupEditarTablaListeners() {
  cargarTablas();
  const select = document.getElementById("editTableSelect");
  select.onchange = () => {
    console.log('Tabla seleccionada:', select.value);
    cargarCamposTabla(select.value);
  };
  document.getElementById("addFieldBtn").onclick = () => {
    const tabla = select.value;
    if (tabla) anadirCampo(tabla);
  };
  document.getElementById("deleteTableBtn").onclick = () => {
    const tabla = select.value;
    if (tabla) borrarTabla(tabla);
  };
  document.getElementById("editFieldsContainer").onclick = function(e) {
    const tabla = select.value;
    if (!tabla) return;
    if (e.target.classList.contains('renameFieldBtn')) {
      const div = e.target.closest('.editFieldRow');
      const oldName = div.querySelector('.editFieldName').dataset.original;
      const newName = div.querySelector('.editFieldName').value.trim();
      if (oldName && newName && oldName !== newName) {
        renombrarCampo(tabla, oldName, newName);
      }
    } else if (e.target.classList.contains('deleteFieldBtn')) {
      const div = e.target.closest('.editFieldRow');
      const colName = div.querySelector('.editFieldName').dataset.original;
      if (colName) borrarCampo(tabla, colName);
    }
  };
}

// Escuchar cambios de esquema
window.addEventListener('schema:change', () => {
  console.log('Esquema cambiado, recargando tablas...');
  cargarTablas();
  document.getElementById('editFieldsContainer').innerHTML = '';
  document.getElementById('editFieldsContainer').style.display = 'none';
});


setupEditarTablaListeners();
setupEditarTablaListeners();
