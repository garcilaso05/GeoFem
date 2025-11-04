import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { sanitizeIdentifier, formatDisplayName } from "./seguridad.js";

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
  const select = document.getElementById("editTableSelect");
  if (!select) return;
  
  // Limpiar opciones existentes para evitar duplicados
  select.innerHTML = '<option value="">Selecciona una tabla...</option>';
  
  try {
    // Esperar a que la caché esté lista
    if (window.dbCache && !window.dbCache.isCacheReady()) {
      console.log('⏳ Esperando a que la caché se inicialice...');
      await window.dbCache.waitForCache();
    }
    
    // OPTIMIZACIÓN: Usar caché en lugar de RPC
    const schema = window.getCurrentSchema();
    const tablas = window.dbCache.getTables(schema);
    
    if (!tablas || tablas.length === 0) {
      console.warn('No se encontraron tablas en el schema:', schema);
      return;
    }
    
    console.log(`✅ Cargadas ${tablas.length} tablas desde caché`);
    
    // Agregar opciones al select
    tablas.forEach(tableName => {
      const opt = document.createElement("option");
      opt.value = tableName;
      opt.textContent = formatDisplayName(tableName);
      select.appendChild(opt);
    });
    
  } catch (error) {
    console.error("Error cargando tablas:", error);
    select.innerHTML = '<option value="">Error cargando tablas</option>';
  }
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
    // Esperar a que la caché esté lista
    if (window.dbCache && !window.dbCache.isCacheReady()) {
      console.log('⏳ Esperando a que la caché se inicialice...');
      await window.dbCache.waitForCache();
    }
    
    // OPTIMIZACIÓN: Usar caché en lugar de RPC
    const schema = window.getCurrentSchema();
    const data = window.dbCache.getTableColumns(schema, tabla);
    
    if (!data || data.length === 0) {
      container.innerHTML = '<p style="color: orange;">No se encontraron columnas para esta tabla.</p>';
      container.style.display = 'block';
      return;
    }
    
    console.log('Columnas obtenidas desde caché:', data);
    
    // Crear elementos para cada columna
    data.forEach(col => {
      const div = document.createElement('div');
      div.className = 'editFieldRow';
      div.style.cssText = 'margin-bottom: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background-color: #fafafa;';
      
      const columnName = col.column_name;
      const dataType = col.data_type;
      const maxLength = col.character_maximum_length;
      const fkComment = col.fk_comment || '';
      const isPrimary = col.is_primary;
      const udtName = col.udt_name || '';
      
      // Mostrar tipo con información adicional
      let typeDisplay = dataType;
      
      // Si es USER-DEFINED (ENUM), mostrar el nombre del ENUM
      if (dataType === 'USER-DEFINED' && udtName) {
        typeDisplay = `${udtName} (ENUM)`;
      } else if (maxLength) {
        typeDisplay += `(${maxLength})`;
      }
      
      // Agregar comentario de FK si existe
      if (fkComment) {
        typeDisplay += ` - ${fkComment}`;
      }
      
      div.innerHTML = `
        <div style="margin-bottom: 8px;">
          <input type="text" value="${columnName}" class="editFieldName" data-original="${columnName}" 
                 style="margin-right: 10px; padding: 4px; width: 150px; font-family: monospace;" />
          <span style="color:#666; margin-right: 10px; font-size: 13px; background-color: #e8e8e8; padding: 3px 8px; border-radius: 3px;">${typeDisplay}</span>
          <button type="button" class="renameFieldBtn btn-secondary" style="padding: 4px 10px; font-size: 13px; margin-right: 5px; background-color: #2196F3; color: white; border: none; border-radius: 3px; cursor: pointer;">✏️ Renombrar</button>
          ${isPrimary ? '<span style="color: #4CAF50; font-weight: bold; margin-left: 10px; background-color: #e8f5e9; padding: 3px 8px; border-radius: 3px; font-size: 12px;">🔑 PK</span>' : ''}
          ${fkComment ? '<span style="color: #2196F3; font-weight: bold; margin-left: 5px; background-color: #e3f2fd; padding: 3px 8px; border-radius: 3px; font-size: 12px;">🔗 FK</span>' : ''}
        </div>
      `;
      
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
  
  // Validar nombres
  if (!sanitizeIdentifier(oldName) || !sanitizeIdentifier(newName)) {
    return mostrarMsg('Nombres de columna inválidos', 'red');
  }
  
  try {
    const schema = window.getCurrentSchema();
    const { error } = await supabase.rpc('rename_column_safe', {
      p_schema: schema,
      p_tabla: tabla,
      p_columna_antigua: oldName,
      p_columna_nueva: newName
    });
    
    if (error) throw error;
    
    mostrarMsg('Campo renombrado con éxito', 'green');
    
    // Recargar SOLO esta tabla (optimizado)
    if (window.dbCache) {
      await window.dbCache.reloadTable(schema, tabla);
    }
    
    cargarCamposTabla(tabla);
    
  } catch (err) {
    console.error('Error renombrando campo:', err);
    mostrarMsg('Error renombrando campo: ' + err.message, 'red');
  }
}

// FUNCIONES DE BORRADO ELIMINADAS - NO SE PERMITE BORRAR CAMPOS NI TABLAS
// Por seguridad, estas operaciones han sido deshabilitadas

async function anadirCampo(tabla) {
  if (document.getElementById('addFieldForm')) return;
  const container = document.getElementById("editFieldsContainer");
  const formDiv = document.createElement('div');
  formDiv.id = 'addFieldForm';
  formDiv.className = 'editFieldRow';
  formDiv.style.cssText = 'margin-bottom: 10px; padding: 10px; border: 2px solid #4CAF50; border-radius: 4px; background-color: #f0f8f0;';
  
  // OPTIMIZACIÓN: Obtener tablas y ENUMs desde caché
  const schema = window.getCurrentSchema();
  const tablasExistentes = window.dbCache.getTables(schema) || [];
  const enumsDisponibles = window.dbCache.getAllEnums() || {};
  
  // Tipos de datos básicos
  const tipos = [
    { value: "integer", label: "Entero (integer)" },
    { value: "bigint", label: "Entero largo (bigint)" },
    { value: "numeric", label: "Número con decimales (numeric)" },
    { value: "varchar(25)", label: "Texto corto (25)" },
    { value: "varchar(50)", label: "Texto medio (50)" },
    { value: "varchar(100)", label: "Texto largo (100)" },
    { value: "varchar(255)", label: "Texto muy largo (255)" },
    { value: "text", label: "Texto sin límite (text)" },
    { value: "boolean", label: "Booleano (true/false)" },
    { value: "date", label: "Fecha (date)" },
    { value: "timestamp", label: "Fecha y hora (timestamp)" }
  ];
  
  // Formulario con mejor diseño
  formDiv.innerHTML = `
    <div style="margin-bottom: 8px;">
      <input type="text" id="newFieldName" placeholder="Nombre del campo" 
             style="margin-right: 10px; padding: 4px; width: 150px;" />
      <select id="newFieldType" style="margin-right: 10px; padding: 4px; min-width: 200px;"></select>
      <span id="refTableContainer" style="display:none;">
        <select id="newRefTable" style="margin-right: 10px; padding: 4px; min-width: 150px;"></select>
      </span>
      <button type="button" id="confirmAddFieldBtn" style="padding: 4px 12px; font-size: 13px; background-color: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer; margin-right: 5px;">✓ Añadir</button>
      <button type="button" id="cancelAddFieldBtn" style="padding: 4px 12px; font-size: 13px; background-color: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer;">✗ Cancelar</button>
    </div>
  `;
  
  // Rellenar tipos básicos
  const typeSelect = formDiv.querySelector('#newFieldType');
  
  // Separador de tipos básicos
  const optGroupBasic = document.createElement('optgroup');
  optGroupBasic.label = 'Tipos Básicos';
  tipos.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    optGroupBasic.appendChild(o);
  });
  typeSelect.appendChild(optGroupBasic);
  
  // Agregar ENUMs si existen
  const enumNames = Object.keys(enumsDisponibles);
  if (enumNames.length > 0) {
    const optGroupEnum = document.createElement('optgroup');
    optGroupEnum.label = '📋 Enumerados (ENUM)';
    enumNames.forEach(enumName => {
      const o = document.createElement('option');
      o.value = enumName;
      o.textContent = `${enumName} (ENUM)`;
      optGroupEnum.appendChild(o);
    });
    typeSelect.appendChild(optGroupEnum);
  }
  
  // Opción de referencia
  const optGroupRef = document.createElement('optgroup');
  optGroupRef.label = '🔗 Relaciones';
  const refOpt = document.createElement('option');
  refOpt.value = 'REFERENCIA';
  refOpt.textContent = 'Referencia a otra tabla (FK)';
  optGroupRef.appendChild(refOpt);
  typeSelect.appendChild(optGroupRef);
  
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
      formDiv.querySelector('#refTableContainer').style.display = 'inline';
    } else {
      formDiv.querySelector('#refTableContainer').style.display = 'none';
    }
  });
  // Confirmar añadir campo
  formDiv.querySelector('#confirmAddFieldBtn').onclick = async function() {
    const nombre = formDiv.querySelector('#newFieldName').value.trim();
    let tipo = typeSelect.value;
    if (!nombre) return mostrarMsg('Introduce un nombre de campo', 'red');
    
    // Validar nombre de columna
    if (!sanitizeIdentifier(nombre)) {
      return mostrarMsg('Nombre de columna inválido', 'red');
    }
    
    const supabase = getSupabaseInstance();
    if (!supabase) return;
    
    // Deshabilitar botones mientras se procesa
    const btnConfirm = formDiv.querySelector('#confirmAddFieldBtn');
    const btnCancel = formDiv.querySelector('#cancelAddFieldBtn');
    btnConfirm.disabled = true;
    btnCancel.disabled = true;
    btnConfirm.textContent = '⏳ Añadiendo...';
    
    try {
      const schema = window.getCurrentSchema();
      
      // Manejar referencias (FK)
      if (tipo === 'REFERENCIA') {
        const refTable = refSelect.value;
        if (!refTable) {
          btnConfirm.disabled = false;
          btnCancel.disabled = false;
          btnConfirm.textContent = '✓ Añadir';
          return mostrarMsg('Selecciona la tabla a referenciar', 'red');
        }
        
        mostrarMsg('Creando columna INT para FK...', 'orange');
        
        const { error } = await supabase.rpc('add_column_safe', {
          p_schema: schema,
          p_tabla: tabla,
          p_columna: nombre,
          p_tipo: 'integer',
          p_default: null
        });
        
        if (error) throw error;
        mostrarMsg('Campo INT creado. Configura la FK manualmente en SQL si es necesario.', 'orange');
        
      } else {
        // Tipo de dato normal (incluye ENUMs)
        const { error } = await supabase.rpc('add_column_safe', {
          p_schema: schema,
          p_tabla: tabla,
          p_columna: nombre,
          p_tipo: tipo,
          p_default: null
        });
        
        if (error) throw error;
        mostrarMsg('Campo añadido con éxito ✅', 'green');
      }
      
      // Recargar SOLO esta tabla (optimizado, no recarga todo el cache)
      console.log(`♻️ Recargando solo tabla ${schema}.${tabla}...`);
      if (window.dbCache) {
        await window.dbCache.reloadTable(schema, tabla);
      }
      
      // Recargar vista de columnas
      await cargarCamposTabla(tabla);
      formDiv.remove();
      
    } catch (err) {
      console.error('Error añadiendo campo:', err);
      mostrarMsg('Error añadiendo campo: ' + err.message, 'red');
      btnConfirm.disabled = false;
      btnCancel.disabled = false;
      btnConfirm.textContent = '✓ Añadir';
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

// Inicializar una sola vez
setupEditarTablaListeners();
