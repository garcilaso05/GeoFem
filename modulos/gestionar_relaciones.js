import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { sanitizeIdentifier } from "./seguridad.js";

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

async function cargarTablasParaRelacion() {
  const supabase = getSupabaseInstance();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_public_tables');
  if (error || !data) return [];
  // Excluir 'profiles' y tablas que empiezan por 'relacion_'
  return data.map(row => row.table_name).filter(t => t !== 'profiles' && !t.startsWith('relacion_'));
}

async function cargarPKyTipo(tabla) {
  const supabase = getSupabaseInstance();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_primary_key', { tabla });
  if (error || !data || !data[0]) return null;
  const pk = data[0];
  let tipo = pk.data_type;
  if (pk.data_type && pk.data_type.toLowerCase().startsWith('character varying') && pk.character_maximum_length) {
    tipo = `VARCHAR(${pk.character_maximum_length})`;
  }
  return { name: pk.column_name, type: tipo };
}

async function crearRelacion() {
  const tabla1 = document.getElementById('relTable1').value;
  const tabla2 = document.getElementById('relTable2').value;
  if (!tabla1 || !tabla2 || tabla1 === tabla2) {
    mostrarMsg('Selecciona dos tablas diferentes.', 'red');
    return;
  }
  // Obtener PKs y tipos
  const pk1 = await cargarPKyTipo(tabla1);
  const pk2 = await cargarPKyTipo(tabla2);
  if (!pk1 || !pk2) {
    mostrarMsg('No se pudo determinar la PK de una de las tablas.', 'red');
    return;
  }
  // Sanitizar nombres
  const t1 = sanitizeIdentifier(tabla1);
  const t2 = sanitizeIdentifier(tabla2);
  const pkA = sanitizeIdentifier(pk1.name);
  const pkB = sanitizeIdentifier(pk2.name);
  const tipoA = pk1.type;
  const tipoB = pk2.type;
  // Ordenar nombres para evitar duplicados
  const [st1, st2, spkA, spkB, stipoA, stipoB] = t1 < t2 ? [t1, t2, pkA, pkB, tipoA, tipoB] : [t2, t1, pkB, pkA, tipoB, tipoA];
  const relTable = `relacion_${st1}_${st2}`;
  const col1 = `${st1}_${spkA}`;
  const col2 = `${st2}_${spkB}`;
  const sql = `CREATE TABLE ${relTable} (` +
    `${col1} ${stipoA}, ` +
    `${col2} ${stipoB}, ` +
    `PRIMARY KEY (${col1}, ${col2}), ` +
    `FOREIGN KEY (${col1}) REFERENCES ${st1}(${spkA}) ON DELETE CASCADE, ` +
    `FOREIGN KEY (${col2}) REFERENCES ${st2}(${spkB}) ON DELETE CASCADE` +
    `);`;
  console.log('SQL generado:', sql);
  document.getElementById('relacionMsg').textContent = sql;
  // Ejecutar SQL
  const supabase = getSupabaseInstance();
  const { error } = await supabase.rpc('exec_create_table', { query: sql });
  if (error) {
    mostrarMsg('Error creando relación: ' + error.message, 'red');
  } else {
    // Aplicar automáticamente RLS a la tabla intermedia creada
    try {
      const { error: rlsError } = await supabase.rpc('apply_rls', { table_name: relTable });
      if (rlsError) {
        console.warn('Error aplicando RLS a tabla intermedia:', rlsError.message);
        mostrarMsg('Relación creada ✅ (Advertencia: No se pudo aplicar RLS automáticamente)', 'orange');
      } else {
        mostrarMsg('Relación creada con éxito ✅ (RLS aplicado automáticamente)', 'green');
      }
    } catch (rlsError) {
      console.warn('Error aplicando RLS:', rlsError);
      mostrarMsg('Relación creada ✅ (Advertencia: No se pudo aplicar RLS automáticamente)', 'orange');
    }
    await cargarTablasEnSelects();
  }
}

function mostrarMsg(msg, color) {
  const el = document.getElementById('relacionMsg');
  el.textContent = msg;
  el.style.color = color === 'orange' ? '#ff9800' : color;
  setTimeout(() => { el.textContent = ''; }, 4000);
}

async function cargarTablasEnSelects() {
  const tablas = await cargarTablasParaRelacion();
  const sel1 = document.getElementById('relTable1');
  const sel2 = document.getElementById('relTable2');
  sel1.innerHTML = '<option value="">--</option>';
  sel2.innerHTML = '<option value="">--</option>';
  tablas.forEach(t => {
    const o1 = document.createElement('option');
    o1.value = t; o1.textContent = t; sel1.appendChild(o1);
    const o2 = document.createElement('option');
    o2.value = t; o2.textContent = t; sel2.appendChild(o2);
  });
}

document.getElementById('crearRelacionBtn').onclick = crearRelacion;
document.getElementById('applyRlsAllBtn').onclick = aplicarRlsATodas;
cargarTablasEnSelects();

// --- NUEVA SECCIÓN: Gestión de relaciones n:m desde tabla intermedia ---

// Validación estricta de identificadores antes de usar supabase.from()
const IDENT_RE = /^[A-Za-z0-9_]+$/;
function isValidIdentifier(id) {
  return typeof id === 'string' && IDENT_RE.test(id);
}

function setRelStatus(msg, color = 'inherit') {
  const el = document.getElementById('relMgmtStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color;
}

// Añadido: utilidades para diagnosticar RLS/autenticación
async function logAuthInfo() {
  try {
    const supabase = getSupabaseInstance();
    if (!supabase) return;
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn('auth.getUser() error:', error);
      return;
    }
    console.log('Auth user:', data?.user ? { id: data.user.id, role: data.user.role, email: data.user.email } : 'no session');
  } catch (e) {
    console.warn('auth info error:', e);
  }
}

function isRlsError(err) {
  return err && (err.code === '42501' || /row-level security/i.test(err.message || ''));
}

function explainRls(table, extra = {}) {
  const msg = `RLS bloquea la inserción en ${table}. Crea una policy INSERT para tu rol (anon/authenticated) o usa una RPC SECURITY DEFINER que haga el insert.`;
  console.warn(msg, { table, ...extra });
  setRelStatus(msg, 'red');
}

const relState = {
  relTable: null,
  tables: null, // { t1, t2 }
  pks: null,    // { pk1, pk2 }
  fkCols: null, // { c1, c2 } - columnas reales en la tabla intermedia
  leftIsFirst: true, // controla intercambio de columnas
  leftSelected: null,
  values: { t1: [], t2: [] } // listas de valores de PK
};

function normalizeFkTablesData(data) {
  // Soporta:
  // - Array de objetos [{ referenced_table, fk_column }, ...] (forma de tu función)
  // - Array de 2 strings ['tablaA','tablaB']
  // - Array con un objeto con 2 strings (fallback)
  if (!Array.isArray(data) || data.length === 0) return null;

  // Caso 1: filas con referenced_table y fk_column (recomendado)
  const rows = data.filter(
    r => r && typeof r === 'object' && typeof r.referenced_table === 'string' && typeof r.fk_column === 'string'
  );
  if (rows.length >= 2) {
    // Mantén el orden de la función (p.ej. ORDER BY kcu.column_name)
    return {
      t1: rows[0].referenced_table,
      t2: rows[1].referenced_table,
      c1: rows[0].fk_column,
      c2: rows[1].fk_column
    };
  }

  // Caso 2: ['a','b']
  if (data.length === 2 && typeof data[0] === 'string' && typeof data[1] === 'string') {
    return { t1: data[0], t2: data[1] };
  }

  // Caso 3: [{...}] con dos strings cualquiera
  if (data.length === 1 && typeof data[0] === 'object' && data[0]) {
    const obj = data[0];
    const stringVals = Object.values(obj).filter(v => typeof v === 'string');
    if (stringVals.length >= 2) return { t1: stringVals[0], t2: stringVals[1] };
  }

  return null;
}

async function cargarTablasRelacionIntermedia() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  const sel = document.getElementById('relJoinTable');
  if (!sel) return;
  setRelStatus('Cargando tablas de relación...', 'gray');
  const { data, error } = await supabase.rpc('get_public_tables');
  if (error) {
    console.error('get_public_tables error:', error);
    setRelStatus('Error cargando tablas de relación', 'red');
    return;
  }
  const relTabs = (data || [])
    .map(r => r.table_name)
    .filter(t => t && t.startsWith('relacion_'));
  sel.innerHTML = '<option value="">--</option>';
  relTabs.forEach(t => {
    const o = document.createElement('option');
    o.value = t; o.textContent = t; sel.appendChild(o);
  });
  setRelStatus('');
}

function buildRelColName(tableName, pkName) {
  // Usa el mismo patrón que el creador de relaciones
  const st = sanitizeIdentifier(tableName);
  const spk = sanitizeIdentifier(pkName);
  return `${st}_${spk}`;
}

// Helper: elige las columnas reales de la tabla intermedia según el lado izquierdo/derecho.
// Si get_fk_tables aportó fk_column, úsalo; si no, calcula por patrón.
function getRelColumns() {
  const leftTable = relState.leftIsFirst ? relState.tables.t1 : relState.tables.t2;
  const rightTable = relState.leftIsFirst ? relState.tables.t2 : relState.tables.t1;
  const leftPk = relState.leftIsFirst ? relState.pks.pk1 : relState.pks.pk2;
  const rightPk = relState.leftIsFirst ? relState.pks.pk2 : relState.pks.pk1;

  let leftCol, rightCol;
  if (relState.fkCols && relState.fkCols.c1 && relState.fkCols.c2) {
    leftCol = relState.leftIsFirst ? relState.fkCols.c1 : relState.fkCols.c2;
    rightCol = relState.leftIsFirst ? relState.fkCols.c2 : relState.fkCols.c1;
  } else {
    // Fallback al patrón <tabla>_<pk>
    leftCol = buildRelColName(leftTable, leftPk);
    rightCol = buildRelColName(rightTable, rightPk);
  }
  return { leftTable, rightTable, leftPk, rightPk, leftCol, rightCol };
}

async function onSelectRelTable() {
  const sel = document.getElementById('relJoinTable');
  const swapBtn = document.getElementById('relSwapBtn');
  const createBtn = document.getElementById('relCreateRelsBtn');
  relState.relTable = sel.value || null;
  relState.tables = null;
  relState.pks = null;
  relState.fkCols = null;
  relState.leftSelected = null;
  relState.values = { t1: [], t2: [] };
  document.getElementById('relLeftList').innerHTML = '';
  document.getElementById('relRightList').innerHTML = '';
  swapBtn.disabled = true;
  createBtn.disabled = true;
  if (!relState.relTable) {
    setRelStatus('Selecciona una tabla intermedia.', 'gray');
    return;
  }
  if (!isValidIdentifier(relState.relTable)) {
    console.warn('Nombre de tabla intermedia inválido:', relState.relTable);
    setRelStatus('Identificador de tabla intermedia inválido.', 'red');
    return;
  }
  setRelStatus('Resolviendo tablas y PKs...', 'gray');
  const supabase = getSupabaseInstance();
  console.log('RPC get_fk_tables payload:', { tabla_relacion: relState.relTable });
  const { data: fkData, error: fkErr } = await supabase.rpc('get_fk_tables', { tabla_relacion: relState.relTable });
  if (fkErr || !fkData) {
    console.error('get_fk_tables error:', fkErr);
    setRelStatus('Error obteniendo tablas referenciadas.', 'red');
    return;
  }
  const norm = normalizeFkTablesData(fkData);
  if (!norm || !norm.t1 || !norm.t2) {
    console.error('Formato inesperado de get_fk_tables:', fkData);
    setRelStatus('Respuesta inesperada de get_fk_tables.', 'red');
    return;
  }
  if (!isValidIdentifier(norm.t1) || !isValidIdentifier(norm.t2)) {
    console.warn('Tablas referenciadas con identificadores inválidos:', norm);
    setRelStatus('Tablas referenciadas con nombres inválidos.', 'red');
    return;
  }
  // Si vienen columnas fk reales, valídalas y guárdalas
  if (norm.c1 && norm.c2) {
    if (!isValidIdentifier(norm.c1) || !isValidIdentifier(norm.c2)) {
      console.warn('Columnas FK inválidas:', { c1: norm.c1, c2: norm.c2 });
      setRelStatus('Columnas FK inválidas en la tabla intermedia.', 'red');
      return;
    }
    relState.fkCols = { c1: norm.c1, c2: norm.c2 };
  }

  relState.tables = { t1: norm.t1, t2: norm.t2 };

  // Obtener PKs
  console.log('RPC get_primary_key payloads:', { tabla: norm.t1 }, { tabla: norm.t2 });
  const [pk1Res, pk2Res] = await Promise.all([
    supabase.rpc('get_primary_key', { tabla: norm.t1 }),
    supabase.rpc('get_primary_key', { tabla: norm.t2 })
  ]);
  if (pk1Res.error || pk2Res.error || !pk1Res.data || !pk2Res.data || !pk1Res.data[0] || !pk2Res.data[0]) {
    console.error('get_primary_key error:', pk1Res.error, pk2Res.error, pk1Res.data, pk2Res.data);
    setRelStatus('Error obteniendo claves primarias.', 'red');
    return;
  }
  const pk1 = pk1Res.data[0].column_name;
  const pk2 = pk2Res.data[0].column_name;
  if (!isValidIdentifier(pk1) || !isValidIdentifier(pk2)) {
    console.warn('PKs con identificadores inválidos:', { pk1, pk2 });
    setRelStatus('PKs con nombres inválidos.', 'red');
    return;
  }
  relState.pks = { pk1, pk2 };

  // Cargar valores de PK de ambas tablas
  setRelStatus('Cargando valores de PK...', 'gray');
  const leftTable = relState.leftIsFirst ? relState.tables.t1 : relState.tables.t2;
  const rightTable = relState.leftIsFirst ? relState.tables.t2 : relState.tables.t1;
  const leftPk = relState.leftIsFirst ? relState.pks.pk1 : relState.pks.pk2;
  const rightPk = relState.leftIsFirst ? relState.pks.pk2 : relState.pks.pk1;

  const [leftValsRes, rightValsRes] = await Promise.all([
    getAllPkValues(leftTable, leftPk),
    getAllPkValues(rightTable, rightPk)
  ]);
  if (!leftValsRes.ok || !rightValsRes.ok) {
    setRelStatus('Error cargando valores de PK.', 'red');
    return;
  }
  // Guarda por nombre original t1/t2 en función de qué lado quedó a la izquierda
  if (relState.leftIsFirst) {
    relState.values.t1 = leftValsRes.values;
    relState.values.t2 = rightValsRes.values;
  } else {
    relState.values.t1 = rightValsRes.values;
    relState.values.t2 = leftValsRes.values;
  }

  renderColumns();
  swapBtn.disabled = false;
  setRelStatus('Selecciona un valor a la izquierda y varios a la derecha. Luego pulsa "Crear relaciones".', 'gray');
}

async function getAllPkValues(tableName, pkName) {
  const supabase = getSupabaseInstance();
  if (!isValidIdentifier(tableName) || !isValidIdentifier(pkName)) {
    console.warn('Identificadores inválidos en getAllPkValues:', { tableName, pkName });
    return { ok: false, values: [] };
    }
  console.log('Select PK values payload:', { table: tableName, column: pkName });
  const { data, error } = await supabase
    .from(tableName)
    .select(pkName)
    .order(pkName, { ascending: true });
  if (error) {
    console.error('Error select PK values:', error);
    return { ok: false, values: [] };
  }
  const values = (data || []).map(r => r[pkName]).filter(v => v !== null && v !== undefined);
  return { ok: true, values };
}

function renderColumns() {
  const leftList = document.getElementById('relLeftList');
  const rightList = document.getElementById('relRightList');
  leftList.innerHTML = '';
  rightList.innerHTML = '';

  const leftTable = relState.leftIsFirst ? relState.tables.t1 : relState.tables.t2;
  const rightTable = relState.leftIsFirst ? relState.tables.t2 : relState.tables.t1;
  const leftPk = relState.leftIsFirst ? relState.pks.pk1 : relState.pks.pk2;
  const rightPk = relState.leftIsFirst ? relState.pks.pk2 : relState.pks.pk1;

  // Encabezados
  const lh = document.createElement('div');
  lh.textContent = `${leftTable}.${leftPk} (uno)`;
  lh.style.fontWeight = 'bold';
  const rh = document.createElement('div');
  rh.textContent = `${rightTable}.${rightPk} (múltiples)`;
  rh.style.fontWeight = 'bold';
  leftList.appendChild(lh);
  rightList.appendChild(rh);

  // Render izquierda: checkbox a la derecha del valor; sólo uno permitido
  const lvals = relState.leftIsFirst ? relState.values.t1 : relState.values.t2;
  lvals.forEach(val => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';

    const label = document.createElement('span');
    label.textContent = String(val);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.value = String(val);
    cb.onchange = () => {
      // Enforce single selection
      Array.from(leftList.querySelectorAll('input[type="checkbox"]')).forEach(other => {
        if (other !== cb) other.checked = false;
      });
      relState.leftSelected = cb.checked ? val : null;
      if (relState.leftSelected !== null) {
        preselectRightForLeft();
        document.getElementById('relCreateRelsBtn').disabled = false;
      } else {
        document.getElementById('relCreateRelsBtn').disabled = true;
      }
    };

    row.appendChild(label);
    row.appendChild(cb); // checkbox a la derecha del valor
    leftList.appendChild(row);
  });

  // Render derecha: checkbox a la izquierda del valor; múltiples permitidos
  const rvals = relState.leftIsFirst ? relState.values.t2 : relState.values.t1;
  rvals.forEach(val => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.value = String(val);

    const label = document.createElement('span');
    label.textContent = String(val);
    label.style.marginLeft = '6px';

    row.appendChild(cb); // checkbox a la izquierda del valor
    row.appendChild(label);
    rightList.appendChild(row);
  });
}

async function preselectRightForLeft() {
  const leftVal = relState.leftSelected;
  if (leftVal === null || leftVal === undefined) return;

  const { leftCol, rightCol } = getRelColumns();

  if (![relState.relTable, leftCol, rightCol].every(isValidIdentifier)) {
    console.warn('Identificadores inválidos en preselectRightForLeft');
    setRelStatus('Identificadores inválidos detectados.', 'red');
    return;
  }

  setRelStatus('Consultando relaciones existentes...', 'gray');
  const supabase = getSupabaseInstance();
  console.log('Preselect query payload:', {
    relTable: relState.relTable,
    select: rightCol,
    whereCol: leftCol,
    whereVal: leftVal
  });
  const { data, error } = await supabase
    .from(relState.relTable)
    .select(rightCol)
    .eq(leftCol, leftVal);

  if (error) {
    console.error('Error al consultar relaciones existentes:', error);
    setRelStatus('Error consultando relaciones existentes.', 'red');
    return;
  }
  const existingRightVals = new Set((data || []).map(r => String(r[rightCol])));
  const rightList = document.getElementById('relRightList');
  Array.from(rightList.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
    cb.checked = existingRightVals.has(cb.dataset.value);
  });
  setRelStatus('Relaciones existentes aplicadas a la selección.', 'gray');
}

async function crearRelacionesSeleccionadas() {
  const createBtn = document.getElementById('relCreateRelsBtn');
  if (!relState.relTable || relState.leftSelected === null) {
    setRelStatus('Selecciona primero un valor en la izquierda.', 'red');
    return;
  }

  const { leftCol, rightCol } = getRelColumns();
  if (![relState.relTable, leftCol, rightCol].every(isValidIdentifier)) {
    console.warn('Identificadores inválidos en crearRelacionesSeleccionadas');
    setRelStatus('Identificadores inválidos detectados.', 'red');
    return;
  }

  const rightList = document.getElementById('relRightList');
  const selectedRightKeys = Array.from(
    rightList.querySelectorAll('input[type="checkbox"]:checked')
  ).map(cb => cb.dataset.value);
  if (selectedRightKeys.length === 0) {
    setRelStatus('Selecciona al menos un valor a la derecha.', 'red');
    return;
  }

  // Reconstruye los valores tipados desde la lista en memoria
  const rvals = relState.leftIsFirst ? relState.values.t2 : relState.values.t1;
  const selectedRight = selectedRightKeys.map(k => rvals.find(v => String(v) === k)).filter(v => v !== undefined);

  setRelStatus('Creando relaciones...', 'gray');
  createBtn.disabled = true;

  const supabase = getSupabaseInstance();

  // Primero consulta existentes para evitar duplicados
  console.log('Consulta existentes payload:', {
    table: relState.relTable,
    select: rightCol,
    whereCol: leftCol,
    whereVal: relState.leftSelected
  });
  const { data: existsData, error: existsErr } = await supabase
    .from(relState.relTable)
    .select(rightCol)
    .eq(leftCol, relState.leftSelected);

  if (existsErr) {
    console.error('Error consultando existentes:', existsErr);
    setRelStatus('Error consultando relaciones existentes.', 'red');
    createBtn.disabled = false;
    return;
  }

  const existingSet = new Set((existsData || []).map(r => String(r[rightCol])));
  const toInsert = selectedRight
    .filter(v => !existingSet.has(String(v)))
    .map(v => ({ [leftCol]: relState.leftSelected, [rightCol]: v }));

  if (toInsert.length === 0) {
    setRelStatus('No hay nuevas relaciones que crear (ya existen).', 'gray');
    createBtn.disabled = false;
    return;
  }

  console.log('Insert payload:', { table: relState.relTable, rows: toInsert });
  const { error: insertErr } = await supabase.from(relState.relTable).insert(toInsert);

  if (insertErr) {
    console.error('Error insertando relaciones:', insertErr);
    if (isRlsError(insertErr)) {
      await logAuthInfo();
      explainRls(relState.relTable, { leftCol, rightCol, sampleRow: toInsert[0] });
    } else {
      setRelStatus('Error al crear relaciones.', 'red');
    }
  } else {
    setRelStatus('Relaciones creadas con éxito ✅', 'green');
    // Actualiza preselección tras insertar
    await preselectRightForLeft();
  }
  createBtn.disabled = false;
}

function swapColumns() {
  relState.leftIsFirst = !relState.leftIsFirst;
  relState.leftSelected = null;
  renderColumns();
  document.getElementById('relCreateRelsBtn').disabled = true;
  setRelStatus('Columnas intercambiadas. Selecciona un valor a la izquierda.', 'gray');
}

function initRelacionManagerUI() {
  const sel = document.getElementById('relJoinTable');
  const swapBtn = document.getElementById('relSwapBtn');
  const createBtn = document.getElementById('relCreateRelsBtn');
  if (!sel || !swapBtn || !createBtn) return;

  sel.onchange = onSelectRelTable;
  swapBtn.onclick = swapColumns;
  createBtn.onclick = crearRelacionesSeleccionadas;

  cargarTablasRelacionIntermedia();
  setRelStatus('Selecciona una tabla intermedia (relacion_*).', 'gray');
}

// Inicializar nueva sección
initRelacionManagerUI();

// Función para aplicar RLS a todas las tablas
async function aplicarRlsATodas() {
    const msgDiv = document.getElementById('rlsAllMsg');
    const btn = document.getElementById('applyRlsAllBtn');
    
    try {
        btn.disabled = true;
        btn.textContent = 'Aplicando RLS...';
        msgDiv.innerHTML = '<p style="color: blue;">Aplicando políticas RLS a todas las tablas...</p>';
        
        // Llamar a la función apply_rls_all_tables
        const { data, error } = await supabase
            .rpc('apply_rls_all_tables');
        
        if (error) {
            console.error('Error:', error);
            msgDiv.innerHTML = `<p style="color: red;">Error al aplicar RLS: ${error.message}</p>`;
        } else {
            console.log('RLS aplicado exitosamente:', data);
            if (data && data.length > 0) {
                msgDiv.innerHTML = `<p style="color: green;">Políticas RLS aplicadas exitosamente a ${data.length} tabla(s):</p>
                                  <ul>${data.map(tabla => `<li>${tabla}</li>`).join('')}</ul>`;
            } else {
                msgDiv.innerHTML = `<p style="color: green;">Todas las tablas ya tienen políticas RLS configuradas.</p>`;
            }
        }
    } catch (error) {
        console.error('Error:', error);
        msgDiv.innerHTML = `<p style="color: red;">Error inesperado: ${error.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Aplicar RLS a todas las tablas';
    }
}
