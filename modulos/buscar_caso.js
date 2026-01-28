import { createClient } from './supabase-shim.js';
import { sanitizeIdentifier, formatDisplayName } from "./seguridad.js";

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
  
  // Actualizar información del esquema en la UI
  actualizarInfoEsquema(schema, rootTable);
  
  // OPTIMIZACIÓN: Usar caché en lugar de llamadas RPC
  const todasTablas = window.dbCache.getTables(schema);
  
  console.log(`📊 Total de tablas en schema ${schema}:`, todasTablas.length, todasTablas);
  console.log(`🔑 Tabla raíz que se filtrará: "${rootTable}"`);
  
  // Filtrar tabla raíz (madre o huerfano) - solo contiene FKs
  tablasRelacionadas = todasTablas.filter(table => table !== rootTable);
  
  console.log('✅ Tablas relacionadas (sin raíz):', tablasRelacionadas.length, tablasRelacionadas);
  
  await generarContenedoresFiltros();
  
  // Ocultar barra de carga y mostrar filtros
  if (loadingDiv) loadingDiv.style.display = 'none';
  if (filtersContainer) filtersContainer.style.display = 'block';
}

// Actualizar información del esquema en la interfaz
function actualizarInfoEsquema(schema, rootTable) {
  const schemaDisplay = document.getElementById('current-schema-display');
  const rootTableDisplay = document.getElementById('root-table-display');
  
  if (schemaDisplay) {
    schemaDisplay.textContent = schema.toUpperCase();
    schemaDisplay.style.color = '#280743';
    schemaDisplay.style.fontWeight = '700';
  }
  
  if (rootTableDisplay) {
    rootTableDisplay.textContent = rootTable;
    rootTableDisplay.style.color = '#667eea';
    rootTableDisplay.style.fontWeight = '600';
  }
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
    
    const tableContainer = document.createElement('div');
    tableContainer.className = 'filter-table-container';
    tableContainer.dataset.table = tabla;
    
    // Header con toggle
    const header = document.createElement('div');
    header.className = 'filter-table-header';
    header.innerHTML = `
      <div class="table-header-content">
        <span class="table-name">${formatDisplayName(tabla)}</span>
        <span class="table-field-count">${columnas.length} campos</span>
      </div>
      <span class="toggle-icon collapsed">▼</span>
    `;
    
    // Body con campos
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
    
    // Procesar columnas de forma asíncrona para cargar enums
    for (const col of columnas) {
      // Saltar claves primarias si es 'id'
      if (col.column_name === 'id' && col.is_primary) continue;
      
      const filterField = document.createElement('div');
      filterField.className = 'filter-field';
      
      const label = document.createElement('label');
      label.textContent = formatDisplayName(col.column_name);
      
      let input;
      
      // Detectar ENUMs usando la función helper


      if (window.dbCache.isEnumColumn(col)) {


        // Es un ENUM - usar función helper para crear el select


        input = window.dbCache.createEnumSelect(col, null, {


          includeEmpty: true,


          emptyText: '-- Sin filtro --',


          className: 'filter-input'
        });

                if (input) {


          input.dataset.column = col.column_name;


          input.dataset.type = 'enum';


        } else {


          // Si falla, crear input text por defecto


          console.error(`❌ Error creando select para ENUM ${col.udt_name}`);


          input = document.createElement('input');


          input.type = 'text';


          input.className = 'filter-input';


          input.dataset.column = col.column_name;


          input.dataset.type = 'text';


          input.placeholder = 'Error cargando ENUM';


        }
        
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
  
  const tablasRenderizadas = container.children.length;
  console.log(`📋 Buscar Caso: ${tablasRenderizadas} tablas renderizadas de ${tablasRelacionadas.length} disponibles`);
  
  if (tablasRenderizadas < tablasRelacionadas.length) {
    console.warn(`⚠️ Se omitieron ${tablasRelacionadas.length - tablasRenderizadas} tablas (sin columnas o vacías)`);
  }
}

// Obtener datos de una tabla
async function obtenerDatosTabla(tabla) {
  const supabase = getSupabaseInstance();
  if (!supabase) return [];
  
  try {
    sanitizeIdentifier(tabla);
    
    const schema = window.getCurrentSchema();
    const { data, error } = await supabase
      .schema(schema)
      .from(tabla)
      .select('*');
    
    if (error) {
      console.error(`Error obteniendo datos de ${tabla}:`, error);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error(`Excepción obteniendo datos de ${tabla}:`, err);
    return [];
  }
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
  
  // Mensaje de resultados con mejor formato
  if (resultados.length === 0) {
    resultsCount.innerHTML = '<span class="result-status no-results-status">❌ No se encontraron casos</span> que cumplan los criterios especificados';
    resultsTable.innerHTML = '<div class="no-results">No se encontraron casos que cumplan los criterios de búsqueda.<br><em>Intenta ajustar los filtros y buscar nuevamente.</em></div>';
    return;
  }
  
  if (resultados.length === 1) {
    resultsCount.innerHTML = '<span class="result-status success-status">🎯 Se encontró <strong>1</strong> caso</span> que cumple los criterios';
  } else {
    resultsCount.innerHTML = `<span class="result-status success-status">📊 Se encontraron <strong>${resultados.length}</strong> casos</span> que cumplen los criterios`;
  }
  
  // Crear tarjetas elegantes para cada resultado
  let html = '<div class="results-cards-container">';
  
  for (const resultado of resultados) {
    const casoId = resultado.id;
    const schema = window.getCurrentSchema();
    const tablasPrevistas = window.dbCache.getTables(schema).filter(tabla => 
      tabla !== 'huerfano' && tabla !== 'madre'
    ).length;
    
    html += `
      <div class="result-card" onclick="abrirModalCaso(${casoId})">
        <div class="result-card-header">
          <div class="result-header-content">
            <div class="result-case-badge">
              <span>📋</span>
              <span>ID ${casoId}</span>
            </div>
            <div class="result-case-info">
              <h4 class="result-case-title">Caso de Feminicidio #${casoId}</h4>
              <p class="result-case-subtitle">Esquema: ${schema.toUpperCase()}</p>
            </div>
          </div>
          <div class="result-preview-info">
            <div class="result-stat">
              <div class="result-stat-number">${tablasPrevistas}</div>
              <div class="result-stat-label">Tablas</div>
            </div>
            <div class="result-stat">
              <div class="result-stat-number">•••</div>
              <div class="result-stat-label">Campos</div>
            </div>
          </div>
          <div class="result-view-icon">
            <img src="agregar.png" alt="Ver detalles" style="width: 24px; height: 24px;">
          </div>
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  resultsTable.innerHTML = html;
}

// Abrir modal elegante con detalles del caso
async function abrirModalCaso(casoId) {
  const modal = document.getElementById('caso-modal');
  const modalTitle = document.getElementById('modal-caso-title');
  const modalSubtitle = document.getElementById('modal-caso-subtitle');
  const modalContent = document.getElementById('modal-caso-content');
  
  // Configurar título del modal
  const schema = window.getCurrentSchema();
  modalTitle.textContent = `Caso de Feminicidio #${casoId}`;
  modalSubtitle.textContent = `Esquema: ${schema.toUpperCase()} • Información detallada`;
  
  // Mostrar modal con estado de carga
  modalContent.className = 'modal-loading';
  modalContent.innerHTML = `
    <div class="loading-spinner"></div>
    <p>Cargando información completa del caso...</p>
  `;
  
  // Mostrar modal con animación
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('show'), 10);
  
  // Cargar datos del caso
  try {
    await cargarDatosModalCaso(casoId, modalContent);
  } catch (error) {
    console.error('Error cargando datos del modal:', error);
    modalContent.innerHTML = `
      <div style="text-align: center; color: #dc3545; padding: 40px;">
        <h4>❌ Error al cargar datos</h4>
        <p>${error.message}</p>
      </div>
    `;
  }
}

// Cerrar modal elegante
function cerrarModalCaso() {
  const modal = document.getElementById('caso-modal');
  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300);
}

// Cerrar modal con tecla Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    cerrarModalCaso();
  }
});

// Cerrar modal al hacer click en el overlay
document.getElementById('caso-modal').addEventListener('click', function(e) {
  if (e.target === this) {
    cerrarModalCaso();
  }
});

// Buscar datos de un caso específico en una tabla
async function buscarDatosEnTabla(tabla, casoId, schema) {
  try {
    const supabase = getSupabaseInstance();
    if (!supabase) return null;
    
    console.log(`🔍 Buscando datos en tabla ${tabla} para caso ${casoId}`);
    
    const { data, error } = await supabase
      .schema(schema)
      .from(tabla)
      .select('*')
      .eq('id', casoId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No se encontraron datos (normal)
        console.log(`ℹ️ No hay datos en ${tabla} para caso ${casoId}`);
        return null;
      }
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Error buscando en tabla ${tabla}:`, error);
    return null;
  }
}

// Cargar datos del caso para el modal
async function cargarDatosModalCaso(casoId, container) {
  try {
    console.log(`🔍 Cargando datos del modal para caso ${casoId}...`);
    
    const schema = window.getCurrentSchema();
    const tablasRelacionadas = window.dbCache.getTables(schema).filter(tabla => 
      tabla !== 'huerfano' && tabla !== 'madre'
    );
    
    let html = '<div class="modal-caso-details"><div class="modal-tables-grid">';
    let datosEncontrados = false;
    let totalCampos = 0;
    
    for (const tabla of tablasRelacionadas) {
      const datos = await buscarDatosEnTabla(tabla, casoId, schema);
      
      if (datos && Object.keys(datos).length > 1) { // Más que solo ID
        datosEncontrados = true;
        const camposCount = Object.keys(datos).length - 1; // -1 por el campo ID
        totalCampos += camposCount;
        
        html += `
          <div class="modal-table-section">
            <div class="modal-table-header">
              <span class="modal-table-name">${formatDisplayName(tabla)}</span>
              <span class="modal-field-count">${camposCount} campos</span>
            </div>
            <div class="modal-table-fields">
              ${generarCamposModalTabla(datos)}
            </div>
          </div>
        `;
      }
    }
    
    html += '</div></div>';
    
    if (!datosEncontrados) {
      container.innerHTML = `
        <div class="modal-caso-details" style="text-align: center; color: #666; padding: 60px 30px;">
          <h4>📭 Sin datos disponibles</h4>
          <p>No se encontraron datos relacionados para este caso en las tablas del esquema.</p>
        </div>
      `;
    } else {
      container.innerHTML = html;
      
      // Actualizar contador en la tarjeta original si es posible
      const cards = document.querySelectorAll('.result-card');
      cards.forEach(card => {
        const badge = card.querySelector('.result-case-badge span:last-child');
        if (badge && badge.textContent.includes(casoId)) {
          const camposStat = card.querySelector('.result-stat:last-child .result-stat-number');
          if (camposStat) {
            camposStat.textContent = totalCampos;
          }
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error cargando datos del modal:', error);
    throw error;
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
    sanitizeIdentifier(tabla);
    console.log(`🔎 Obteniendo registro de ${schema}.${tabla} con id=${id}`);
    
    const { data, error } = await supabase
      .schema(schema)
      .from(tabla)
      .select('*')
      .eq('id', id)
      .single();
    
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

// Generar HTML para los campos del modal
function generarCamposModalTabla(datos) {
  let html = '<div class="modal-fields-grid">';
  
  for (const [campo, valor] of Object.entries(datos)) {
    // Saltar el campo ID
    if (campo === 'id') continue;
    
    const valorMostrar = valor !== null && valor !== undefined && valor !== '' ? valor : '';
    
    html += `
      <div class="modal-field-item">
        <span class="modal-field-label">${formatDisplayName(campo)}</span>
        <span class="modal-field-value">${valorMostrar}</span>
      </div>
    `;
  }
  
  html += '</div>';
  return html;
}

// Generar HTML para los campos de una tabla (versión legacy si se necesita)
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
window.abrirModalCaso = abrirModalCaso;
window.cerrarModalCaso = cerrarModalCaso;
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
