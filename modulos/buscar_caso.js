import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { sanitizeIdentifier } from "./seguridad.js";

// Variables globales
let tablasRelacionadas = [];
let rootTable = ''; // 'madre' o 'huerfano' según el esquema
let allData = {}; // Cache de datos para filtrado

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

// Determinar tabla raíz según el esquema
function getRootTable() {
  const schema = window.getCurrentSchema();
  return schema === 'mdr' ? 'madre' : 'huerfano';
}

// Cargar todas las tablas del esquema (OPTIMIZADO con caché)
async function cargarTablas() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  
  const loadingDiv = document.getElementById('loading-filters');
  const filtersContainer = document.getElementById('filters-container');
  
  // Mostrar barra de carga
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
  
  // Filtrar tabla raíz (madre o huerfano) - solo contiene FKs
  tablasRelacionadas = todasTablas.filter(table => table !== rootTable);
  
  console.log('Tablas cargadas desde caché (sin raíz):', tablasRelacionadas);
  
  await generarContenedoresFiltros();
  
  // Ocultar barra de carga y mostrar filtros
  if (loadingDiv) loadingDiv.style.display = 'none';
  if (filtersContainer) filtersContainer.style.display = 'block';
}

// OPTIMIZACIÓN: Obtener columnas desde caché
function obtenerColumnas(tabla) {
  const schema = window.getCurrentSchema();
  return window.dbCache.getTableColumns(schema, tabla);
}

// OPTIMIZACIÓN: Obtener valores de un enum desde la caché global
function obtenerValoresEnum(enumName) {
  return window.dbCache.getEnumValues(enumName);
}

// Generar contenedores de filtros para cada tabla
async function generarContenedoresFiltros() {
  const container = document.getElementById('filters-container');
  container.innerHTML = '';
  
  // OPTIMIZACIÓN: Sin await, todo viene de caché
  for (const tabla of tablasRelacionadas) {
    const columnas = obtenerColumnas(tabla);
    
    if (columnas.length === 0) continue;
    
    const tableContainer = document.createElement('div');
    tableContainer.className = 'filter-table-container';
    tableContainer.dataset.table = tabla;
    
    // Header con toggle
    const header = document.createElement('div');
    header.className = 'filter-table-header';
    header.innerHTML = `
      <span>${tabla}</span>
      <span class="toggle-icon collapsed">▼</span>
    `;
    
    // Body con campos
    const body = document.createElement('div');
    body.className = 'filter-table-body';
    
    // Procesar columnas de forma asíncrona para cargar enums
    for (const col of columnas) {
      // Saltar claves primarias si es 'id'
      if (col.column_name === 'id' && col.is_primary) continue;
      
      const filterField = document.createElement('div');
      filterField.className = 'filter-field';
      
      const label = document.createElement('label');
      label.textContent = col.column_name;
      
      let input;
      
      // Detectar enums por data_type === 'USER-DEFINED'
      const isEnum = col.data_type === 'USER-DEFINED' && col.udt_name && !col.udt_name.startsWith('_');
      
      if (isEnum) {
        // Es un ENUM - obtener valores del cache global
        const valoresEnum = obtenerValoresEnum(col.udt_name);
        
        console.log(`✅ ENUM DETECTADO: ${col.column_name} -> ${col.udt_name}`, valoresEnum);
        
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
        // Boolean - crear select
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
        // Número - input number
        input = document.createElement('input');
        input.type = 'number';
        input.className = 'filter-input';
        input.dataset.column = col.column_name;
        input.dataset.type = 'number';
        input.placeholder = 'Filtrar por ' + col.column_name;
        
      } else {
        // Texto - input text
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
    
    // Toggle functionality
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
  
  console.log('Filtros generados para', tablasRelacionadas.length, 'tablas');
}

// Obtener datos de una tabla
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

// Aplicar filtros y buscar casos
async function buscarCasos() {
  const searchBtn = document.getElementById('searchBtn');
  const resultsContainer = document.getElementById('results-container');
  const resultsCount = document.getElementById('results-count');
  const resultsTable = document.getElementById('results-table');
  
  searchBtn.disabled = true;
  searchBtn.textContent = 'Buscando...';
  resultsContainer.style.display = 'none';
  
  try {
    // Recopilar filtros activos
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
    
    console.log('Filtros aplicados:', filtrosPorTabla);
    
    // Si no hay filtros, mostrar mensaje
    if (Object.keys(filtrosPorTabla).length === 0) {
      alert('Por favor, selecciona al menos un filtro');
      return;
    }
    
    // Cargar datos de la tabla raíz
    let resultados = await obtenerDatosTabla(rootTable);
    console.log(`Datos iniciales de ${rootTable}:`, resultados.length, 'registros');
    
    // Aplicar filtros progresivamente por cada tabla
    for (const [tabla, filtros] of Object.entries(filtrosPorTabla)) {
      if (tabla === rootTable) {
        // Filtrar directamente la tabla raíz
        resultados = resultados.filter(row => {
          return Object.entries(filtros).every(([col, val]) => {
            if (typeof val === 'string') {
              return row[col] && row[col].toString().toLowerCase().includes(val.toLowerCase());
            }
            return row[col] === val;
          });
        });
      } else {
        // Para otras tablas, cargar datos y filtrar por ID
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
        
        // Filtrar resultados por IDs válidos
        resultados = resultados.filter(row => idsValidos.has(row.id));
      }
      
      console.log(`Después de filtrar por ${tabla}:`, resultados.length, 'registros');
    }
    
    // Mostrar resultados
    mostrarResultados(resultados);
    
  } catch (error) {
    console.error('Error en búsqueda:', error);
    alert('Error al buscar casos: ' + error.message);
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Buscar Casos';
  }
}

// Mostrar resultados como tarjetas expandibles jerárquicas
async function mostrarResultados(resultados) {
  const resultsContainer = document.getElementById('results-container');
  const resultsCount = document.getElementById('results-count');
  const resultsTable = document.getElementById('results-table');
  
  resultsContainer.style.display = 'block';
  resultsCount.textContent = `Se encontraron ${resultados.length} caso(s)`;
  
  if (resultados.length === 0) {
    resultsTable.innerHTML = '<div class="no-results">No se encontraron casos que cumplan los criterios de búsqueda</div>';
    return;
  }
  
  // Crear tarjetas para cada resultado
  let html = '<div class="results-cards-container">';
  
  for (const resultado of resultados) {
    const casoId = resultado.id;
    html += `
      <div class="result-card">
        <div class="result-card-header" onclick="toggleCasoDetails(${casoId})">
          <span class="result-id">📋 Caso ID: ${casoId}</span>
          <span class="toggle-icon" id="toggle-caso-${casoId}">▼</span>
        </div>
        <div class="result-card-body" id="caso-details-${casoId}" style="display: none;">
          <div class="loading-text">Cargando datos...</div>
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  resultsTable.innerHTML = html;
}

// Toggle de detalles de un caso
async function toggleCasoDetails(casoId) {
  const detailsDiv = document.getElementById(`caso-details-${casoId}`);
  const toggleIcon = document.getElementById(`toggle-caso-${casoId}`);
  
  if (detailsDiv.style.display === 'none') {
    // Expandir - cargar datos si no están cargados
    detailsDiv.style.display = 'block';
    toggleIcon.textContent = '▲';
    
    if (detailsDiv.querySelector('.loading-text')) {
      // Primera vez que se expande - cargar datos
      await cargarDetallesCaso(casoId, detailsDiv);
    }
  } else {
    // Colapsar
    detailsDiv.style.display = 'none';
    toggleIcon.textContent = '▼';
  }
}

// Cargar todos los detalles de un caso (tablas relacionadas)
async function cargarDetallesCaso(casoId, container) {
  try {
    console.log(`🔍 Cargando detalles del caso ${casoId}...`);
    console.log(`📋 Tablas relacionadas:`, tablasRelacionadas);
    
    let html = '<div class="caso-tables-list">';
    let tablasEncontradas = 0;
    
    // Obtener todas las tablas relacionadas (sin la raíz)
    for (const tabla of tablasRelacionadas) {
      console.log(`🔍 Buscando datos en tabla: ${tabla} para ID ${casoId}`);
      const datos = await obtenerDatosTablaPorId(tabla, casoId);
      
      if (datos && Object.keys(datos).length > 0) {
        console.log(`✅ Datos encontrados en ${tabla}:`, datos);
        tablasEncontradas++;
        
        html += `
          <div class="table-item">
            <div class="table-item-header" onclick="toggleTableFields('${tabla}', ${casoId})">
              <span class="table-name">📂 ${tabla}</span>
              <span class="toggle-icon" id="toggle-table-${tabla}-${casoId}">▶</span>
            </div>
            <div class="table-item-body" id="table-fields-${tabla}-${casoId}" style="display: none;">
              ${generarCamposTabla(datos)}
            </div>
          </div>
        `;
      } else {
        console.log(`⚠️ No hay datos en ${tabla} para ID ${casoId}`);
      }
    }
    
    html += '</div>';
    
    if (tablasEncontradas === 0) {
      container.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No se encontraron datos relacionados para este caso</div>';
      console.warn(`⚠️ No se encontraron datos en ninguna tabla para el caso ${casoId}`);
    } else {
      container.innerHTML = html;
      console.log(`✅ Se cargaron ${tablasEncontradas} tablas con datos`);
    }
    
  } catch (error) {
    console.error('❌ Error cargando detalles del caso:', error);
    container.innerHTML = `<div style="color: red; padding: 15px;">Error al cargar detalles: ${error.message}</div>`;
  }
}

// Obtener datos de una tabla específica para un ID
async function obtenerDatosTablaPorId(tabla, id) {
  const supabase = getSupabaseInstance();
  if (!supabase) {
    console.error('❌ No hay instancia de Supabase');
    return null;
  }
  
  const schema = window.getCurrentSchema();
  
  try {
    console.log(`🔎 Llamando a ${schema}_select_one_by_value(tabla: "${tabla}", columna: "id", valor: "${id}")`);
    
    // Usar select_one_by_value con columna 'id'
    const { data, error } = await supabase.rpc(`${schema}_select_one_by_value`, { 
      tabla,
      columna: 'id',
      valor: id.toString()
    });
    
    if (error) {
      console.error(`❌ Error en ${tabla}:`, error);
      return null;
    }
    
    // La función devuelve un objeto JSON directamente, no un array
    if (!data || Object.keys(data).length === 0) {
      console.log(`ℹ️ No hay datos en ${tabla} para id ${id}`);
      return null;
    }
    
    console.log(`✅ Datos obtenidos de ${tabla}:`, data);
    return data;
    
  } catch (e) {
    console.error(`❌ Excepción al obtener datos de ${tabla} para id ${id}:`, e);
    return null;
  }
}

// Generar HTML para los campos de una tabla
function generarCamposTabla(datos) {
  let html = '<div class="fields-grid">';
  
  for (const [campo, valor] of Object.entries(datos)) {
    // Saltar el campo ID
    if (campo === 'id') continue;
    
    const valorMostrar = valor !== null && valor !== undefined ? valor : '(vacío)';
    
    html += `
      <div class="field-item">
        <span class="field-label">${campo}:</span>
        <span class="field-value">${valorMostrar}</span>
      </div>
    `;
  }
  
  html += '</div>';
  return html;
}

// Toggle de campos de una tabla
function toggleTableFields(tabla, casoId) {
  const fieldsDiv = document.getElementById(`table-fields-${tabla}-${casoId}`);
  const toggleIcon = document.getElementById(`toggle-table-${tabla}-${casoId}`);
  
  if (fieldsDiv.style.display === 'none') {
    fieldsDiv.style.display = 'block';
    toggleIcon.textContent = '▼';
  } else {
    fieldsDiv.style.display = 'none';
    toggleIcon.textContent = '▶';
  }
}

// Hacer funciones globales para onclick
window.toggleCasoDetails = toggleCasoDetails;
window.toggleTableFields = toggleTableFields;

// Limpiar filtros
function limpiarFiltros() {
  document.querySelectorAll('.filter-input').forEach(input => {
    if (input.tagName === 'SELECT') {
      input.selectedIndex = 0;
    } else {
      input.value = '';
    }
  });
  
  document.getElementById('results-container').style.display = 'none';
}

// Setup event listeners
function setupBuscarCasoListeners() {
  const searchBtn = document.getElementById('searchBtn');
  const clearBtn = document.getElementById('clearFiltersBtn');
  
  if (searchBtn) {
    searchBtn.addEventListener('click', buscarCasos);
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', limpiarFiltros);
  }
}

// Escuchar cambios de esquema
window.addEventListener('schema:change', () => {
  console.log('Esquema cambiado, recargando filtros...');
  cargarTablas();
  document.getElementById('results-container').style.display = 'none';
});

// Inicializar módulo
setupBuscarCasoListeners();
cargarTablas();
