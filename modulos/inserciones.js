import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { sanitizeIdentifier, formatDisplayName } from "./seguridad.js";

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

// ============================================================================
// CARGAR FORMULARIO COMPLETO (TODAS LAS TABLAS)
// ============================================================================

async function cargarFormularioCaso() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  
  const container = document.getElementById("insertFormContainer");
  const casoIdDisplay = document.getElementById("casoIdDisplay");
  
  // Ocultar display de ID si estaba visible
  casoIdDisplay.style.display = 'none';
  
  // Esperar a que la caché esté lista
  if (window.dbCache && !window.dbCache.isCacheReady()) {
    console.log('⏳ Esperando a que la caché se inicialice...');
    await window.dbCache.waitForCache();
  }
  
  const schema = window.getCurrentSchema();
  console.log(`📋 Cargando formulario completo para schema: ${schema}`);
  
  try {
    // Obtener tablas hijas
    const { data: tablasHijas, error } = await supabase.rpc('get_tablas_hijas', { p_schema: schema });
    
    if (error) {
      console.error('❌ Error obteniendo tablas hijas:', error);
      container.innerHTML = '<p style="color:red">Error cargando estructura de tablas</p>';
      return;
    }
    
    console.log('📊 Tablas hijas:', tablasHijas);
    
    // Si es HRF, mostrar selector de madre
    const madreIdSelector = document.getElementById('madreIdSelector');
    if (schema === 'hrf') {
      madreIdSelector.style.display = 'block';
      await cargarMadres();
    } else {
      madreIdSelector.style.display = 'none';
    }
    
    // Limpiar container y crear secciones por tabla
    const innerContainer = container.querySelector('#madreIdSelector')?.nextElementSibling || container;
    let formularioHTML = '';
    
    // Crear sección para cada tabla hija
    for (const tablaInfo of tablasHijas) {
      const tablaNombre = tablaInfo.table_name;
      const columnas = window.dbCache.getTableColumns(schema, tablaNombre);
      
      if (!columnas || columnas.length === 0) {
        console.warn(`⚠️ No se encontraron columnas para ${tablaNombre}`);
        continue;
      }
      
      // Iniciar sección de tabla
      formularioHTML += `
        <div class="tabla-section" data-table="${tablaNombre}">
          <h3 class="tabla-section-header">
            📄 ${formatDisplayName(tablaNombre)}
          </h3>
          <div class="tabla-section-fields">
      `;
      
      // Añadir campos (excepto 'id' que es auto-generado)
      for (const col of columnas) {
        // Skip ID (auto-generated en todas las tablas)
        if (col.column_name === 'id' || col.is_primary) continue;
        
        formularioHTML += generarCampo(col, tablaNombre);
      }
      
      formularioHTML += `
          </div>
        </div>
      `;
    }
    
    // Insertar después del selector de madre (si existe) o al principio
    if (schema === 'hrf') {
      const selectorDiv = document.getElementById('madreIdSelector');
      selectorDiv.insertAdjacentHTML('afterend', formularioHTML);
    } else {
      container.innerHTML = formularioHTML;
    }
    
    console.log('✅ Formulario completo cargado');
    
  } catch (err) {
    console.error('❌ Error cargando formulario:', err);
    container.innerHTML = '<p style="color:red">Error: ' + err.message + '</p>';
  }
}

// ============================================================================
// GENERAR CAMPO HTML
// ============================================================================

function generarCampo(col, tablaNombre) {
  const fieldId = `${tablaNombre}_${col.column_name}`;
  let typeDisplay = col.data_type;
  
  if (col.data_type === 'USER-DEFINED' && col.udt_name) {
    typeDisplay = `${col.udt_name} (ENUM)`;
  } else if (col.character_maximum_length) {
    typeDisplay = `${col.data_type}(${col.character_maximum_length})`;
  }
  
  const isRequired = col.is_nullable === false && !col.column_default;
  const requiredMark = isRequired ? '<span class="field-required" title="Campo requerido">*</span>' : '';
  
  let inputHTML = '';
  
  // Detectar ENUM
  if (col.data_type === 'USER-DEFINED' && col.udt_name) {
    const enumValues = window.dbCache.getEnumValues(col.udt_name);
    inputHTML = `
      <select id="${fieldId}" name="${col.column_name}" class="insert-form-input enum-select" data-table="${tablaNombre}">
        <option value="">NULL</option>
        ${enumValues ? enumValues.map(v => `<option value="${v}">${v}</option>`).join('') : ''}
      </select>
    `;
  }
  // Detectar FK (aunque en este caso no deberíamos tenerlas porque las hijas no apuntan al padre)
  else if (col.fk_comment && col.fk_comment.startsWith('FK -> ')) {
    inputHTML = `
      <select id="${fieldId}" name="${col.column_name}" class="insert-form-input" data-table="${tablaNombre}">
        <option value="">NULL</option>
      </select>
    `;
  }
  // Campos normales
  else {
    let inputType = 'text';
    let placeholder = 'Vacío (NULL)';
    
    if (col.data_type === 'integer' || col.data_type === 'bigint' || col.data_type === 'smallint') {
      inputType = 'number';
      placeholder = 'Número (NULL si vacío)';
    } else if (col.data_type === 'numeric' || col.data_type === 'decimal' || col.data_type === 'real' || col.data_type === 'double precision') {
      inputType = 'number';
      placeholder = 'Decimal (NULL si vacío)';
    } else if (col.data_type === 'boolean') {
      inputHTML = `
        <select id="${fieldId}" name="${col.column_name}" class="insert-form-input" data-table="${tablaNombre}">
          <option value="">NULL</option>
          <option value="true">Verdadero</option>
          <option value="false">Falso</option>
        </select>
      `;
    } else if (col.data_type === 'date') {
      inputType = 'date';
      placeholder = 'Fecha (NULL si vacío)';
    } else if (col.data_type === 'timestamp without time zone' || col.data_type === 'timestamp with time zone') {
      inputType = 'datetime-local';
      placeholder = 'Fecha y hora (NULL si vacío)';
    } else if (col.data_type === 'text') {
      placeholder = 'Texto largo (NULL si vacío)';
    } else {
      placeholder = `${col.data_type} (NULL si vacío)`;
    }
    
    if (!inputHTML) {
      inputHTML = `
        <input 
          type="${inputType}" 
          id="${fieldId}" 
          name="${col.column_name}" 
          class="insert-form-input" 
          placeholder="${placeholder}"
          data-table="${tablaNombre}"
          ${isRequired ? 'required' : ''}
        >
      `;
    }
  }
  
  return `
    <div class="insert-form-field">
      <div class="insert-form-label">
        <span>${formatDisplayName(col.column_name)}</span>
        <span class="field-type">${typeDisplay}</span>
        ${requiredMark}
      </div>
      ${inputHTML}
    </div>
  `;
}

// ============================================================================
// CARGAR LISTA DE MADRES (SOLO PARA HRF)
// ============================================================================

async function cargarMadres() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  
  const select = document.getElementById('madreIdSelect');
  select.innerHTML = '<option value="">Sin madre asociada (NULL)</option>';
  
  try {
    // Obtener todas las madres
    const { data, error } = await supabase
      .schema('mdr')
      .from('madre')
      .select('id')
      .order('id', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    
    if (data && data.length > 0) {
      data.forEach(madre => {
        const opt = document.createElement('option');
        opt.value = madre.id;
        opt.textContent = `Madre ID: ${madre.id}`;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('❌ Error cargando madres:', err);
  }
}

// ============================================================================
// RECOPILAR DATOS DEL FORMULARIO
// ============================================================================

function recopilarDatos() {
  const schema = window.getCurrentSchema();
  const datos = {};
  
  // Recopilar datos agrupados por tabla
  const secciones = document.querySelectorAll('.tabla-section');
  
  secciones.forEach(seccion => {
    const tablaNombre = seccion.dataset.table;
    const inputs = seccion.querySelectorAll('[data-table="' + tablaNombre + '"]');
    const datoTabla = {};
    
    inputs.forEach(input => {
      const nombre = input.name;
      
      // CRÍTICO: NUNCA incluir campos 'id' - deben ser auto-generados
      if (nombre === 'id') {
        console.warn('⚠️ Campo "id" detectado en formulario, saltando...');
        return;
      }
      
      let valor;
      
      if (input.tagName === 'SELECT') {
        valor = input.value === '' ? null : input.value;
      } else if (input.type === 'checkbox') {
        valor = input.checked;
      } else if (input.type === 'number') {
        valor = input.value === '' ? null : Number(input.value);
      } else if (input.type === 'date' || input.type === 'datetime-local') {
        valor = input.value === '' ? null : input.value;
      } else {
        valor = input.value === '' ? null : input.value;
      }
      
      datoTabla[nombre] = valor;
    });
    
    datos[tablaNombre] = datoTabla;
  });
  
  return datos;
}

// ============================================================================
// INSERTAR CASO COMPLETO
// ============================================================================

async function insertarCaso() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  
  const schema = window.getCurrentSchema();
  const btn = document.getElementById('insertCasoBtn');
  
  try {
    // Deshabilitar botón
    btn.disabled = true;
    btn.textContent = '⏳ Creando caso...';
    btn.style.backgroundColor = '#9e9e9e';
    
    // Recopilar datos
    const datosHijas = recopilarDatos();
    console.log('📦 Datos recopilados:', datosHijas);
    
    let resultado;
    
    if (schema === 'mdr') {
      // Generar ID aleatorio entre 3000 y 100000 para la madre
      const idMadre = Math.floor(Math.random() * (100000 - 3000 + 1)) + 3000;
      console.log('🎲 ID generado para madre:', idMadre);
      
      // Insertar caso de madre
      const { data, error } = await supabase.rpc('insert_caso_mdr', {
        p_id_madre: idMadre,
        p_datos_hijas: datosHijas
      });
      
      if (error) throw error;
      resultado = data;
      
    } else if (schema === 'hrf') {
      // Obtener madre_id si está seleccionada
      const madreIdSelect = document.getElementById('madreIdSelect');
      const madreId = madreIdSelect.value === '' ? null : parseInt(madreIdSelect.value);
      
      // Insertar caso de huérfano
      const { data, error } = await supabase.rpc('insert_caso_hrf', {
        p_madre_id: madreId,
        p_datos_hijas: datosHijas
      });
      
      if (error) throw error;
      resultado = data;
    }
    
    console.log('✅ Caso creado:', resultado);
    
    // Mostrar resultado
    mostrarResultado(resultado, schema);
    
    // Limpiar formulario
    limpiarFormulario();
    
  } catch (err) {
    console.error('❌ Error insertando caso:', err);
    alert(`Error al crear caso: ${err.message}`);
  } finally {
    // Rehabilitar botón
    btn.disabled = false;
    btn.textContent = '✓ Crear Caso Completo';
    btn.style.backgroundColor = '#4CAF50';
  }
}

// ============================================================================
// MOSTRAR RESULTADO
// ============================================================================

function mostrarResultado(resultado, schema) {
  const display = document.getElementById('casoIdDisplay');
  const schemaLabel = document.getElementById('schemaLabel');
  const casoIdValue = document.getElementById('casoIdValue');
  const hijasCreadas = document.getElementById('hijasCreadas');
  
  // Determinar el ID según el schema
  const casoId = schema === 'mdr' ? resultado.madre_id : resultado.huerfano_id;
  const labelText = schema === 'mdr' ? 'MADRE' : 'HUÉRFANO';
  
  schemaLabel.textContent = labelText;
  casoIdValue.textContent = casoId;
  
  // Mostrar tablas hijas creadas
  const idsHijas = resultado.ids_hijas || {};
  const tablasCreadas = Object.keys(idsHijas).map(tabla => {
    return `${formatDisplayName(tabla)} (ID: ${idsHijas[tabla]})`;
  }).join(', ');
  
  hijasCreadas.textContent = `Tablas creadas: ${tablasCreadas || 'Ninguna'}`;
  
  // Mostrar el display
  display.style.display = 'block';
  
  // Scroll al top
  display.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================================
// LIMPIAR FORMULARIO
// ============================================================================

function limpiarFormulario() {
  const inputs = document.querySelectorAll('.insert-form-input');
  inputs.forEach(input => {
    if (input.tagName === 'SELECT') {
      input.selectedIndex = 0;
    } else if (input.type === 'checkbox') {
      input.checked = false;
    } else {
      input.value = '';
    }
  });
}

// ============================================================================
// SETUP LISTENERS
// ============================================================================

function setupInsercionesListeners() {
  const insertBtn = document.getElementById('insertCasoBtn');
  if (insertBtn) {
    insertBtn.onclick = insertarCaso;
  }
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

// Limpiar instancia global de supabase al cambiar de módulo
window.addEventListener('easySQL:moduleChange', () => {
  window._supabaseInstance = null;
});

// Ejecutar setup y cargar formulario al cargar el módulo
setupInsercionesListeners();
cargarFormularioCaso();

// Escuchar cambios de esquema
window.addEventListener('schema:change', () => {
  console.log('Esquema cambiado, recargando formulario...');
  cargarFormularioCaso();
});

