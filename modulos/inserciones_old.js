import { createClient } from './supabase-shim.js';
import { sanitizeIdentifier, escapeSqlValue, formatDisplayName } from "./seguridad.js";

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

// OPTIMIZACIÓN: Obtener tablas desde caché
async function cargarTablas() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  const select = document.getElementById("insertTableSelect");
  select.innerHTML = '<option value="">Selecciona una tabla...</option>';
  
  // Esperar a que la caché esté lista
  if (window.dbCache && !window.dbCache.isCacheReady()) {
    console.log('⏳ Esperando a que la caché se inicialice...');
    await window.dbCache.waitForCache();
  }
  
  // OPTIMIZACIÓN: Usar caché en lugar de RPC
  const schema = window.getCurrentSchema();
  const data = window.dbCache.getTables(schema);
  
  data.forEach(tableName => {
    const opt = document.createElement("option");
    opt.value = tableName;
    opt.textContent = formatDisplayName(tableName);
    select.appendChild(opt);
  });
}

// Obtener columnas y tipos de la tabla seleccionada (OPTIMIZADO con caché)
async function cargarCamposTabla(tabla) {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  const container = document.getElementById("insertFormContainer");
  container.innerHTML = '';
  if (!tabla) return;
  
  // Esperar a que la caché esté lista
  if (window.dbCache && !window.dbCache.isCacheReady()) {
    console.log('⏳ Esperando a que la caché se inicialice...');
    await window.dbCache.waitForCache();
  }
  
  // OPTIMIZACIÓN: Usar caché en lugar de llamadas RPC
  const schema = window.getCurrentSchema();
  const data = window.dbCache.getTableColumns(schema, tabla);
  
  if (!data || data.length === 0) {
    container.innerHTML = '<span style="color:red">Error obteniendo columnas</span>';
    return;
  }
  
  for (const col of data) {
    let input;
    
    // Crear contenedor del campo con nuevo diseño
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'insert-form-field';
    
    // Crear label con información del tipo
    const label = document.createElement('div');
    label.className = 'insert-form-label';
    
    // Determinar el tipo para mostrar
    let typeDisplay = col.data_type;
    if (col.data_type === 'USER-DEFINED' && col.udt_name) {
      typeDisplay = `${col.udt_name} (ENUM)`;
    } else if (col.character_maximum_length) {
      typeDisplay = `${col.data_type}(${col.character_maximum_length})`;
    }
    
    const required = col.is_primary ? '' : ''; // Podrías añadir lógica para NOT NULL
    
    label.innerHTML = `
      <span>${formatDisplayName(col.column_name)}</span>
      <span class="field-type">${typeDisplay}</span>
      ${col.is_primary ? '<span class="field-required" title="Campo requerido">*</span>' : ''}
    `;
    
    // Detectar clave foránea por fk_comment
    if (col.fk_comment && col.fk_comment.startsWith('FK -> ')) {
      input = document.createElement('select');
      input.className = 'insert-form-input enum-select';
      input.name = col.column_name;
      // Primer valor: NULL
      const optNull = document.createElement('option');
      optNull.value = '';
      optNull.textContent = 'NULL';
      input.appendChild(optNull);
      // Extraer tabla y columna referenciada
      const refInfo = col.fk_comment.replace('FK -> ', '').split('.');
      if (refInfo.length === 2) {
        const [refTable, refCol] = refInfo;
        try {
          sanitizeIdentifier(refTable);
          sanitizeIdentifier(refCol);
          
          const { data: refData, error: refError } = await supabase
            .schema(schema)
            .from(refTable)
            .select(refCol);
          
          if (!refError && Array.isArray(refData)) {
            refData.forEach(row => {
              const opt = document.createElement('option');
              opt.value = row[refCol];
              opt.textContent = row[refCol];
              input.appendChild(opt);
            });
          }
        } catch (e) {
          // Si hay error, solo deja NULL
        }
      }
    } else if (window.dbCache.isEnumColumn(col)) {
      // Es un ENUM - usar función helper para crear el select
      input = window.dbCache.createEnumSelect(col, null, {
        includeEmpty: false,
        className: 'insert-form-input enum-select'
      });
      
      if (input) {
        input.name = col.column_name;
      } else {
        // Si falla, crear input text por defecto
        console.error(`❌ Error creando select para ENUM ${col.udt_name} en inserciones`);
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'insert-form-input';
        input.name = col.column_name;
        input.placeholder = `Error cargando ENUM ${col.udt_name}`;
      }
      
    } else if (col.data_type === 'boolean') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'insert-form-input';
      input.name = col.column_name;
    } else if (col.data_type === 'integer' || col.data_type === 'bigint' || col.data_type === 'smallint') {
      input = document.createElement('input');
      input.type = 'number';
      input.className = 'insert-form-input';
      input.name = col.column_name;
      input.placeholder = 'Número entero';
    } else if (col.data_type === 'date') {
      input = document.createElement('input');
      input.type = 'date';
      input.className = 'insert-form-input';
      input.name = col.column_name;
    } else if (col.data_type === 'timestamp' || col.data_type === 'timestamp without time zone') {
      input = document.createElement('input');
      input.type = 'datetime-local';
      input.className = 'insert-form-input';
      input.name = col.column_name;
    } else if (col.data_type && col.data_type.startsWith('character')) {
      input = document.createElement('input');
      input.type = 'text';
      input.maxLength = col.character_maximum_length || '';
      input.className = 'insert-form-input';
      input.name = col.column_name;
      input.placeholder = `Texto (máx. ${col.character_maximum_length || '∞'} caracteres)`;
    } else if (col.data_type === 'text' || col.data_type === 'varchar' || col.data_type === 'character varying') {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'insert-form-input';
      input.name = col.column_name;
      input.placeholder = 'Texto';
    } else if (col.data_type === 'numeric' || col.data_type === 'decimal' || col.data_type === 'real' || col.data_type === 'double precision') {
      input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.className = 'insert-form-input';
      input.name = col.column_name;
      input.placeholder = 'Número con decimales';
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'insert-form-input';
      input.name = col.column_name;
      input.placeholder = col.data_type;
    }
    
    // Agregar label e input al contenedor del campo
    fieldDiv.appendChild(label);
    fieldDiv.appendChild(input);
    container.appendChild(fieldDiv);
    container.appendChild(document.createElement('br'));
  }
}

// Insertar fila usando los campos generados
async function insertRow() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;

  const select = document.getElementById("insertTableSelect");
  const tableName = select.value;
  if (!tableName) {
    alert("Selecciona una tabla");
    return;
  }

  const container = document.getElementById("insertFormContainer");
  const inputs = container.querySelectorAll('.fieldValue');
  const row = {};
  inputs.forEach(input => {
    let value;
    if (input.tagName === 'SELECT') {
      value = input.value;
    } else if (input.type === 'checkbox') {
      value = input.checked;
    } else if (input.type === 'number') {
      value = input.value === '' ? null : Number(input.value);
    } else {
      value = input.value;
    }
    row[input.name] = value;
  });

  try {
    // Generar SQL de referencia (saneado)
    const sanitizedTableName = sanitizeIdentifier(tableName);
    const columns = Object.keys(row).map(k => sanitizeIdentifier(k));
    const values = Object.values(row).map(v => {
        if (v === null) return 'NULL';
        if (typeof v === 'string') return escapeSqlValue(v);
        return v;
    });

    const sql = `INSERT INTO ${sanitizedTableName} (${columns.join(", ")}) VALUES (${values.join(", ")});`;
    document.getElementById("insertPreview").textContent = sql;

    // Ejecutar inserción directa
    sanitizeIdentifier(tableName);
    const schema = window.getCurrentSchema();
    
    const { error } = await supabase
      .schema(schema)
      .from(tableName)
      .insert(row);
    
    if (error) {
      alert("Error insertando fila: " + error.message);
    } else {
      alert("Fila insertada con éxito ✅");
    }
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// Asignar listeners tras cargar el módulo
function setupInsercionesListeners() {
  const select = document.getElementById("insertTableSelect");
  const insertBtn = document.getElementById("insertRowBtn");
  const container = document.getElementById("insertFormContainer");
  
  if (select) {
    select.onchange = () => {
      cargarCamposTabla(select.value);
      insertBtn.disabled = !select.value;
      if (select.value) {
        container.style.display = 'block';
      } else {
        container.style.display = 'none';
      }
    };
  }
  if (insertBtn) insertBtn.onclick = insertRow;
}

// Limpiar instancia global de supabase al cambiar de módulo
window.addEventListener('easySQL:moduleChange', () => {
  window._supabaseInstance = null;
});

// Ejecutar setup y cargar tablas al cargar el módulo
setupInsercionesListeners();
cargarTablas();

// Escuchar cambios de esquema
window.addEventListener('schema:change', () => {
  console.log('Esquema cambiado, recargando tablas...');
  cargarTablas();
  document.getElementById('insertFormContainer').innerHTML = '';
  document.getElementById('insertFormContainer').style.display = 'none';
});
