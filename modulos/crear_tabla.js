import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { sanitizeIdentifier } from "./seguridad.js";

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

// Obtener todas las tablas públicas existentes en la base de datos
async function obtenerTablasExistentes() {
  const supabase = getSupabaseInstance();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_public_tables');
  if (error || !data) return [];
  return data.map(row => row.table_name);
}

function addColumn() {
  const container = document.getElementById("columns");
  Promise.all([cargarEnumerados(), obtenerTablasExistentes()]).then(([enumTypes, tablasExistentes]) => {
    const div = document.createElement("div");
    div.className = "colDef";
    div.innerHTML = `
      <input type="text" placeholder="NOMBRE_COLUMNA" class="colName" />
      <select class="colType"></select>
      <span class="refTableContainer" style="display:none;">
        <select class="refTable"></select>
      </span>
      <label><input type="checkbox" class="notNull"> NOT NULL</label>
      <label><input type="checkbox" class="unique"> UNIQUE</label>
      <label><input type="radio" name="primaryKey" class="primary"> PRIMARY KEY</label>
      <button type="button" class="removeColBtn">❌</button>
    `;
    // Rellenar tipos
    const select = div.querySelector('.colType');
    [
      { value: "INT", label: "Entero" },
      { value: "DECIMAL", label: "Número con decimales" },
      { value: "VARCHAR(25)", label: "Texto corto (25)" },
      { value: "VARCHAR(50)", label: "Texto medio (50)" },
      { value: "VARCHAR(255)", label: "Texto grande (255)" },
      { value: "BOOLEAN", label: "Booleano" },
      { value: "REFERENCIA", label: "Referencia a un/a..." }
    ].forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      select.appendChild(o);
    });
    // Añadir enumerados
    enumTypes.forEach(enumName => {
      const o = document.createElement('option');
      o.value = enumName;
      o.textContent = `ENUM: ${enumName}`;
      select.appendChild(o);
    });
    // Rellenar tablas para referencias
    const refSelect = div.querySelector('.refTable');
    tablasExistentes.forEach(tabla => {
      const o = document.createElement('option');
      o.value = tabla;
      o.textContent = tabla;
      refSelect.appendChild(o);
    });
    // Mostrar/ocultar el selector de tabla de referencia
    select.addEventListener('change', function() {
      if (select.value === "REFERENCIA" || select.value === "REFERENCIA_NM") {
        div.querySelector('.refTableContainer').style.display = '';
      } else {
        div.querySelector('.refTableContainer').style.display = 'none';
      }
    });
    container.appendChild(div);
    div.querySelector('.removeColBtn').onclick = function() { div.remove(); };
  });
}

// Consultar enumerados existentes en Supabase
async function cargarEnumerados() {
  const supabase = getSupabaseInstance();
  if (!supabase) return [];
  // Consulta los tipos ENUM
  const { data, error } = await supabase.rpc('get_enum_types');
  if (error || !data) return [];
  return data.map(row => row.enum_name);
}

async function createTable() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;

  try {
    const rawTableName = document.getElementById("tableName").value.trim().toLowerCase().replace(/\s+/g, "_");
    const tableName = sanitizeIdentifier(rawTableName);
    if (!tableName) {
      alert("Introduce un nombre de tabla válido.");
      return;
    }

    const colDefs = [];
    let hasPrimary = false;
    const nmRelations = [];

    const colElements = document.querySelectorAll(".colDef");
    for (const div of colElements) {
      let rawName = div.querySelector(".colName").value.trim().toLowerCase().replace(/\s+/g, "_");
      if (!rawName) continue;
      let name = sanitizeIdentifier(rawName);

      let type = div.querySelector(".colType").value;
      let notNull = div.querySelector(".notNull").checked ? " NOT NULL" : "";
      let unique = div.querySelector(".unique").checked ? " UNIQUE" : "";
      let primary = div.querySelector(".primary").checked;
      if (primary) {
        hasPrimary = true;
        primary = " PRIMARY KEY";
      } else {
        primary = "";
      }

      if (type === "REFERENCIA") {
        type = "INT";
        const refTable = div.querySelector(".refTable").value;
        if (!refTable) {
          alert("Selecciona la tabla a la que referencia la clave foránea.");
          return;
        }
        colDefs.push(`${name} ${type}${notNull}${unique}${primary} REFERENCES ${sanitizeIdentifier(refTable)}(id)`);
      } else if (type === "REFERENCIA_NM") {
        // Guardar relación n:m para crear tabla intermedia
        const refTable = div.querySelector(".refTable").value;
        if (!refTable) {
          alert("Selecciona la tabla para la relación n:m.");
          return;
        }
        nmRelations.push({ tabla1: tableName, tabla2: sanitizeIdentifier(refTable) });
        // No añadir campo a la tabla principal
      } else {
        colDefs.push(`${name} ${type}${notNull}${unique}${primary}`);
      }
    }

    if (colDefs.length === 0) {
      alert("Debes definir al menos una columna.");
      return;
    }

    if (!hasPrimary) {
      alert("Debes marcar una columna como PRIMARY KEY");
      return;
    }

    // Crear tabla principal
    const sqls = [`CREATE TABLE ${tableName} (${colDefs.join(", ")});`];

    // Crear tablas intermedias para relaciones n:m
    for (const rel of nmRelations) {
      // Ordenar nombres para evitar duplicados
      const [t1, t2] = [rel.tabla1, rel.tabla2].sort();
      const relTable = `relacion_${t1}_${t2}`;
      sqls.push(
        `CREATE TABLE ${relTable} (` +
        `${t1}_id INT, ` +
        `${t2}_id INT, ` +
        `PRIMARY KEY (${t1}_id, ${t2}_id), ` +
        `FOREIGN KEY (${t1}_id) REFERENCES ${t1}(id) ON DELETE CASCADE, ` +
        `FOREIGN KEY (${t2}_id) REFERENCES ${t2}(id) ON DELETE CASCADE` +
        `);`
      );
    }

    document.getElementById("preview").textContent = sqls.join("\n\n");

    // Ejecutar todas las queries
    for (const sql of sqls) {
      const { error } = await supabase.rpc("exec_create_table", { query: sql });
      if (error) {
        alert("Error creando tabla: " + error.message);
        return;
      }
    }

    await new Promise(res => setTimeout(res, 200)); // Espera 1 segundo
    // Segunda llamada: aplicar RLS solo a la tabla principal
    const { error: rlsError } = await supabase.rpc("apply_rls", { table_name: tableName });
    if (rlsError) {
      alert("Tabla creada, pero error aplicando RLS: " + rlsError.message);
    } else {
      alert("Tabla(s) creada(s) con éxito ✅ y RLS aplicada a la principal");
    }
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// Asignar listeners tras cargar el módulo
function setupCrearTablaListeners() {
  const addBtn = document.getElementById("addColumnBtn");
  if (addBtn) addBtn.onclick = addColumn;
  const createBtn = document.getElementById("createTableBtn");
  if (createBtn) createBtn.onclick = createTable;
}

// Ejecutar setup al cargar el módulo y refrescar enumerados
setupCrearTablaListeners();
