import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { sanitizeIdentifier, formatDisplayName } from "./seguridad.js";

// Coordenadas de las provincias de España
const PROVINCIAS_ESPANA = {
  'A Coruña': { lat: 43.3623, lon: -8.4115 },
  'Álava': { lat: 42.8467, lon: -2.6716 },
  'Albacete': { lat: 38.9943, lon: -1.8585 },
  'Alicante': { lat: 38.3452, lon: -0.4810 },
  'Almería': { lat: 36.8381, lon: -2.4597 },
  'Asturias': { lat: 43.3614, lon: -5.8593 },
  'Ávila': { lat: 40.6561, lon: -4.6814 },
  'Badajoz': { lat: 38.8794, lon: -6.9706 },
  'Barcelona': { lat: 41.3874, lon: 2.1686 },
  'Bizkaia': { lat: 43.2630, lon: -2.9350 },
  'Burgos': { lat: 42.3439, lon: -3.6969 },
  'Cáceres': { lat: 39.4753, lon: -6.3724 },
  'Cádiz': { lat: 36.5298, lon: -6.2927 },
  'Cantabria': { lat: 43.1829, lon: -3.9878 },
  'Castellón': { lat: 39.9864, lon: -0.0513 },
  'Ceuta': { lat: 35.8894, lon: -5.3213 },
  'Ciudad Real': { lat: 38.9848, lon: -3.9273 },
  'Córdoba': { lat: 37.8882, lon: -4.7794 },
  'Cuenca': { lat: 40.0704, lon: -2.1374 },
  'Gipuzkoa': { lat: 43.3183, lon: -1.9812 },
  'Girona': { lat: 41.9794, lon: 2.8214 },
  'Granada': { lat: 37.1773, lon: -3.5986 },
  'Guadalajara': { lat: 40.6328, lon: -3.1675 },
  'Huelva': { lat: 37.2614, lon: -6.9447 },
  'Huesca': { lat: 42.1401, lon: -0.4080 },
  'Illes Balears': { lat: 39.6953, lon: 3.0176 },
  'Jaén': { lat: 37.7796, lon: -3.7849 },
  'La Rioja': { lat: 42.2871, lon: -2.5396 },
  'Las Palmas': { lat: 28.1236, lon: -15.4366 },
  'León': { lat: 42.5987, lon: -5.5671 },
  'Lleida': { lat: 41.6175, lon: 0.6200 },
  'Lugo': { lat: 43.0097, lon: -7.5567 },
  'Madrid': { lat: 40.4168, lon: -3.7038 },
  'Málaga': { lat: 36.7213, lon: -4.4214 },
  'Melilla': { lat: 35.2923, lon: -2.9381 },
  'Murcia': { lat: 37.9922, lon: -1.1307 },
  'Navarra': { lat: 42.6954, lon: -1.6761 },
  'Ourense': { lat: 42.3406, lon: -7.8632 },
  'Palencia': { lat: 42.0095, lon: -4.5288 },
  'Pontevedra': { lat: 42.4338, lon: -8.6446 },
  'Salamanca': { lat: 40.9701, lon: -5.6635 },
  'Santa Cruz de Tenerife': { lat: 28.4636, lon: -16.2518 },
  'Segovia': { lat: 40.9429, lon: -4.1088 },
  'Sevilla': { lat: 37.3891, lon: -5.9845 },
  'Soria': { lat: 41.7665, lon: -2.4790 },
  'Tarragona': { lat: 41.1189, lon: 1.2445 },
  'Teruel': { lat: 40.3456, lon: -1.1065 },
  'Toledo': { lat: 39.8628, lon: -4.0273 },
  'Valencia': { lat: 39.4699, lon: -0.3763 },
  'Valladolid': { lat: 41.6523, lon: -4.7245 },
  'Zamora': { lat: 41.5034, lon: -5.7467 },
  'Zaragoza': { lat: 41.6488, lon: -0.8891 }
};

// Normalizar nombre de provincia
function normalizarProvincia(nombreProvincia) {
  if (!nombreProvincia) return null;
  
  const nombre = nombreProvincia.toString().trim();
  
  // Buscar coincidencia exacta (case insensitive)
  for (const provincia in PROVINCIAS_ESPANA) {
    if (provincia.toLowerCase() === nombre.toLowerCase()) {
      return provincia;
    }
  }
  
  // Buscar coincidencia parcial
  for (const provincia in PROVINCIAS_ESPANA) {
    if (provincia.toLowerCase().includes(nombre.toLowerCase()) || 
        nombre.toLowerCase().includes(provincia.toLowerCase())) {
      return provincia;
    }
  }
  
  return null;
}

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

// Estado del mapa
let mapaState = {
  map: null,
  markers: {},
  datos: null
};

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

async function inicializarModulo() {
  console.log('🗺️ Módulo Geomapa cargado');
  
  // Setup listeners
  setupGeomapaListeners();
  
  // Actualizar info del esquema
  actualizarInfoEsquema();
  
  console.log('✅ Módulo Geomapa inicializado');
}

// Setup de event listeners
function setupGeomapaListeners() {
  document.getElementById('cargarMapaBtn').addEventListener('click', cargarDatosEnMapa);
  
  // Escuchar cambios de esquema
  window.addEventListener('schema:change', async () => {
    console.log('Esquema cambiado, actualizando info...');
    actualizarInfoEsquema();
    
    // Limpiar mapa si existe
    if (mapaState.map) {
      limpiarMapa();
    }
    document.getElementById('geoEstadisticas').style.display = 'none';
    document.getElementById('geoTop5').style.display = 'none';
  });
  
  // Limpiar instancia global de supabase al cambiar de módulo
  window.addEventListener('easySQL:moduleChange', () => {
    window._supabaseInstance = null;
  });
}

// Actualizar información del esquema actual
function actualizarInfoEsquema() {
  const schema = window.getCurrentSchema();
  const tabla = getTablaContexto(schema);
  
  document.getElementById('geoEsquemaActual').textContent = schema === 'mdr' ? 'Madres' : 'Huérfanos';
  document.getElementById('geoTablaActual').textContent = formatDisplayName(tabla);
}

// Obtener la tabla de contexto según el esquema
function getTablaContexto(schema) {
  // Obtener lista de tablas del esquema desde la caché
  const tables = window.dbCache.getTables(schema);
  
  // Buscar tabla que contenga "contexto"
  const tablaContexto = tables.find(t => t.toLowerCase().includes('contexto'));
  
  if (!tablaContexto) {
    console.error(`❌ No se encontró tabla de contexto en ${schema}`);
    return null;
  }
  
  console.log(`📋 Tabla de contexto para ${schema}: ${tablaContexto}`);
  return tablaContexto;
}

// OBTENER CAMPO DE PROVINCIA
function getCampoProvincia(schema, tableName) {
  // Obtener columnas de la tabla desde la caché
  const columns = window.dbCache.getTableColumns(schema, tableName);
  
  // Buscar campo que contenga "provincia"
  const campoMatch = columns.find(col => col.column_name.toLowerCase().includes('provincia'));
  
  if (!campoMatch) {
    console.error(`❌ No se encontró campo de provincia en ${tableName}`);
    return null;
  }
  
  console.log(`📋 Campo de provincia: ${campoMatch.column_name}`);
  return campoMatch.column_name;
}

// INICIALIZAR MAPA
function inicializarMapa() {
  // Si ya existe el mapa, no lo reiniciamos
  if (mapaState.map) {
    return;
  }
  
  // Crear mapa centrado en España
  mapaState.map = L.map('map').setView([40.4168, -3.7038], 6);
  
  // Añadir capa de OpenStreetMap
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(mapaState.map);
}

// LIMPIAR MAPA
function limpiarMapa() {
  // Limpiar marcadores
  Object.values(mapaState.markers).forEach(marker => {
    mapaState.map.removeLayer(marker);
  });
  mapaState.markers = {};
}

// CREAR MARCADOR CON COLOR SEGÚN CANTIDAD
function crearMarcadorProvincia(provincia, cantidad) {
  const coords = PROVINCIAS_ESPANA[provincia];
  if (!coords) return null;
  
  // Determinar color según cantidad
  let color;
  if (cantidad <= 5) {
    color = '#51bbd6'; // Azul
  } else if (cantidad <= 20) {
    color = '#f1c40f'; // Amarillo
  } else if (cantidad <= 50) {
    color = '#e67e22'; // Naranja
  } else {
    color = '#e74c3c'; // Rojo
  }
  
  // Crear icono personalizado
  const icon = L.divIcon({
    html: `<div style="background-color: ${color}; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${cantidad}</div>`,
    className: 'custom-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
  
  // Crear marcador
  const marker = L.marker([coords.lat, coords.lon], { icon });
  
  // Popup con información
  marker.bindPopup(`
    <div class="marker-popup">
      <h4>${provincia}</h4>
      <p><strong>Víctimas:</strong> ${cantidad}</p>
    </div>
  `);
  
  return marker;
}

// CARGAR DATOS EN EL MAPA
async function cargarDatosEnMapa() {
  try {
    const supabase = getSupabaseInstance();
    if (!supabase) return;
    
    const schema = window.getCurrentSchema();
    const tableName = getTablaContexto(schema);
    
    if (!tableName) {
      alert('No se encontró la tabla de contexto para este esquema');
      return;
    }
    
    const provinciaField = getCampoProvincia(schema, tableName);
    
    if (!provinciaField) {
      alert('No se encontró el campo de provincia en la tabla');
      return;
    }
    
    console.log(`🔍 Cargando datos de ${tableName}, campo: ${provinciaField}`);
    
    // Inicializar mapa si no existe
    if (!mapaState.map) {
      inicializarMapa();
      // Ocultar mensaje vacío
      document.querySelector('.geomapa-vacio')?.remove();
    }
    
    // Obtener datos de la tabla con consulta directa
    const { data, error } = await supabase
      .schema(schema)
      .from(tableName)
      .select('*');
    
    if (error) {
      throw error;
    }
    
    if (!data || data.length === 0) {
      alert('No hay datos en la tabla');
      return;
    }
    
    console.log(`📊 ${data.length} registros encontrados`);
    
    // Agrupar por provincia y contar
    const victimaPorProvincia = {};
    let sinProvincia = 0;
    
    data.forEach(registro => {
      const provinciaRaw = registro[provinciaField];
      const provincia = normalizarProvincia(provinciaRaw);
      
      if (provincia) {
        victimaPorProvincia[provincia] = (victimaPorProvincia[provincia] || 0) + 1;
      } else {
        sinProvincia++;
      }
    });
    
    // Limpiar marcadores anteriores
    limpiarMapa();
    
    // Guardar datos
    mapaState.datos = victimaPorProvincia;
    
    // Crear marcadores
    Object.entries(victimaPorProvincia).forEach(([provincia, cantidad]) => {
      const marker = crearMarcadorProvincia(provincia, cantidad);
      if (marker) {
        marker.addTo(mapaState.map);
        mapaState.markers[provincia] = marker;
      }
    });
    
    // Actualizar estadísticas
    document.getElementById('geoTotalVictimas').textContent = data.length;
    document.getElementById('geoProvinciasConCasos').textContent = Object.keys(victimaPorProvincia).length;
    document.getElementById('geoSinProvincia').textContent = sinProvincia;
    
    document.getElementById('geoEstadisticas').style.display = 'block';
    
    // Mostrar Top 5
    mostrarTop5(victimaPorProvincia);
    
    console.log(`✅ Mapa cargado: ${Object.keys(victimaPorProvincia).length} provincias con casos`);
    console.log('📍 Distribución:', victimaPorProvincia);
    
    if (sinProvincia > 0) {
      console.warn(`⚠️ ${sinProvincia} registros sin provincia válida`);
    }
    
  } catch (error) {
    console.error('❌ Error cargando datos en mapa:', error);
    alert('Error al cargar datos en el mapa: ' + error.message);
  }
}

// MOSTRAR TOP 5 PROVINCIAS
function mostrarTop5(victimaPorProvincia) {
  const top5Lista = document.getElementById('geoTop5Lista');
  
  // Ordenar provincias por cantidad (mayor a menor)
  const ordenado = Object.entries(victimaPorProvincia)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  const posiciones = ['1ª', '2ª', '3ª', '4ª', '5ª'];
  
  // Generar HTML
  top5Lista.innerHTML = ordenado.map(([provincia, cantidad], index) => {
    let colorClass = '';
    if (index === 0) colorClass = 'top-red';
    else if (index === 1) colorClass = 'top-orange';
    else if (index === 2) colorClass = 'top-yellow';
    
    return `
      <div class="top5-item ${colorClass}">
        <div class="top5-ranking-text">${posiciones[index]}</div>
        <div class="top5-provincia">${provincia}</div>
        <div class="top5-count">${cantidad}</div>
      </div>
    `;
  }).join('');
  
  document.getElementById('geoTop5').style.display = 'block';
}

// Exponer funciones globales
window.cargarDatosEnMapa = cargarDatosEnMapa;

// Ejecutar inicialización cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarModulo);
} else {
  // El DOM ya está listo
  inicializarModulo();
}
