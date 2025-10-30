import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { sanitizeIdentifier } from "./seguridad.js";

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

// Obtener todas las tablas disponibles
async function cargarTablas() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  
  const select = document.getElementById("tableSelect");
  select.innerHTML = '<option value="">Selecciona una tabla...</option>';
  
  const schema = window.getCurrentSchema();
  // Usar función wrapper en public según el esquema
  const { data, error } = await supabase.rpc(`${schema}_get_public_tables`);
  if (error || !data) {
    console.error("Error completo:", error);
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

// Obtener información de columnas de una tabla
async function obtenerColumnas(tabla) {
  const supabase = getSupabaseInstance();
  if (!supabase) return [];
  
  const schema = window.getCurrentSchema();
  const { data, error } = await supabase.rpc(`${schema}_get_table_columns`, { tabla });
  if (error || !data) {
    console.error("Error obteniendo columnas:", error);
    return [];
  }
  
  return data;
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

// Crear la tabla HTML con los datos
function crearTablaHTML(datos, columnas) {
  if (!datos || datos.length === 0) {
    return '<p>No hay datos para mostrar.</p>';
  }
  
  const headers = Object.keys(datos[0]);
  
  let html = '<table class="data-table">';
  
  // Cabeceras
  html += '<thead><tr>';
  headers.forEach(header => {
    html += `<th>${header}</th>`;
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
    dataContainer.innerHTML = '';
    dataContainer.style.display = 'none';
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
      
      // Crear y mostrar la tabla
      const tablaHTML = crearTablaHTML(datos, columnas);
      dataContainer.innerHTML = tablaHTML;
      dataContainer.style.display = 'block';
      
    } catch (error) {
      console.error('Error cargando datos:', error);
      dataContainer.innerHTML = '<p style="color: red;">Error cargando los datos.</p>';
    } finally {
      loadDataBtn.disabled = false;
      loadDataBtn.textContent = 'Cargar Datos';
    }
  };
  
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
  document.getElementById('dataContainer').innerHTML = '';
  document.getElementById('dataContainer').style.display = 'none';
});

// Ejecutar setup y cargar tablas al cargar el módulo
setupVisualizarDatosListeners();
cargarTablas();