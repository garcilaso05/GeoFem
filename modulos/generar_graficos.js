import { createClient } from './supabase-shim.js';
import { sanitizeIdentifier, formatDisplayName } from "./seguridad.js";
import { auth, db } from '../firebase-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================================================
// ESTADO GLOBAL
// ============================================================================

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

// Estado de gráficos
const graficosState = {
  graficos: [], // Array de objetos: {id, tipo, tabla, campo, chartInstance, datos, esFavorito}
  nextId: 1,
  maxFavoritos: 3,
  favoritosActuales: 0,
  currentUserId: null // ⚠️ IMPORTANTE: Se inicializa al cargar el módulo
};

// ============================================================================
// FIREBASE - GESTIÓN DE FAVORITOS
// ============================================================================

// Obtener el nombre del documento de favoritos según el esquema actual
function getDocumentoFavoritos() {
  const schema = window.getCurrentSchema();
  return schema === 'mdr' ? 'graficosMDR' : 'graficosHRF';
}

// Cargar favoritos desde Firebase
async function cargarFavoritosDesdeFirebase() {
  const user = auth.currentUser;
  if (!user) {
    console.warn('⚠️ No hay usuario autenticado, no se pueden cargar favoritos');
    return;
  }
  
  // Guardar el userId en el estado
  graficosState.currentUserId = user.uid;
  console.log('👤 Usuario actual:', user.uid);
  
  // Obtener el nombre del documento según el esquema
  const docName = getDocumentoFavoritos();
  console.log(`📂 Cargando favoritos del esquema: ${docName}`);
  
  try {
    const favoritesRef = doc(db, 'users', user.uid, 'favorites', docName);
    const favDoc = await getDoc(favoritesRef);
    
    if (favDoc.exists()) {
      const data = favDoc.data();
      console.log('📥 Favoritos cargados desde Firebase:', data);
      
      // Cargar hasta 3 gráficos favoritos
      for (let i = 1; i <= 3; i++) {
        const tipo = data[`TipoGrafico${i}`];
        const tabla = data[`TablaGrafico${i}`];
        const campo = data[`CampoGrafico${i}`];
        
        if (tipo && tabla && campo) {
          console.log(`📊 Generando gráfico favorito ${i}:`, { tipo, tabla, campo });
          await generarGrafico(tabla, campo, tipo, true);
        }
      }
    } else {
      console.log(`ℹ️ No hay favoritos guardados para ${docName}, creando documento vacío...`);
      // Crear documento vacío
      await setDoc(favoritesRef, {
        TipoGrafico1: null,
        TablaGrafico1: null,
        CampoGrafico1: null,
        TipoGrafico2: null,
        TablaGrafico2: null,
        CampoGrafico2: null,
        TipoGrafico3: null,
        TablaGrafico3: null,
        CampoGrafico3: null
      });
    }
  } catch (error) {
    console.error('❌ Error cargando favoritos:', error);
  }
}

// Guardar favoritos en Firebase
async function guardarFavoritosEnFirebase() {
  if (!graficosState.currentUserId) {
    console.error('❌ No hay userId guardado, no se puede guardar en Firebase');
    return;
  }
  
  // Obtener el nombre del documento según el esquema
  const docName = getDocumentoFavoritos();
  
  try {
    const favoritos = graficosState.graficos.filter(g => g.esFavorito);
    const data = {
      TipoGrafico1: null,
      TablaGrafico1: null,
      CampoGrafico1: null,
      TipoGrafico2: null,
      TablaGrafico2: null,
      CampoGrafico2: null,
      TipoGrafico3: null,
      TablaGrafico3: null,
      CampoGrafico3: null
    };
    
    favoritos.forEach((grafico, index) => {
      if (index < 3) {
        data[`TipoGrafico${index + 1}`] = grafico.tipo;
        data[`TablaGrafico${index + 1}`] = grafico.tabla;
        data[`CampoGrafico${index + 1}`] = grafico.campo;
      }
    });
    
    const favoritesRef = doc(db, 'users', graficosState.currentUserId, 'favorites', docName);
    await setDoc(favoritesRef, data);
    
    console.log(`💾 Favoritos guardados en Firebase (${docName}):`, data);
    console.log('📍 Ruta:', `users/${graficosState.currentUserId}/favorites/${docName}`);
  } catch (error) {
    console.error('❌ Error guardando favoritos:', error);
    alert('Error al guardar favoritos: ' + error.message);
  }
}

// ============================================================================
// UTILIDADES
// ============================================================================

// Cargar Chart.js si no está disponible
async function loadChartJS() {
  if (typeof Chart !== 'undefined') {
    return;
  }
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Actualizar contador de favoritos
function actualizarContadorFavoritos() {
  const count = graficosState.graficos.filter(g => g.esFavorito).length;
  graficosState.favoritosActuales = count;
  
  const contador = document.getElementById('favoritosCount');
  if (contador) {
    contador.textContent = count;
  } else {
    console.warn('⚠️ Elemento favoritosCount no encontrado en el DOM');
  }
  
  // Actualizar información del esquema
  const schemaInfo = document.getElementById('schemaFavoritosInfo');
  if (schemaInfo) {
    const schema = window.getCurrentSchema();
    const schemaName = schema === 'mdr' ? 'Madres' : 'Huérfanos';
    schemaInfo.textContent = `Esquema: ${schemaName} (favoritos independientes)`;
  }
}

// ============================================================================
// CARGAR DATOS DE SUPABASE
// ============================================================================

// Obtener todas las tablas disponibles
async function cargarTablas() {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  
  const select = document.getElementById("tableSelectGraph");
  select.innerHTML = '<option value="">Selecciona una tabla...</option>';
  
  // Esperar a que la caché esté lista
  if (window.dbCache && !window.dbCache.isCacheReady()) {
    await window.dbCache.waitForCache();
  }
  
  const schema = window.getCurrentSchema();
  const data = window.dbCache.getTables(schema);
  
  if (!data || data.length === 0) {
    console.error("Error obteniendo tablas");
    return;
  }
  
  data.forEach(tableName => {
    const opt = document.createElement("option");
    opt.value = tableName;
    opt.textContent = formatDisplayName(tableName);
    select.appendChild(opt);
  });
}

// Obtener campos de una tabla específica
async function cargarCamposTabla(tabla) {
  const supabase = getSupabaseInstance();
  if (!supabase) return;
  
  const select = document.getElementById("fieldSelectGraph");
  select.innerHTML = '<option value="">Selecciona un campo...</option>';
  select.disabled = !tabla;
  
  if (!tabla) return;
  
  try {
    sanitizeIdentifier(tabla);
    
    // Esperar a que la caché esté lista
    if (window.dbCache && !window.dbCache.isCacheReady()) {
      console.log('⏳ Esperando a que la caché se inicialice...');
      await window.dbCache.waitForCache();
    }
    
    // OPTIMIZACIÓN: Usar caché en lugar de RPC
    const schema = window.getCurrentSchema();
    const data = window.dbCache.getTableColumns(schema, tabla);
    
    if (!data || data.length === 0) {
      select.innerHTML = '<option value="">Error cargando campos</option>';
      return;
    }
    
    data.forEach(col => {
      const opt = document.createElement("option");
      opt.value = col.column_name;
      opt.textContent = formatDisplayName(col.column_name);
      select.appendChild(opt);
    });
    
  } catch (err) {
    console.error("Error:", err);
    select.innerHTML = '<option value="">Error: ' + err.message + '</option>';
  }
}

// Obtener datos para el gráfico
async function obtenerDatosGrafico(tabla, campo) {
  const supabase = getSupabaseInstance();
  if (!supabase) return null;
  
  try {
    sanitizeIdentifier(tabla);
    sanitizeIdentifier(campo);
    
    const schema = window.getCurrentSchema();
    // Consulta directa al schema para obtener solo una columna
    const { data, error } = await supabase
      .schema(schema)
      .from(tabla)
      .select(campo);
      
    if (error) {
      console.error("Error obteniendo datos:", error);
      return null;
    }
    
    // Procesar datos para contar ocurrencias
    const conteos = {};
    let totalRegistros = 0;
    
    data.forEach(row => {
      const valor = row[campo];
      const valorStr = valor !== null && valor !== undefined ? String(valor) : 'NULL';
      conteos[valorStr] = (conteos[valorStr] || 0) + 1;
      totalRegistros++;
    });
    
    // Convertir a formato para Chart.js con porcentajes
    const labels = Object.keys(conteos);
    const valores = Object.values(conteos);
    const porcentajes = valores.map(v => ((v / totalRegistros) * 100).toFixed(2));
    
    return {
      labels,
      valores,
      porcentajes,
      totalRegistros
    };
    
  } catch (err) {
    console.error("Error:", err);
    return null;
  }
}

// Generar colores aleatorios para el gráfico
function generarColores(cantidad) {
  const colores = [];
  const coloresPredefinidos = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#C9CBCF', '#4BC0C0', '#FF6384', '#36A2EB'
  ];
  
  for (let i = 0; i < cantidad; i++) {
    if (i < coloresPredefinidos.length) {
      colores.push(coloresPredefinidos[i]);
    } else {
      // Generar color aleatorio
      const hue = (i * 137.508) % 360; // Distribución áurea
      colores.push(`hsl(${hue}, 70%, 60%)`);
    }
  }
  
  return colores;
}

// ============================================================================
// RENDERIZADO DE GRÁFICOS
// ============================================================================

// Renderizar todos los gráficos en el panel derecho
function renderizarGraficos() {
  const container = document.getElementById('graficosContainer');
  
  // Verificar que el contenedor existe antes de intentar acceder
  if (!container) {
    console.warn('⚠️ Container graficosContainer no encontrado, esperando...');
    return;
  }
  
  if (graficosState.graficos.length === 0) {
    container.innerHTML = `
      <div class="graficos-vacio">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h3>No hay gráficos</h3>
        <p>Selecciona una tabla y un campo para generar tu primer gráfico</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  
  graficosState.graficos.forEach(grafico => {
    const card = crearTarjetaGrafico(grafico);
    container.appendChild(card);
    
    // Crear el gráfico dentro del canvas
    const canvas = card.querySelector(`#canvas-${grafico.id}`);
    if (canvas) {
      const ctx = canvas.getContext('2d');
      grafico.chartInstance = crearInstanciaChart(ctx, grafico.datos, grafico.tipo);
    } else {
      console.error('❌ Canvas no encontrado para gráfico ID:', grafico.id);
    }
  });
  
  actualizarContadorFavoritos();
}

// Crear tarjeta HTML para un gráfico
function crearTarjetaGrafico(grafico) {
  const card = document.createElement('div');
  card.className = 'grafico-card';
  card.id = `grafico-${grafico.id}`;
  
  const tiposGrafico = {
    'pie': '📊 Circular',
    'doughnut': '🍩 Dona',
    'bar': '📈 Barras V.',
    'horizontalBar': '📉 Barras H.',
    'line': '📈 Líneas',
    'scatter': '⚫ Puntos',
    'polarArea': '🎯 Polar',
    'radar': '🕸️ Radar'
  };
  
  card.innerHTML = `
    <div class="grafico-header">
      <div class="grafico-info">
        <h3>${formatDisplayName(grafico.tabla)} - ${formatDisplayName(grafico.campo)}</h3>
        <p>${tiposGrafico[grafico.tipo] || grafico.tipo} | ${grafico.datos.totalRegistros} registros</p>
      </div>
      <div class="grafico-actions">
        <button class="grafico-btn grafico-btn-favorito ${grafico.esFavorito ? 'activo' : ''}" 
                onclick="toggleFavorito(${grafico.id})"
                title="${grafico.esFavorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}">
          <img src="star.png" alt="Favorito" style="width: 20px; height: 20px; filter: ${grafico.esFavorito ? 'none' : 'grayscale(100%) brightness(0.7)'};">
        </button>
        <button class="grafico-btn grafico-btn-borrar" 
                onclick="borrarGrafico(${grafico.id})"
                ${grafico.esFavorito ? 'disabled' : ''}
                title="Borrar gráfico">
          <img src="trash.png" alt="Borrar" style="width: 20px; height: 20px;">
        </button>
      </div>
    </div>
    
    <div class="grafico-canvas-container">
      <canvas id="canvas-${grafico.id}"></canvas>
    </div>
    
    <div class="grafico-stats">
      <div class="grafico-stats-grid">
        <div class="grafico-stat-item">
          <strong>${grafico.datos.totalRegistros}</strong>
          <span>Total registros</span>
        </div>
        <div class="grafico-stat-item">
          <strong>${grafico.datos.labels.length}</strong>
          <span>Valores únicos</span>
        </div>
        <div class="grafico-stat-item">
          <strong>${Math.max(...grafico.datos.valores)}</strong>
          <span>Valor máximo</span>
        </div>
        <div class="grafico-stat-item">
          <strong>${Math.max(...grafico.datos.porcentajes)}%</strong>
          <span>Mayor porcentaje</span>
        </div>
      </div>
    </div>
  `;
  
  return card;
}

// Crear instancia de Chart.js
function crearInstanciaChart(ctx, datos, tipoGrafico = 'pie') {
  const colores = generarColores(datos.labels.length);
  
  // Configuración base del dataset
  let dataset = {
    data: datos.valores,
    backgroundColor: colores,
    borderColor: colores.map(color => color.replace('60%)', '40%)')),
    borderWidth: 2
  };
  
  // Configuraciones específicas según el tipo de gráfico
  let chartConfig = {
    type: tipoGrafico,
    data: {
      labels: datos.labels,
      datasets: [dataset]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `Distribución de valores - ${tipoGrafico.charAt(0).toUpperCase() + tipoGrafico.slice(1)}`,
          font: {
            size: 16
          }
        },
        legend: {
          position: 'bottom'
        }
      }
    }
  };
  
  // Ajustar configuración según el tipo de gráfico
  switch (tipoGrafico) {
    case 'pie':
    case 'doughnut':
    case 'polarArea':
      chartConfig.options.plugins.legend.labels = {
        generateLabels: function(chart) {
          const original = Chart.defaults.plugins.legend.labels.generateLabels;
          const labels = original.call(this, chart);
          
          labels.forEach((label, index) => {
            label.text = `${label.text}: ${datos.porcentajes[index]}%`;
          });
          
          return labels;
        }
      };
      chartConfig.options.plugins.tooltip = {
        callbacks: {
          label: function(context) {
            const label = context.label || '';
            const valor = context.parsed;
            const porcentaje = datos.porcentajes[context.dataIndex];
            return `${label}: ${valor} (${porcentaje}%)`;
          }
        }
      };
      break;
      
    case 'bar':
      chartConfig.type = 'bar';
      chartConfig.options.scales = {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Cantidad'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Valores'
          }
        }
      };
      chartConfig.options.plugins.tooltip = {
        callbacks: {
          label: function(context) {
            const valor = context.parsed.y;
            const porcentaje = datos.porcentajes[context.dataIndex];
            return `Cantidad: ${valor} (${porcentaje}%)`;
          }
        }
      };
      break;
      
    case 'horizontalBar':
      chartConfig.type = 'bar';
      chartConfig.options.indexAxis = 'y';
      chartConfig.options.scales = {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Cantidad'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Valores'
          }
        }
      };
      chartConfig.options.plugins.tooltip = {
        callbacks: {
          label: function(context) {
            const valor = context.parsed.x;
            const porcentaje = datos.porcentajes[context.dataIndex];
            return `Cantidad: ${valor} (${porcentaje}%)`;
          }
        }
      };
      break;
      
    case 'line':
      chartConfig.data.datasets[0].fill = false;
      chartConfig.data.datasets[0].tension = 0.1;
      chartConfig.options.scales = {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Cantidad'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Valores'
          }
        }
      };
      chartConfig.options.plugins.tooltip = {
        callbacks: {
          label: function(context) {
            const valor = context.parsed.y;
            const porcentaje = datos.porcentajes[context.dataIndex];
            return `Cantidad: ${valor} (${porcentaje}%)`;
          }
        }
      };
      break;
      
    case 'scatter':
      // Para scatter, convertimos a coordenadas x,y
      chartConfig.data.datasets[0].data = datos.labels.map((label, index) => ({
        x: index,
        y: datos.valores[index]
      }));
      chartConfig.data.datasets[0].showLine = false;
      chartConfig.options.scales = {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Cantidad'
          }
        },
        x: {
          type: 'linear',
          title: {
            display: true,
            text: 'Índice del valor'
          },
          ticks: {
            callback: function(value) {
              return datos.labels[Math.round(value)] || '';
            }
          }
        }
      };
      chartConfig.options.plugins.tooltip = {
        callbacks: {
          label: function(context) {
            const index = Math.round(context.parsed.x);
            const valor = context.parsed.y;
            const label = datos.labels[index];
            const porcentaje = datos.porcentajes[index];
            return `${label}: ${valor} (${porcentaje}%)`;
          }
        }
      };
      break;
      
    case 'radar':
      chartConfig.data.datasets[0].fill = true;
      chartConfig.data.datasets[0].backgroundColor = colores[0] + '40';
      chartConfig.options.scales = {
        r: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Cantidad'
          }
        }
      };
      chartConfig.options.plugins.tooltip = {
        callbacks: {
          label: function(context) {
            const valor = context.parsed.r;
            const porcentaje = datos.porcentajes[context.dataIndex];
            return `${context.label}: ${valor} (${porcentaje}%)`;
          }
        }
      };
      break;
  }
  
  return new Chart(ctx, chartConfig);
}

// ============================================================================
// GESTIÓN DE GRÁFICOS
// ============================================================================

// Generar un nuevo gráfico
async function generarGrafico(tabla, campo, tipo, esFavorito = false) {
  try {
    // Validar
    sanitizeIdentifier(tabla);
    sanitizeIdentifier(campo);
    
    // Obtener datos
    const datos = await obtenerDatosGrafico(tabla, campo);
    
    if (!datos || datos.labels.length === 0) {
      alert('No hay datos disponibles para este campo');
      return false;
    }
    
    // Crear objeto de gráfico
    const grafico = {
      id: graficosState.nextId++,
      tipo: tipo,
      tabla: tabla,
      campo: campo,
      datos: datos,
      chartInstance: null,
      esFavorito: esFavorito
    };
    
    // ⚠️ AÑADIR AL PRINCIPIO (arriba) en lugar de al final
    graficosState.graficos.unshift(grafico);
    
    // Renderizar todos los gráficos
    renderizarGraficos();
    
    return true;
    
  } catch (error) {
    console.error('Error generando gráfico:', error);
    alert('Error generando el gráfico: ' + error.message);
    return false;
  }
}

// Toggle favorito
window.toggleFavorito = async function(graficoId) {
  console.log('⭐ Toggle favorito llamado para gráfico ID:', graficoId);
  
  const grafico = graficosState.graficos.find(g => g.id === graficoId);
  if (!grafico) {
    console.error('❌ No se encontró el gráfico con ID:', graficoId);
    return;
  }
  
  console.log('📊 Gráfico encontrado:', { tabla: grafico.tabla, campo: grafico.campo, esFavorito: grafico.esFavorito });
  
  // Si ya es favorito, quitarlo
  if (grafico.esFavorito) {
    console.log('🔄 Quitando de favoritos...');
    grafico.esFavorito = false;
    renderizarGraficos();
    await guardarFavoritosEnFirebase();
    console.log('✅ Favorito quitado y guardado en Firebase');
    return;
  }
  
  // Si no es favorito, verificar límite
  const favoritosActuales = graficosState.graficos.filter(g => g.esFavorito).length;
  console.log(`📊 Favoritos actuales: ${favoritosActuales}/${graficosState.maxFavoritos}`);
  
  if (favoritosActuales >= graficosState.maxFavoritos) {
    alert(`Solo puedes tener ${graficosState.maxFavoritos} gráficos favoritos. Quita uno primero.`);
    return;
  }
  
  // Marcar como favorito
  console.log('⭐ Marcando como favorito...');
  grafico.esFavorito = true;
  renderizarGraficos();
  await guardarFavoritosEnFirebase();
  console.log('✅ Favorito añadido y guardado en Firebase');
};

// Borrar gráfico
window.borrarGrafico = function(graficoId) {
  const index = graficosState.graficos.findIndex(g => g.id === graficoId);
  if (index === -1) return;
  
  const grafico = graficosState.graficos[index];
  
  // No permitir borrar favoritos
  if (grafico.esFavorito) {
    alert('No puedes borrar un gráfico favorito. Quítalo de favoritos primero.');
    return;
  }
  
  // Destruir instancia de Chart.js
  if (grafico.chartInstance) {
    grafico.chartInstance.destroy();
  }
  
  // Eliminar del array
  graficosState.graficos.splice(index, 1);
  
  // Re-renderizar
  renderizarGraficos();
};

// ============================================================================
// INICIALIZACIÓN Y EVENT LISTENERS
// ============================================================================

// Event listeners
async function setupGraficosListeners() {
  const tableSelect = document.getElementById('tableSelectGraph');
  const fieldSelect = document.getElementById('fieldSelectGraph');
  const chartTypeSelect = document.getElementById('chartTypeSelect');
  const generateBtn = document.getElementById('generateGraphBtn');
  
  if (!tableSelect || !fieldSelect || !chartTypeSelect || !generateBtn) {
    console.error('No se encontraron los elementos necesarios');
    return;
  }
  
  // Cambio de tabla
  tableSelect.onchange = async (e) => {
    const tabla = e.target.value;
    await cargarCamposTabla(tabla);
    generateBtn.disabled = !tabla;
  };
  
  // Cambio de campo
  fieldSelect.onchange = (e) => {
    const campo = e.target.value;
    const tabla = tableSelect.value;
    generateBtn.disabled = !(tabla && campo);
  };
  
  // Generar gráfico
  generateBtn.onclick = async () => {
    const tabla = tableSelect.value;
    const campo = fieldSelect.value;
    const tipoGrafico = chartTypeSelect.value;
    
    if (!tabla || !campo) {
      alert('Selecciona una tabla y un campo');
      return;
    }
    
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generando...';
    
    try {
      // Cargar Chart.js si es necesario
      await loadChartJS();
      
      // Generar el gráfico
      const success = await generarGrafico(tabla, campo, tipoGrafico, false);
      
      if (!success) {
        alert('Error al generar el gráfico');
      }
      
    } catch (error) {
      console.error('Error generando gráfico:', error);
      alert('Error: ' + error.message);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generar Gráfico';
    }
  };
}

// Limpiar al cambiar de módulo
window.addEventListener('easySQL:moduleChange', () => {
  // Destruir todos los gráficos
  graficosState.graficos.forEach(g => {
    if (g.chartInstance) {
      g.chartInstance.destroy();
    }
  });
  
  // Resetear estado
  graficosState.graficos = [];
  graficosState.nextId = 1;
  graficosState.favoritosActuales = 0;
  
  window._supabaseInstance = null;
});

// Escuchar cambios de esquema
window.addEventListener('schema:change', async () => {
  console.log('🔄 Esquema cambiado, recargando favoritos y tablas...');
  
  // Destruir todos los gráficos
  graficosState.graficos.forEach(g => {
    if (g.chartInstance) {
      g.chartInstance.destroy();
    }
  });
  
  // Resetear
  graficosState.graficos = [];
  graficosState.nextId = 1;
  graficosState.favoritosActuales = 0;
  
  renderizarGraficos();
  cargarTablas();
  
  // Cargar favoritos del nuevo esquema
  await cargarFavoritosDesdeFirebase();
});

// ============================================================================
// INICIALIZACIÓN DEL MÓDULO
// ============================================================================

async function inicializarModulo() {
  console.log('🚀 Inicializando módulo de gráficos...');
  
  // Esperar a que el DOM esté completamente cargado
  if (document.readyState === 'loading') {
    await new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', resolve);
    });
  }
  
  // Verificar que el contenedor existe
  const container = document.getElementById('graficosContainer');
  if (!container) {
    console.error('❌ No se encontró el contenedor graficosContainer');
    return;
  }
  
  // Cargar Chart.js
  await loadChartJS();
  
  // Setup listeners
  await setupGraficosListeners();
  
  // Cargar tablas
  await cargarTablas();
  
  // Cargar favoritos desde Firebase
  await cargarFavoritosDesdeFirebase();
  
  console.log('✅ Módulo de gráficos inicializado');
}

// Ejecutar inicialización cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarModulo);
} else {
  // El DOM ya está listo
  inicializarModulo();
}