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

let currentTableData = [];
let currentTableColumns = [];
let filteredData = []; // Datos después de aplicar búsqueda
let currentPage = 1;
let rowsPerPage = 50;
let searchTerm = '';

// Obtener todas las tablas disponibles
async function cargarTablas() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  
  const select = document.getElementById("tableSelect");
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

// OPTIMIZACIÓN: Obtener información de columnas desde caché
function obtenerColumnas(tabla) {
  const schema = window.getCurrentSchema();
  return window.dbCache.getTableColumns(schema, tabla);
}

// Obtener todos los datos de una tabla
async function cargarDatos(tabla) {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  
  try {
    sanitizeIdentifier(tabla);
    
    const schema = window.getCurrentSchema();
    // Usar función wrapper en lugar de .schema().from()
    const { data, error } = await supabase.rpc(`${schema}_select_all`, { tabla });
      
    if (error) {
      console.error("Error cargando datos:", error);
      alert("Error cargando datos: " + error.message);
      return;
    }
    
    // La función devuelve un jsonb, que ya es un array
    return data || [];
  } catch (err) {
    console.error("Error:", err);
    alert("Error: " + err.message);
    return [];
  }
}

// Obtener datos de referencia para una clave foránea
async function obtenerDatosReferencia(fkComment, valorClave) {
  const supabase = getSupabaseInstance();
  if (!supabase || !fkComment || !fkComment.startsWith('FK -> ')) return null;
  
  try {
    const refInfo = fkComment.substring(6);
    const [tablaRef, columnaRef] = refInfo.split('.');
    
    if (!tablaRef || !columnaRef) return null;
    
    sanitizeIdentifier(tablaRef);
    sanitizeIdentifier(columnaRef);
    
    const schema = window.getCurrentSchema();
    // Usar función mejorada que acepta valor como string
    const { data, error } = await supabase.rpc(`${schema}_select_one_by_value`, {
      tabla: tablaRef,
      columna: columnaRef,
      valor: String(valorClave) // Convertir a string para evitar problemas de tipo
    });
      
    if (error) {
      console.error("Error obteniendo referencia:", error);
      return null;
    }
    
    // La función devuelve un objeto JSON directamente, no un array
    return data && Object.keys(data).length > 0 ? data : null;
  } catch (err) {
    console.error("Error obteniendo referencia:", err);
    return null;
  }
}

// Crear la tabla HTML con los datos (CON PAGINACIÓN)
function crearTablaHTML(datos, columnas) {
  if (!datos || datos.length === 0) {
    return '<p>No hay datos para mostrar.</p>';
  }
  
  const headers = Object.keys(datos[0]);
  
  let html = '<table class="data-table">';
  
  // Cabeceras
  html += '<thead><tr>';
  headers.forEach(header => {
    html += `<th>${formatDisplayName(header)}</th>`;
  });
  html += '</tr></thead>';
  
  // Filas de datos
  html += '<tbody>';
  datos.forEach((fila, filaIndex) => {
    html += '<tr>';
    headers.forEach(header => {
      const valor = fila[header];
      const columna = columnas.find(col => col.column_name === header);
      const esClaveForeigna = columna && columna.fk_comment && columna.fk_comment.startsWith('FK -> ');
      
      if (esClaveForeigna && valor !== null && valor !== undefined) {
        html += `<td>
          <span class="foreign-key-cell" 
                data-fk-comment="${columna.fk_comment}" 
                data-fk-value="${valor}">
            ${valor}
          </span>
        </td>`;
      } else {
        html += `<td>${valor !== null && valor !== undefined ? valor : 'NULL'}</td>`;
      }
    });
    html += '</tr>';
  });
  html += '</tbody>';
  
  html += '</table>';
  return html;
}

// ============================================================================
// FUNCIONES DE BÚSQUEDA Y FILTRADO
// ============================================================================

// Filtrar datos según término de búsqueda
function filtrarDatos(datos, termino) {
  if (!termino || termino.trim() === '') {
    return datos;
  }
  
  const terminoLower = termino.toLowerCase();
  
  return datos.filter(fila => {
    // Buscar en todos los campos de la fila
    return Object.values(fila).some(valor => {
      if (valor === null || valor === undefined) return false;
      return String(valor).toLowerCase().includes(terminoLower);
    });
  });
}

// Actualizar información de búsqueda
function actualizarInfoBusqueda() {
  const searchInfo = document.getElementById('searchInfo');
  if (!searchInfo) return;
  
  if (searchTerm.trim() !== '') {
    const totalOriginal = currentTableData.length;
    const totalFiltrado = filteredData.length;
    searchInfo.textContent = `Se encontraron ${totalFiltrado} de ${totalOriginal} registros`;
    searchInfo.style.color = totalFiltrado > 0 ? '#27ae60' : '#e74c3c';
  } else {
    searchInfo.textContent = '';
  }
}

// ============================================================================
// FUNCIONES DE PAGINACIÓN
// ============================================================================

// Obtener datos de la página actual
function getDatosPaginaActual() {
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  return filteredData.slice(startIndex, endIndex);
}

// Calcular total de páginas
function getTotalPaginas() {
  return Math.ceil(filteredData.length / rowsPerPage);
}

// Renderizar tabla con paginación
function renderizarTablaPaginada() {
  const dataContainer = document.getElementById('dataContainer');
  const datosPagina = getDatosPaginaActual();
  
  const tablaHTML = crearTablaHTML(datosPagina, currentTableColumns);
  dataContainer.innerHTML = tablaHTML;
  
  actualizarControlesPaginacion();
  actualizarEstadisticas();
}

// Actualizar controles de paginación
function actualizarControlesPaginacion() {
  const totalPaginas = getTotalPaginas();
  
  const firstPageBtn = document.getElementById('firstPageBtn');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const lastPageBtn = document.getElementById('lastPageBtn');
  const paginationInfo = document.getElementById('paginationInfo');
  
  if (!firstPageBtn || !prevPageBtn || !nextPageBtn || !lastPageBtn || !paginationInfo) {
    return;
  }
  
  // Actualizar info
  paginationInfo.textContent = `Página ${currentPage} de ${totalPaginas}`;
  
  // Habilitar/deshabilitar botones
  firstPageBtn.disabled = currentPage === 1;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage >= totalPaginas;
  lastPageBtn.disabled = currentPage >= totalPaginas;
}

// Ir a primera página
function irAPrimeraPagina() {
  currentPage = 1;
  renderizarTablaPaginada();
}

// Ir a página anterior
function irAPaginaAnterior() {
  if (currentPage > 1) {
    currentPage--;
    renderizarTablaPaginada();
  }
}

// Ir a página siguiente
function irAPaginaSiguiente() {
  if (currentPage < getTotalPaginas()) {
    currentPage++;
    renderizarTablaPaginada();
  }
}

// Ir a última página
function irAUltimaPagina() {
  currentPage = getTotalPaginas();
  renderizarTablaPaginada();
}

// ============================================================================
// FUNCIONES DE ESTADÍSTICAS
// ============================================================================

// Actualizar tarjetas de estadísticas
function actualizarEstadisticas() {
  const statTotalRegistros = document.getElementById('statTotalRegistros');
  const statTotalColumnas = document.getElementById('statTotalColumnas');
  const statMostrando = document.getElementById('statMostrando');
  const statPaginaActual = document.getElementById('statPaginaActual');
  
  if (!statTotalRegistros || !statTotalColumnas || !statMostrando || !statPaginaActual) {
    return;
  }
  
  const totalPaginas = getTotalPaginas();
  const startIndex = (currentPage - 1) * rowsPerPage + 1;
  const endIndex = Math.min(currentPage * rowsPerPage, filteredData.length);
  
  statTotalRegistros.textContent = currentTableData.length.toLocaleString();
  statTotalColumnas.textContent = currentTableColumns.length;
  statMostrando.textContent = filteredData.length > 0 ? `${startIndex}-${endIndex} de ${filteredData.length}` : '0';
  statPaginaActual.textContent = `${currentPage} / ${totalPaginas}`;
}

// Mostrar/ocultar elementos de la interfaz
function mostrarElementosUI(mostrar) {
  const statsCards = document.getElementById('statsCards');
  const searchBar = document.getElementById('searchBar');
  const paginationControls = document.getElementById('paginationControls');
  const dataContainer = document.getElementById('dataContainer');
  
  const display = mostrar ? 'block' : 'none';
  
  if (statsCards) statsCards.style.display = mostrar ? 'grid' : 'none';
  if (searchBar) searchBar.style.display = display;
  if (paginationControls) paginationControls.style.display = mostrar ? 'flex' : 'none';
  if (dataContainer) dataContainer.style.display = display;
}

// Mostrar tooltip con datos de referencia
async function mostrarTooltipReferencia(elemento, fkComment, valor) {
  const tooltip = document.getElementById('foreignKeyTooltip');
  
  if (!tooltip) {
    console.error('Elemento foreignKeyTooltip no encontrado');
    return;
  }
  
  tooltip.innerHTML = '<strong>Cargando...</strong>';
  tooltip.style.display = 'block';
  
  // Posicionar el tooltip cerca del elemento
  const rect = elemento.getBoundingClientRect();
  tooltip.style.left = (rect.right + 10) + 'px';
  tooltip.style.top = rect.top + 'px';
  
  console.log('Buscando referencia para:', fkComment, valor);
  
  // Obtener los datos de referencia
  const datosRef = await obtenerDatosReferencia(fkComment, valor);
  
  console.log('Datos de referencia obtenidos:', datosRef);
  
  if (datosRef && Object.keys(datosRef).length > 0) {
    let contenido = '<strong>Referencia:</strong><br>';
    Object.entries(datosRef).forEach(([campo, valorCampo]) => {
      contenido += `<strong>${campo}:</strong> ${valorCampo !== null && valorCampo !== undefined ? valorCampo : 'NULL'}<br>`;
    });
    tooltip.innerHTML = contenido;
  } else {
    tooltip.innerHTML = '<strong>No se pudo cargar la referencia</strong><br><em>No se encontraron datos</em>';
  }
}

// Ocultar tooltip
function ocultarTooltip() {
  const tooltip = document.getElementById('foreignKeyTooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// Event listeners
function setupVisualizarDatosListeners() {
  const tableSelect = document.getElementById('tableSelect');
  const loadDataBtn = document.getElementById('loadDataBtn');
  const dataContainer = document.getElementById('dataContainer');
  
  if (!tableSelect || !loadDataBtn || !dataContainer) {
    console.error('No se encontraron los elementos necesarios');
    return;
  }
  
  // Habilitar/deshabilitar botón según selección
  tableSelect.onchange = (e) => {
    loadDataBtn.disabled = !e.target.value;
    mostrarElementosUI(false);
  };
  
  // Cargar datos al hacer clic en el botón
  loadDataBtn.onclick = async () => {
    const tabla = tableSelect.value;
    if (!tabla) return;
    
    loadDataBtn.disabled = true;
    loadDataBtn.textContent = 'Cargando...';
    dataContainer.innerHTML = '<p>Cargando datos...</p>';
    
    try {
      // Obtener columnas y datos en paralelo
      const [columnas, datos] = await Promise.all([
        obtenerColumnas(tabla),
        cargarDatos(tabla)
      ]);
      
      currentTableColumns = columnas;
      currentTableData = datos;
      filteredData = datos; // Inicialmente, datos filtrados = todos los datos
      currentPage = 1; // Resetear a primera página
      searchTerm = ''; // Limpiar búsqueda
      
      // Limpiar campo de búsqueda
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      
      const clearSearchBtn = document.getElementById('clearSearchBtn');
      if (clearSearchBtn) clearSearchBtn.style.display = 'none';
      
      // Mostrar elementos UI
      mostrarElementosUI(true);
      
      // Renderizar tabla paginada
      renderizarTablaPaginada();
      
    } catch (error) {
      console.error('Error cargando datos:', error);
      dataContainer.innerHTML = '<p style="color: red;">Error cargando los datos.</p>';
      mostrarElementosUI(false);
    } finally {
      loadDataBtn.disabled = false;
      loadDataBtn.textContent = 'Cargar Datos';
    }
  };
  
  // ============================================================================
  // EVENT LISTENERS DE BÚSQUEDA
  // ============================================================================
  
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  
  if (searchInput) {
    // Búsqueda en tiempo real con debounce
    let searchTimeout;
    searchInput.oninput = (e) => {
      const btnClear = document.getElementById('clearSearchBtn');
      if (btnClear) {
        btnClear.style.display = e.target.value ? 'flex' : 'none';
      }
      
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchTerm = e.target.value;
        filteredData = filtrarDatos(currentTableData, searchTerm);
        currentPage = 1; // Volver a la primera página
        renderizarTablaPaginada();
        actualizarInfoBusqueda();
      }, 300); // 300ms de debounce
    };
  }
  
  if (clearSearchBtn) {
    clearSearchBtn.onclick = () => {
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      clearSearchBtn.style.display = 'none';
      searchTerm = '';
      filteredData = currentTableData;
      currentPage = 1;
      renderizarTablaPaginada();
      actualizarInfoBusqueda();
    };
  }
  
  // ============================================================================
  // EVENT LISTENERS DE PAGINACIÓN
  // ============================================================================
  
  const firstPageBtn = document.getElementById('firstPageBtn');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const lastPageBtn = document.getElementById('lastPageBtn');
  
  if (firstPageBtn) firstPageBtn.onclick = irAPrimeraPagina;
  if (prevPageBtn) prevPageBtn.onclick = irAPaginaAnterior;
  if (nextPageBtn) nextPageBtn.onclick = irAPaginaSiguiente;
  if (lastPageBtn) lastPageBtn.onclick = irAUltimaPagina;
  
  // ============================================================================
  // EVENT LISTENERS DE TOOLTIPS FK (SIN CAMBIOS)
  // ============================================================================
  
  // Event delegation para las celdas de claves foráneas
  dataContainer.addEventListener('mouseenter', async (e) => {
    if (e.target.classList.contains('foreign-key-cell')) {
      console.log('Mouse sobre FK cell');
      const fkComment = e.target.getAttribute('data-fk-comment');
      const valor = e.target.getAttribute('data-fk-value');
      await mostrarTooltipReferencia(e.target, fkComment, valor);
    }
  }, true);
  
  dataContainer.addEventListener('mouseleave', (e) => {
    if (e.target.classList.contains('foreign-key-cell')) {
      console.log('Mouse fuera de FK cell');
      ocultarTooltip();
    }
  }, true);
  
  // Ocultar tooltip al mover el mouse fuera del área
  document.addEventListener('mousemove', (e) => {
    const tooltip = document.getElementById('foreignKeyTooltip');
    if (!tooltip || tooltip.style.display !== 'block') return;
    
    const tooltipRect = tooltip.getBoundingClientRect();
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Si el mouse está fuera del tooltip y no sobre una celda FK, ocultar
    if (!e.target.classList.contains('foreign-key-cell') &&
        (mouseX < tooltipRect.left - 10 || mouseX > tooltipRect.right + 10 ||
         mouseY < tooltipRect.top - 10 || mouseY > tooltipRect.bottom + 10)) {
      ocultarTooltip();
    }
  });
  
  // También ocultar al hacer scroll
  document.addEventListener('scroll', () => {
    const tooltip = document.getElementById('foreignKeyTooltip');
    if (tooltip && tooltip.style.display === 'block') {
      ocultarTooltip();
    }
  });
}

// Limpiar instancia global de supabase al cambiar de módulo
window.addEventListener('easySQL:moduleChange', () => {
  window._supabaseInstance = null;
});

// Escuchar cambios de esquema
window.addEventListener('schema:change', () => {
  console.log('Esquema cambiado, recargando tablas...');
  cargarTablas();
  mostrarElementosUI(false);
  
  // Limpiar campo de búsqueda
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';
  
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  if (clearSearchBtn) clearSearchBtn.style.display = 'none';
});

// Ejecutar setup y cargar tablas al cargar el módulo
setupVisualizarDatosListeners();
cargarTablas();