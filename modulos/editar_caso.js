import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { sanitizeIdentifier, formatDisplayName } from "./seguridad.js";

// Variables globales
let tablasRelacionadas = [];
let rootTable = '';
let cambiosPendientes = {}; // { tabla_ID_campo: { tabla, id, campo, valorOriginal, valorNuevo } }

function getSupabaseInstance() {
  if (window._supabaseInstance) {
    return window._supabaseInstance;
  }
  
  const { url, key } = window.getSupabaseCreds();
  if (!url || !key) {
    alert("Error: No hay credenciales de Supabase disponibles");
    return null;
  }
  
  window._supabaseInstance = createClient(url, key);
  return window._supabaseInstance;
}

function getRootTable() {
  const schema = window.getCurrentSchema();
  return schema === 'mdr' ? 'madre' : 'huerfano';
}

// OPTIMIZACIÓN: Usar caché en lugar de llamadas RPC repetidas
function obtenerColumnas(tabla) {
  const schema = window.getCurrentSchema();
  return window.dbCache.getTableColumns(schema, tabla);
}

function obtenerValoresEnum(enumName) {
  return window.dbCache.getEnumValues(enumName);
}

// Cargar todas las tablas (OPTIMIZADO con caché)
async function cargarTablas() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  
  const loadingDiv = document.getElementById('loading-filters-edit');
  const filtersContainer = document.getElementById('filters-container-edit');
  
  if (loadingDiv) loadingDiv.style.display = 'block';
  if (filtersContainer) filtersContainer.style.display = 'none';
  
  // Esperar a que la caché esté lista
  if (window.dbCache && !window.dbCache.isCacheReady()) {
    console.log('⏳ Esperando a que la caché se inicialice...');
    await window.dbCache.waitForCache();
  }
  
  const schema = window.getCurrentSchema();
  rootTable = getRootTable();
  
  // OPTIMIZACIÓN: Usar caché en lugar de llamadas RPC
  const todasTablas = window.dbCache.getTables(schema);
  
  console.log(`📊 Total de tablas en schema ${schema}:`, todasTablas.length, todasTablas);
  console.log(`🔑 Tabla raíz que se filtrará: "${rootTable}"`);
  
  tablasRelacionadas = todasTablas.filter(table => table !== rootTable);
  
  console.log('✅ Tablas relacionadas (sin raíz):', tablasRelacionadas.length, tablasRelacionadas);
  
  await generarContenedoresFiltros();
  
  if (loadingDiv) loadingDiv.style.display = 'none';
  if (filtersContainer) filtersContainer.style.display = 'block';
}

async function generarContenedoresFiltros() {
  const container = document.getElementById('filters-container-edit');
  container.innerHTML = '';
  
  // OPTIMIZACIÓN: No usar await en loop, todo viene de caché
  for (const tabla of tablasRelacionadas) {
    const columnas = obtenerColumnas(tabla);
    
    const tableContainer = document.createElement('div');
    tableContainer.className = 'filter-table-container';
    tableContainer.dataset.table = tabla;
    
    const header = document.createElement('div');
    header.className = 'filter-table-header';
    header.innerHTML = `
      <span>${formatDisplayName(tabla)}</span>
      <span class="toggle-icon collapsed">▼</span>
    `;
    
    const body = document.createElement('div');
    body.className = 'filter-table-body';
    
    // Si no hay columnas, mostrar mensaje
    if (columnas.length === 0) {
      const mensaje = document.createElement('div');
      mensaje.className = 'filter-field';
      mensaje.style.color = '#999';
      mensaje.style.fontStyle = 'italic';
      mensaje.style.padding = '10px';
      mensaje.textContent = '⚠️ No hay columnas disponibles para esta tabla';
      body.appendChild(mensaje);
    }
    
    for (const col of columnas) {
      if (col.column_name === 'id' && col.is_primary) continue;
      
      const filterField = document.createElement('div');
      filterField.className = 'filter-field';
      
      const label = document.createElement('label');
      label.textContent = formatDisplayName(col.column_name);
      
      let input;
      const isEnum = col.data_type === 'USER-DEFINED' && col.udt_name && !col.udt_name.startsWith('_');
      
      if (isEnum) {
        const valoresEnum = obtenerValoresEnum(col.udt_name);
        input = document.createElement('select');
        input.className = 'filter-input';
        input.dataset.column = col.column_name;
        input.dataset.type = 'enum';
        
        const optEmpty = document.createElement('option');
        optEmpty.value = '';
        optEmpty.textContent = '-- Sin filtro --';
        input.appendChild(optEmpty);
        
        valoresEnum.forEach(val => {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = val;
          input.appendChild(opt);
        });
      } else if (col.data_type === 'boolean') {
        input = document.createElement('select');
        input.className = 'filter-input';
        input.dataset.column = col.column_name;
        input.dataset.type = 'boolean';
        
        const opts = [
          { value: '', text: '-- Sin filtro --' },
          { value: 'true', text: 'Sí' },
          { value: 'false', text: 'No' }
        ];
        
        opts.forEach(({ value, text }) => {
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = text;
          input.appendChild(opt);
        });
      } else if (col.data_type.includes('int') || col.data_type.includes('numeric') || col.data_type.includes('decimal')) {
        input = document.createElement('input');
        input.type = 'number';
        input.className = 'filter-input';
        input.dataset.column = col.column_name;
        input.dataset.type = 'number';
        input.placeholder = 'Filtrar por ' + col.column_name;
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'filter-input';
        input.dataset.column = col.column_name;
        input.dataset.type = 'text';
        input.placeholder = 'Filtrar por ' + col.column_name;
      }
      
      filterField.appendChild(label);
      filterField.appendChild(input);
      body.appendChild(filterField);
    }
    
    header.addEventListener('click', () => {
      const isCollapsed = body.classList.contains('expanded');
      const icon = header.querySelector('.toggle-icon');
      
      if (isCollapsed) {
        body.classList.remove('expanded');
        icon.classList.add('collapsed');
      } else {
        body.classList.add('expanded');
        icon.classList.remove('collapsed');
      }
    });
    
    tableContainer.appendChild(header);
    tableContainer.appendChild(body);
    container.appendChild(tableContainer);
  }
  
  const tablasRenderizadas = container.children.length;
  console.log(`📋 Editar Caso: ${tablasRenderizadas} tablas renderizadas de ${tablasRelacionadas.length} disponibles`);
  
  if (tablasRenderizadas < tablasRelacionadas.length) {
    console.warn(`⚠️ Se omitieron ${tablasRelacionadas.length - tablasRenderizadas} tablas (sin columnas o vacías)`);
  }
}

async function obtenerDatosTabla(tabla) {
  const supabase = getSupabaseInstance();
  if (!supabase) return [];
  
  const schema = window.getCurrentSchema();
  const { data, error } = await supabase.rpc(`${schema}_select_all`, { tabla });
  
  if (error) {
    console.error(`Error obteniendo datos de ${tabla}:`, error);
    return [];
  }
  
  return data || [];
}

async function buscarCasos() {
  const searchBtn = document.getElementById('searchBtnEdit');
  const resultsContainer = document.getElementById('results-container-edit');
  const resultsCount = document.getElementById('results-count-edit');
  const resultsTable = document.getElementById('results-table-edit');
  
  searchBtn.disabled = true;
  searchBtn.textContent = 'Buscando...';
  resultsContainer.style.display = 'none';
  
  // Resetear cambios pendientes
  cambiosPendientes = {};
  actualizarContadorCambios();
  
  try {
    const filtrosPorTabla = {};
    
    document.querySelectorAll('.filter-table-container').forEach(container => {
      const tabla = container.dataset.table;
      const inputs = container.querySelectorAll('.filter-input');
      const filtros = {};
      
      inputs.forEach(input => {
        const column = input.dataset.column;
        const type = input.dataset.type;
        let value = input.value;
        
        if (value !== '') {
          if (type === 'number') {
            filtros[column] = parseFloat(value);
          } else if (type === 'boolean') {
            filtros[column] = value === 'true';
          } else {
            filtros[column] = value;
          }
        }
      });
      
      if (Object.keys(filtros).length > 0) {
        filtrosPorTabla[tabla] = filtros;
      }
    });
    
    if (Object.keys(filtrosPorTabla).length === 0) {
      alert('Por favor, selecciona al menos un filtro');
      return;
    }
    
    let resultados = await obtenerDatosTabla(rootTable);
    
    for (const [tabla, filtros] of Object.entries(filtrosPorTabla)) {
      if (tabla === rootTable) {
        resultados = resultados.filter(row => {
          return Object.entries(filtros).every(([col, val]) => {
            if (typeof val === 'string') {
              return row[col] && row[col].toString().toLowerCase().includes(val.toLowerCase());
            }
            return row[col] === val;
          });
        });
      } else {
        const datosTabla = await obtenerDatosTabla(tabla);
        const idsValidos = new Set();
        
        datosTabla.forEach(row => {
          const cumpleFiltros = Object.entries(filtros).every(([col, val]) => {
            if (typeof val === 'string') {
              return row[col] && row[col].toString().toLowerCase().includes(val.toLowerCase());
            }
            return row[col] === val;
          });
          
          if (cumpleFiltros && row.id) {
            idsValidos.add(row.id);
          }
        });
        
        resultados = resultados.filter(row => idsValidos.has(row.id));
      }
    }
    
    await mostrarResultados(resultados);
    
  } catch (error) {
    console.error('Error en búsqueda:', error);
    alert('Error al buscar casos: ' + error.message);
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Buscar Casos';
  }
}

async function mostrarResultados(resultados) {
  const resultsContainer = document.getElementById('results-container-edit');
  const resultsCount = document.getElementById('results-count-edit');
  const resultsTable = document.getElementById('results-table-edit');
  const saveContainer = document.getElementById('save-changes-container');
  
  resultsContainer.style.display = 'block';
  resultsCount.textContent = `Se encontraron ${resultados.length} caso(s)`;
  saveContainer.style.display = 'block';
  
  if (resultados.length === 0) {
    resultsTable.innerHTML = '<div class="no-results">No se encontraron casos que cumplan los criterios de búsqueda</div>';
    return;
  }
  
  let html = '<div class="results-cards-container">';
  
  for (const resultado of resultados) {
    const casoId = resultado.id;
    html += `
      <div class="result-card">
        <div class="result-card-header" onclick="toggleCasoDetailsEdit(${casoId})">
          <span class="result-id">✏️ Caso ID: ${casoId}</span>
          <span class="toggle-icon" id="toggle-caso-edit-${casoId}">▼</span>
        </div>
        <div class="result-card-body" id="caso-details-edit-${casoId}" style="display: none;">
          <div class="loading-text">Cargando datos...</div>
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  resultsTable.innerHTML = html;
}

async function toggleCasoDetailsEdit(casoId) {
  const detailsDiv = document.getElementById(`caso-details-edit-${casoId}`);
  const toggleIcon = document.getElementById(`toggle-caso-edit-${casoId}`);
  
  if (detailsDiv.style.display === 'none') {
    detailsDiv.style.display = 'block';
    toggleIcon.textContent = '▲';
    
    if (detailsDiv.querySelector('.loading-text')) {
      await cargarDetallesCasoEdit(casoId, detailsDiv);
    }
  } else {
    detailsDiv.style.display = 'none';
    toggleIcon.textContent = '▼';
  }
}

async function cargarDetallesCasoEdit(casoId, container) {
  try {
    console.log(`✏️ Cargando detalles editables del caso ${casoId}...`);
    
    let html = '<div class="caso-tables-list">';
    let tablasEncontradas = 0;
    
    for (const tabla of tablasRelacionadas) {
      const datos = await obtenerDatosTablaPorId(tabla, casoId);
      
      if (datos && Object.keys(datos).length > 0) {
        console.log(`✅ Datos encontrados en ${tabla}`);
        tablasEncontradas++;
        
        html += `
          <div class="table-item">
            <div class="table-item-header" onclick="toggleTableFieldsEdit('${tabla}', ${casoId})">
              <span class="table-name">📂 ${tabla}</span>
              <span class="toggle-icon" id="toggle-table-edit-${tabla}-${casoId}">▶</span>
            </div>
            <div class="table-item-body" id="table-fields-edit-${tabla}-${casoId}" style="display: none;">
              ${await generarCamposEditables(tabla, casoId, datos)}
            </div>
          </div>
        `;
      }
    }
    
    html += '</div>';
    
    if (tablasEncontradas === 0) {
      container.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No se encontraron datos relacionados para este caso</div>';
    } else {
      container.innerHTML = html;
      console.log(`✅ Se cargaron ${tablasEncontradas} tablas editables`);
    }
    
  } catch (error) {
    console.error('❌ Error cargando detalles editables:', error);
    container.innerHTML = `<div style="color: red; padding: 15px;">Error: ${error.message}</div>`;
  }
}

async function obtenerDatosTablaPorId(tabla, id) {
  const supabase = getSupabaseInstance();
  if (!supabase) return null;
  
  const schema = window.getCurrentSchema();
  
  try {
    const { data, error } = await supabase.rpc(`${schema}_select_one_by_value`, { 
      tabla,
      columna: 'id',
      valor: id.toString()
    });
    
    if (error || !data || Object.keys(data).length === 0) {
      return null;
    }
    
    return data;
  } catch (e) {
    console.warn(`No se pudo obtener datos de ${tabla}:`, e);
    return null;
  }
}

async function generarCamposEditables(tabla, casoId, datos) {
  const columnas = obtenerColumnas(tabla); // Ya no es async, viene de caché
  let html = '<div class="fields-grid-edit">';
  
  for (const col of columnas) {
    if (col.column_name === 'id') continue;
    
    const campo = col.column_name;
    const valor = datos[campo];
    const valorMostrar = valor !== null && valor !== undefined ? valor : '';
    const isEnum = col.data_type === 'USER-DEFINED' && col.udt_name && !col.udt_name.startsWith('_');
    const key = `${tabla}_${casoId}_${campo}`;
    
    html += `<div class="field-item-edit" id="field-${key}">`;
    html += `<span class="field-label-edit">${campo}</span>`;
    
    // Crear input según el tipo
    if (isEnum) {
      const valoresEnum = obtenerValoresEnum(col.udt_name);
      html += `<select class="field-input-edit" data-key="${key}" data-original="${valorMostrar}" onchange="registrarCambio('${tabla}', ${casoId}, '${campo}', this)">`;
      html += `<option value="">(vacío)</option>`;
      valoresEnum.forEach(val => {
        const selected = val === valorMostrar ? 'selected' : '';
        html += `<option value="${val}" ${selected}>${val}</option>`;
      });
      html += `</select>`;
    } else if (col.data_type === 'boolean') {
      html += `<select class="field-input-edit" data-key="${key}" data-original="${valorMostrar}" onchange="registrarCambio('${tabla}', ${casoId}, '${campo}', this)">`;
      html += `<option value="">NULL</option>`;
      html += `<option value="true" ${valorMostrar === true ? 'selected' : ''}>Sí</option>`;
      html += `<option value="false" ${valorMostrar === false ? 'selected' : ''}>No</option>`;
      html += `</select>`;
    } else if (col.data_type.includes('int') || col.data_type.includes('numeric') || col.data_type.includes('decimal')) {
      html += `<input type="number" class="field-input-edit" data-key="${key}" data-original="${valorMostrar}" value="${valorMostrar}" oninput="registrarCambio('${tabla}', ${casoId}, '${campo}', this)">`;
    } else if (col.data_type === 'date') {
      html += `<input type="date" class="field-input-edit" data-key="${key}" data-original="${valorMostrar}" value="${valorMostrar}" onchange="registrarCambio('${tabla}', ${casoId}, '${campo}', this)">`;
    } else {
      html += `<input type="text" class="field-input-edit" data-key="${key}" data-original="${valorMostrar}" value="${valorMostrar}" oninput="registrarCambio('${tabla}', ${casoId}, '${campo}', this)">`;
    }
    
    html += `</div>`;
  }
  
  html += '</div>';
  return html;
}

function registrarCambio(tabla, casoId, campo, inputElement) {
  const key = `${tabla}_${casoId}_${campo}`;
  const valorOriginal = inputElement.dataset.original;
  const valorNuevo = inputElement.value;
  
  const fieldContainer = document.getElementById(`field-${key}`);
  
  // Si el valor volvió al original, eliminar del tracking
  if (valorNuevo === valorOriginal) {
    delete cambiosPendientes[key];
    fieldContainer.classList.remove('modified');
    inputElement.classList.remove('modified-input');
  } else {
    cambiosPendientes[key] = {
      tabla,
      id: casoId,
      campo,
      valorOriginal,
      valorNuevo
    };
    fieldContainer.classList.add('modified');
    inputElement.classList.add('modified-input');
  }
  
  actualizarContadorCambios();
}

function actualizarContadorCambios() {
  const contador = document.getElementById('changes-count');
  const saveBtn = document.getElementById('saveChangesBtn');
  const numCambios = Object.keys(cambiosPendientes).length;
  
  if (numCambios > 0) {
    contador.textContent = `${numCambios} cambio(s) pendiente(s)`;
    saveBtn.disabled = false;
  } else {
    contador.textContent = 'Sin cambios';
    saveBtn.disabled = true;
  }
}

async function guardarTodosCambios() {
  const saveBtn = document.getElementById('saveChangesBtn');
  const numCambios = Object.keys(cambiosPendientes).length;
  
  if (numCambios === 0) {
    alert('No hay cambios para guardar');
    return;
  }
  
  const confirmar = confirm(`¿Confirmas que deseas guardar ${numCambios} cambio(s)?`);
  if (!confirmar) return;
  
  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ Guardando...';
  
  const supabase = getSupabaseInstance();
  const schema = window.getCurrentSchema();
  
  let exitosos = 0;
  let errores = 0;
  
  for (const [key, cambio] of Object.entries(cambiosPendientes)) {
    try {
      console.log(`💾 Guardando cambio en ${cambio.tabla}.${cambio.campo} para ID ${cambio.id}`);
      
      const { error } = await supabase.rpc(`${schema}_update_row`, {
        tabla: cambio.tabla,
        id_val: cambio.id,
        campo: cambio.campo,
        valor: cambio.valorNuevo
      });
      
      if (error) {
        console.error(`❌ Error actualizando ${key}:`, error);
        errores++;
      } else {
        console.log(`✅ Actualizado ${key}`);
        exitosos++;
        
        // Actualizar el valor original en el input
        const input = document.querySelector(`[data-key="${key}"]`);
        if (input) {
          input.dataset.original = cambio.valorNuevo;
        }
      }
    } catch (e) {
      console.error(`❌ Excepción actualizando ${key}:`, e);
      errores++;
    }
  }
  
  saveBtn.textContent = '💾 Guardar Todos los Cambios';
  
  if (errores === 0) {
    alert(`✅ Se guardaron ${exitosos} cambio(s) correctamente`);
    cambiosPendientes = {};
    actualizarContadorCambios();
    
    // Limpiar los estilos de modificación
    document.querySelectorAll('.field-item-edit.modified').forEach(el => {
      el.classList.remove('modified');
    });
    document.querySelectorAll('.field-input-edit.modified-input').forEach(el => {
      el.classList.remove('modified-input');
    });
  } else {
    alert(`⚠️ Se guardaron ${exitosos} cambio(s) pero hubo ${errores} error(es). Revisa la consola.`);
  }
  
  saveBtn.disabled = false;
}

function toggleTableFieldsEdit(tabla, casoId) {
  const fieldsDiv = document.getElementById(`table-fields-edit-${tabla}-${casoId}`);
  const toggleIcon = document.getElementById(`toggle-table-edit-${tabla}-${casoId}`);
  
  if (fieldsDiv.style.display === 'none') {
    fieldsDiv.style.display = 'block';
    toggleIcon.textContent = '▼';
  } else {
    fieldsDiv.style.display = 'none';
    toggleIcon.textContent = '▶';
  }
}

function limpiarFiltros() {
  document.querySelectorAll('.filter-input').forEach(input => {
    if (input.tagName === 'SELECT') {
      input.selectedIndex = 0;
    } else {
      input.value = '';
    }
  });
  
  document.getElementById('results-container-edit').style.display = 'none';
  cambiosPendientes = {};
  actualizarContadorCambios();
}

function setupEditarCasoListeners() {
  const searchBtn = document.getElementById('searchBtnEdit');
  const clearBtn = document.getElementById('clearFiltersBtnEdit');
  const saveBtn = document.getElementById('saveChangesBtn');
  
  if (searchBtn) {
    searchBtn.addEventListener('click', buscarCasos);
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', limpiarFiltros);
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', guardarTodosCambios);
  }
}

// Funciones globales para onclick
window.toggleCasoDetailsEdit = toggleCasoDetailsEdit;
window.toggleTableFieldsEdit = toggleTableFieldsEdit;
window.registrarCambio = registrarCambio;

// Escuchar cambios de esquema
window.addEventListener('schema:change', () => {
  console.log('Esquema cambiado, recargando filtros de edición...');
  cargarTablas();
  document.getElementById('results-container-edit').style.display = 'none';
  cambiosPendientes = {};
  actualizarContadorCambios();
});

// Inicializar
setupEditarCasoListeners();
cargarTablas();
