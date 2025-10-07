import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { sanitizeIdentifier, escapeSqlValue } from "./seguridad.js";

// Usar una sola instancia global de supabase
function getSupabaseInstance() {
  if (!window._supabaseInstance) {
    const { url, key } = window.getSupabaseCreds();
    if (!url || !key) {
      alert("Introduce credenciales de Supabase");
      return null;
    }
    window._supabaseInstance = createClient(url, key);
  }
  return window._supabaseInstance;
}

let enumCache = {};

// Consultar enumerados y sus valores
async function cargarEnumeradosValores() {
  const supabase = getSupabaseInstance();
  if (!supabase) return {};
  const { data, error } = await supabase.rpc('get_enum_values');
  if (error || !data) return {};
  // Agrupar por enum_name
  const enums = {};
  data.forEach(row => {
    if (!enums[row.enum_name]) enums[row.enum_name] = [];
    enums[row.enum_name].push(row.enum_value);
  });
  enumCache = enums;
  return enums;
}

// Obtener tablas al cargar el módulo usando la función RPC
async function cargarTablas() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  const select = document.getElementById("insertTableSelect");
  select.innerHTML = '<option value="">Selecciona una tabla...</option>';
  const { data, error } = await supabase.rpc('get_public_tables');
  if (error || !data) {
    alert("Error obteniendo tablas: " + (error?.message || ''));
    return;
  }
  data.forEach(row => {
    const opt = document.createElement("option");
    opt.value = row.table_name;
    opt.textContent = row.table_name;
    select.appendChild(opt);
  });
}

// Obtener columnas y tipos de la tabla seleccionada usando la función RPC
async function cargarCamposTabla(tabla) {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  const container = document.getElementById("insertFormContainer");
  container.innerHTML = '';
  if (!tabla) return;
  await cargarEnumeradosValores();
  // Ahora pedimos también udt_name y fk_comment
  const { data, error } = await supabase.rpc('get_table_columns', { tabla });
  if (error || !data) {
    container.innerHTML = '<span style="color:red">Error obteniendo columnas</span>';
    return;
  }
  for (const col of data) {
    let input;
    let label = document.createElement('label');
    label.textContent = col.column_name + ': ';
    // Detectar clave foránea por fk_comment
    if (col.fk_comment && col.fk_comment.startsWith('FK -> ')) {
      input = document.createElement('select');
      input.className = 'fieldValue';
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
          const { data: refRows, error: refError } = await supabase
            .from(refTable)
            .select(refCol);
          if (!refError && Array.isArray(refRows)) {
            refRows.forEach(row => {
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
    } else if (col.udt_name && enumCache[col.udt_name]) {
      input = document.createElement('select');
      input.className = 'fieldValue';
      input.name = col.column_name;
      enumCache[col.udt_name].forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        input.appendChild(opt);
      });
    } else if (col.data_type === 'boolean') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'fieldValue';
      input.name = col.column_name;
    } else if (col.data_type === 'integer' || col.data_type === 'bigint' || col.data_type === 'smallint') {
      input = document.createElement('input');
      input.type = 'number';
      input.className = 'fieldValue';
      input.name = col.column_name;
    } else if (col.data_type && col.data_type.startsWith('character')) {
      input = document.createElement('input');
      input.type = 'text';
      input.maxLength = col.character_maximum_length || '';
      input.className = 'fieldValue';
      input.name = col.column_name;
    } else if (col.data_type === 'text' || col.data_type === 'varchar' || col.data_type === 'character varying') {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'fieldValue';
      input.name = col.column_name;
    } else if (col.data_type === 'numeric' || col.data_type === 'decimal' || col.data_type === 'real' || col.data_type === 'double precision') {
      input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.className = 'fieldValue';
      input.name = col.column_name;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'fieldValue';
      input.name = col.column_name;
    }
    label.appendChild(input);
    container.appendChild(label);
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
        return v; // for numbers and booleans
    });

    const sql = `INSERT INTO ${sanitizedTableName} (${columns.join(", ")}) VALUES (${values.join(", ")});`;
    document.getElementById("insertPreview").textContent = sql;

    // Ejecutar inserción en Supabase (ya es seguro)
    const { error } = await supabase.from(tableName).insert([row]);
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
