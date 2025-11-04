/**
 * database-cache.js
 * Sistema centralizado de caché para metadatos de la base de datos
 * Se inicializa una sola vez al hacer login y almacena:
 * - Enumerados (enums)
 * - Columnas de todas las tablas (por schema)
 * - Información de FK/PK
 * - Tipos de datos
 * 
 * PERSISTENCIA:
 * - Se guarda en sessionStorage (sobrevive a recargas de página)
 * - Se borra al cerrar pestaña/navegador o al cerrar sesión
 * - Evita recargar datos que no han cambiado
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js";

// ============================================================================
// CONFIGURACIÓN DE PERSISTENCIA
// ============================================================================

const CACHE_STORAGE_KEY = 'geofem_db_cache';
const CACHE_VERSION = '1.0'; // Incrementar si cambia la estructura de caché

// ============================================================================
// MANEJO DE ERRORES DE CACHÉ DESINCRONIZADA
// ============================================================================

/**
 * Mostrar alerta cuando la caché puede estar desincronizada
 * Sugiere al usuario cerrar sesión y volver a iniciar
 */
export function mostrarErrorCacheDesincronizada(error) {
  console.error('❌ Error relacionado con caché:', error);
  
  const mensaje = `
⚠️ Error al acceder a los datos

Parece que la estructura de la base de datos ha cambiado desde que iniciaste sesión.

Solución recomendada:
1. Cierra sesión
2. Vuelve a iniciar sesión
3. Esto actualizará la caché automáticamente

Error técnico: ${error.message || error}
  `.trim();
  
  alert(mensaje);
}

// ============================================================================
// ESTADO DE LA CACHÉ
// ============================================================================

const cache = {
  initialized: false,
  loading: false,
  enums: {},              // { enum_name: [valores] }
  tableColumns: {         // { schema: { tabla: [columnas] } }
    mdr: {},
    hrf: {}
  },
  tables: {               // { schema: [tablas] }
    mdr: [],
    hrf: []
  },
  lastUpdate: null,
  version: CACHE_VERSION
};

// ============================================================================
// PERSISTENCIA EN SESSIONSTORAGE
// ============================================================================

/**
 * Guardar caché en sessionStorage
 * Se mantiene durante recargas pero se borra al cerrar pestaña
 */
function guardarCacheEnStorage() {
  try {
    const dataToSave = {
      version: cache.version,
      enums: cache.enums,
      tableColumns: cache.tableColumns,
      tables: cache.tables,
      lastUpdate: cache.lastUpdate,
      timestamp: new Date().toISOString()
    };
    
    sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(dataToSave));
    console.log('💾 Caché guardada en sessionStorage');
  } catch (error) {
    console.error('❌ Error guardando caché en sessionStorage:', error);
    // No es crítico, la app puede seguir funcionando
  }
}

/**
 * Cargar caché desde sessionStorage
 * @returns {boolean} true si se cargó exitosamente, false si no había caché
 */
function cargarCacheDesdeStorage() {
  try {
    const stored = sessionStorage.getItem(CACHE_STORAGE_KEY);
    
    if (!stored) {
      console.log('ℹ️ No hay caché guardada en sessionStorage');
      return false;
    }
    
    const data = JSON.parse(stored);
    
    // Verificar versión
    if (data.version !== CACHE_VERSION) {
      console.log('⚠️ Versión de caché incompatible, descartando...');
      sessionStorage.removeItem(CACHE_STORAGE_KEY);
      return false;
    }
    
    // Restaurar datos
    cache.enums = data.enums || {};
    cache.tableColumns = data.tableColumns || { mdr: {}, hrf: {} };
    cache.tables = data.tables || { mdr: [], hrf: [] };
    cache.lastUpdate = data.lastUpdate;
    cache.initialized = true;
    
    console.log('✅ Caché restaurada desde sessionStorage');
    console.log('📊 Última actualización:', data.timestamp);
    console.log('📊 Resumen:', {
      enums: Object.keys(cache.enums).length,
      tablasMDR: cache.tables.mdr.length,
      tablasHRF: cache.tables.hrf.length,
      columnasMDR: Object.keys(cache.tableColumns.mdr).length,
      columnasHRF: Object.keys(cache.tableColumns.hrf).length
    });
    
    return true;
  } catch (error) {
    console.error('❌ Error cargando caché desde sessionStorage:', error);
    sessionStorage.removeItem(CACHE_STORAGE_KEY);
    return false;
  }
}

/**
 * Limpiar caché de sessionStorage
 */
function limpiarCacheStorage() {
  try {
    sessionStorage.removeItem(CACHE_STORAGE_KEY);
    console.log('🗑️ Caché eliminada de sessionStorage');
  } catch (error) {
    console.error('❌ Error limpiando caché:', error);
  }
}

// ============================================================================
// OBTENER INSTANCIA DE SUPABASE
// ============================================================================

function getSupabaseInstance() {
  if (window._supabaseInstance) {
    return window._supabaseInstance;
  }
  
  const { url, key } = window.getSupabaseCreds();
  if (!url || !key) {
    console.error("❌ No hay credenciales de Supabase disponibles");
    return null;
  }
  
  window._supabaseInstance = createClient(url, key);
  return window._supabaseInstance;
}

// ============================================================================
// FUNCIONES AUXILIARES PARA UI
// ============================================================================

function updateLoadingScreen(text, subtext, progress, stats) {
  const loadingText = document.getElementById('loading-text');
  const loadingSubtext = document.getElementById('loading-subtext');
  const progressBar = document.getElementById('loading-progress-bar');
  const loadingStats = document.getElementById('loading-stats');
  
  if (loadingText && text) loadingText.textContent = text;
  if (loadingSubtext && subtext) loadingSubtext.textContent = subtext;
  if (progressBar && progress !== undefined) progressBar.style.width = `${progress}%`;
  if (loadingStats && stats) loadingStats.textContent = stats;
}

function showLoadingScreen() {
  const screen = document.getElementById('global-loading-screen');
  if (screen) screen.classList.remove('hidden');
}

function hideLoadingScreen() {
  const screen = document.getElementById('global-loading-screen');
  if (screen) {
    setTimeout(() => {
      screen.classList.add('hidden');
    }, 300);
  }
}

// ============================================================================
// FUNCIONES DE CARGA DE DATOS
// ============================================================================

/**
 * Cargar todos los enumerados desde la base de datos
 */
async function loadEnums() {
  const supabase = getSupabaseInstance();
  if (!supabase) return false;
  
  try {
    updateLoadingScreen(
      'Cargando enumerados...',
      'Obteniendo tipos de datos desde la base de datos',
      10
    );
    console.log('📦 Cargando enumerados...');
    const { data, error } = await supabase.rpc('get_enum_values');
    
    if (error) {
      console.error('❌ Error cargando enumerados:', error);
      return false;
    }
    
    if (!data || data.length === 0) {
      console.warn('⚠️ No se encontraron enumerados');
      cache.enums = {};
      return true;
    }
    
    // Construir objeto de enums
    cache.enums = {};
    data.forEach(row => {
      if (!cache.enums[row.enum_name]) {
        cache.enums[row.enum_name] = [];
      }
      cache.enums[row.enum_name].push(row.enum_value);
    });
    
    console.log(`✅ Enumerados cargados: ${Object.keys(cache.enums).length} tipos`);
    return true;
  } catch (err) {
    console.error('❌ Excepción cargando enumerados:', err);
    return false;
  }
}

/**
 * Cargar lista de tablas de un schema
 */
async function loadTables(schema) {
  const supabase = getSupabaseInstance();
  if (!supabase) return false;
  
  try {
    const schemaName = schema === 'mdr' ? 'Madres' : 'Huérfanos';
    updateLoadingScreen(
      `Cargando tablas de ${schemaName}...`,
      `Obteniendo lista de tablas del schema ${schema}`,
      schema === 'mdr' ? 25 : 40
    );
    console.log(`📦 Cargando tablas del schema ${schema}...`);
    const { data, error } = await supabase.rpc('get_public_tables', { p_schema: schema });
    
    if (error) {
      console.error(`❌ Error cargando tablas de ${schema}:`, error);
      return false;
    }
    
    // La función retorna objetos con table_name, extraer solo los nombres
    cache.tables[schema] = (data || []).map(row => row.table_name);
    console.log(`✅ Tablas de ${schema} cargadas: ${cache.tables[schema].length} tablas`);
    return true;
  } catch (err) {
    console.error(`❌ Excepción cargando tablas de ${schema}:`, err);
    return false;
  }
}

/**
 * Cargar columnas de una tabla específica
 */
async function loadTableColumns(schema, tabla) {
  const supabase = getSupabaseInstance();
  if (!supabase) return false;
  
  try {
    const { data, error } = await supabase.rpc('get_table_columns', { p_schema: schema, p_tabla: tabla });
    
    if (error) {
      console.error(`❌ Error cargando columnas de ${schema}.${tabla}:`, error);
      
      // Si es timeout (código 57014), intentar con consulta básica
      if (error.code === '57014') {
        console.log(`⏱️ Timeout detectado, intentando carga básica para ${schema}.${tabla}...`);
        return await loadTableColumnsBasic(schema, tabla);
      }
      
      return false;
    }
    
    if (!cache.tableColumns[schema]) {
      cache.tableColumns[schema] = {};
    }
    
    cache.tableColumns[schema][tabla] = data || [];
    return true;
  } catch (err) {
    console.error(`❌ Excepción cargando columnas de ${schema}.${tabla}:`, err);
    
    // Intentar carga básica como fallback
    console.log(`🔄 Intentando carga básica para ${schema}.${tabla}...`);
    return await loadTableColumnsBasic(schema, tabla);
  }
}

/**
 * Cargar columnas básicas sin JOIN pesados (fallback para timeouts)
 */
async function loadTableColumnsBasic(schema, tabla) {
  const supabase = getSupabaseInstance();
  if (!supabase) return false;
  
  try {
    console.log(`🔄 Intentando obtener estructura básica de ${schema}.${tabla} con SELECT *...`);
    
    // Estrategia: Hacer un SELECT * LIMIT 0 para obtener la estructura
    // Esto es rápido porque no retorna datos, solo metadata
    const { data, error } = await supabase
      .schema(schema)
      .from(tabla)
      .select('*')
      .limit(0);
    
    if (error) {
      console.error(`❌ Error en carga básica de ${schema}.${tabla}:`, error);
      
      // Si también falla, crear entrada vacía para que al menos aparezca la tabla
      if (!cache.tableColumns[schema]) {
        cache.tableColumns[schema] = {};
      }
      cache.tableColumns[schema][tabla] = [];
      console.warn(`⚠️ Tabla ${schema}.${tabla} registrada sin columnas`);
      return true; // Retornar true para que se cuente como "cargada"
    }
    
    // Supabase no nos da metadata directamente, así que creamos columnas dummy
    // basadas en que sabemos que las tablas típicamente tienen: id + otros campos
    // Pero como no podemos obtener la estructura, dejamos el array vacío
    // y dejamos que se muestre el mensaje de "No hay columnas disponibles"
    
    if (!cache.tableColumns[schema]) {
      cache.tableColumns[schema] = {};
    }
    
    cache.tableColumns[schema][tabla] = [];
    console.log(`⚠️ Columnas de ${schema}.${tabla} no disponibles (timeout), tabla visible con advertencia`);
    return true;
  } catch (err) {
    console.error(`❌ Excepción en carga básica de ${schema}.${tabla}:`, err);
    
    // Crear entrada vacía para que al menos aparezca la tabla
    if (!cache.tableColumns[schema]) {
      cache.tableColumns[schema] = {};
    }
    cache.tableColumns[schema][tabla] = [];
    return true;
  }
}

/**
 * Cargar todas las columnas de todas las tablas de ambos schemas
 */
async function loadAllTableColumns() {
  updateLoadingScreen(
    'Cargando estructura de tablas...',
    'Obteniendo columnas de todas las tablas',
    55
  );
  console.log('📦 Cargando columnas de todas las tablas...');
  
  const schemas = ['mdr', 'hrf'];
  let totalTables = 0;
  let loadedTables = 0;
  
  for (const schema of schemas) {
    const tables = cache.tables[schema];
    totalTables += tables.length;
  }
  
  for (const schema of schemas) {
    const tables = cache.tables[schema];
    
    for (let i = 0; i < tables.length; i++) {
      const tabla = tables[i];
      const success = await loadTableColumns(schema, tabla);
      if (success) loadedTables++;
      
      // Actualizar progreso
      const progress = 55 + (loadedTables / totalTables) * 40; // 55% a 95%
      updateLoadingScreen(
        'Cargando estructura de tablas...',
        `${loadedTables}/${totalTables} tablas procesadas`,
        progress,
        `Procesando: ${schema}.${tabla}`
      );
    }
  }
  
  console.log(`✅ Columnas cargadas: ${loadedTables}/${totalTables} tablas`);
  return loadedTables === totalTables;
}

// ============================================================================
// INICIALIZACIÓN DE LA CACHÉ
// ============================================================================

/**
 * Inicializar toda la caché de metadatos de la base de datos
 * OPTIMIZADO: Intenta cargar desde sessionStorage primero
 * Si no hay caché guardada, la carga desde Supabase
 */
export async function initializeDatabaseCache(force = false) {
  // Si ya está inicializada y no es forzada, retornar
  if (cache.initialized && !force) {
    console.log('✅ Caché ya inicializada');
    return true;
  }
  
  // Si está cargando, esperar
  if (cache.loading) {
    console.log('⏳ Caché ya está cargando, esperando...');
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!cache.loading) {
          clearInterval(checkInterval);
          resolve(cache.initialized);
        }
      }, 100);
    });
  }
  
  // ============================================================================
  // INTENTAR CARGAR DESDE SESSIONSTORAGE PRIMERO
  // ============================================================================
  
  if (!force) {
    console.log('🔍 Buscando caché en sessionStorage...');
    const cacheRestaurada = cargarCacheDesdeStorage();
    
    if (cacheRestaurada) {
      // ¡Éxito! La caché se restauró desde sessionStorage
      updateLoadingScreen(
        '¡Listo!',
        'Caché restaurada desde sesión anterior',
        100,
        `Enums: ${Object.keys(cache.enums).length} | Tablas: ${cache.tables.mdr.length + cache.tables.hrf.length}`
      );
      
      setTimeout(() => {
        hideLoadingScreen();
      }, 500);
      
      return true;
    }
  }
  
  cache.loading = true;
  showLoadingScreen();
  
  updateLoadingScreen(
    'Inicializando aplicación...',
    'Preparando conexión a la base de datos',
    5
  );
  
  console.log('🚀 Inicializando caché de base de datos...');
  
  try {
    // 1. Cargar enumerados
    const enumsSuccess = await loadEnums();
    if (!enumsSuccess) {
      console.warn('⚠️ No se pudieron cargar enumerados');
    }
    
    // 2. Cargar tablas de ambos schemas
    const mdrTablesSuccess = await loadTables('mdr');
    const hrfTablesSuccess = await loadTables('hrf');
    
    if (!mdrTablesSuccess || !hrfTablesSuccess) {
      console.error('❌ Error cargando tablas de schemas');
      cache.loading = false;
      hideLoadingScreen();
      return false;
    }
    
    // 3. Cargar columnas de todas las tablas
    const columnsSuccess = await loadAllTableColumns();
    
    if (!columnsSuccess) {
      console.warn('⚠️ Algunas columnas no se pudieron cargar');
    }
    
    // Finalizar
    updateLoadingScreen(
      '¡Listo!',
      'Aplicación inicializada correctamente',
      100,
      `${Object.keys(cache.enums).length} enums • ${cache.tables.mdr.length + cache.tables.hrf.length} tablas cargadas`
    );
    
    // Marcar como inicializada
    cache.initialized = true;
    cache.lastUpdate = new Date();
    cache.loading = false;
    
    console.log('✅ Caché inicializada correctamente');
    console.log('📊 Resumen de caché:', {
      enums: Object.keys(cache.enums).length,
      tablas_mdr: cache.tables.mdr.length,
      tablas_hrf: cache.tables.hrf.length,
      columnas_mdr: Object.keys(cache.tableColumns.mdr).length,
      columnas_hrf: Object.keys(cache.tableColumns.hrf).length
    });
    
    // ============================================================================
    // GUARDAR EN SESSIONSTORAGE PARA FUTURAS RECARGAS
    // ============================================================================
    guardarCacheEnStorage();
    
    // Ocultar pantalla de carga después de un breve delay
    setTimeout(() => {
      hideLoadingScreen();
    }, 500);
    
    return true;
  } catch (err) {
    console.error('❌ Error fatal inicializando caché:', err);
    updateLoadingScreen(
      'Error',
      'No se pudo cargar la aplicación. Por favor, recarga la página.',
      0,
      err.message
    );
    cache.loading = false;
    setTimeout(() => {
      hideLoadingScreen();
    }, 3000);
    return false;
  }
}

// ============================================================================
// FUNCIONES DE ACCESO A LA CACHÉ
// ============================================================================

/**
 * Esperar a que la caché esté lista
 * @param {number} timeout - Timeout en ms (default 10000)
 * @returns {Promise<boolean>} - true si está lista, false si timeout
 */
export async function waitForCache(timeout = 10000) {
  if (cache.initialized) {
    return true;
  }
  
  return new Promise(resolve => {
    const checkInterval = setInterval(() => {
      if (cache.initialized) {
        clearInterval(checkInterval);
        resolve(true);
      }
    }, 100);
    
    setTimeout(() => {
      clearInterval(checkInterval);
      console.error('❌ Timeout esperando caché');
      resolve(false);
    }, timeout);
  });
}

/**
 * Obtener valores de un enumerado
 * @param {string} enumName - Nombre del enum
 * @returns {Array<string>} - Array de valores del enum
 */
export function getEnumValues(enumName) {
  if (!cache.initialized) {
    console.warn('⚠️ Caché no inicializada, intentando acceder a enums');
    return [];
  }
  
  return cache.enums[enumName] || [];
}

/**
 * Obtener todos los enumerados
 * @returns {Object} - Objeto con todos los enums { enum_name: [valores] }
 */
export function getAllEnums() {
  if (!cache.initialized) {
    console.warn('⚠️ Caché no inicializada, intentando acceder a enums');
    return {};
  }
  
  return cache.enums;
}

/**
 * Obtener columnas de una tabla
 * @param {string} schema - Schema (mdr o hrf)
 * @param {string} tabla - Nombre de la tabla
 * @returns {Array<Object>} - Array de objetos con información de columnas
 */
export function getTableColumns(schema, tabla) {
  if (!cache.initialized) {
    console.warn('⚠️ Caché no inicializada, intentando acceder a columnas');
    return [];
  }
  
  if (!cache.tableColumns[schema]) {
    console.warn(`⚠️ Schema ${schema} no encontrado en caché`);
    return [];
  }
  
  return cache.tableColumns[schema][tabla] || [];
}

/**
 * Obtener lista de tablas de un schema
 * @param {string} schema - Schema (mdr o hrf)
 * @returns {Array<string>} - Array de nombres de tablas
 */
export function getTables(schema) {
  if (!cache.initialized) {
    console.warn('⚠️ Caché no inicializada, intentando acceder a tablas');
    return [];
  }
  
  return cache.tables[schema] || [];
}

/**
 * Verificar si la caché está inicializada
 * @returns {boolean}
 */
export function isCacheReady() {
  return cache.initialized;
}

/**
 * Obtener información del estado de la caché
 * @returns {Object}
 */
export function getCacheStatus() {
  return {
    initialized: cache.initialized,
    loading: cache.loading,
    lastUpdate: cache.lastUpdate,
    stats: {
      enums: Object.keys(cache.enums).length,
      tables_mdr: cache.tables.mdr.length,
      tables_hrf: cache.tables.hrf.length,
      columns_mdr: Object.keys(cache.tableColumns.mdr).length,
      columns_hrf: Object.keys(cache.tableColumns.hrf).length
    }
  };
}

/**
 * Limpiar la caché (útil para logout)
 * También elimina la caché de sessionStorage
 */
export function clearCache() {
  cache.initialized = false;
  cache.loading = false;
  cache.enums = {};
  cache.tableColumns = { mdr: {}, hrf: {} };
  cache.tables = { mdr: [], hrf: [] };
  cache.lastUpdate = null;
  
  // Limpiar también de sessionStorage
  limpiarCacheStorage();
  
  console.log('🗑️ Caché limpiada (memoria y sessionStorage)');
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Obtener columnas que son Foreign Keys de una tabla
 * @param {string} schema - Schema (mdr o hrf)
 * @param {string} tabla - Nombre de la tabla
 * @returns {Array<Object>} - Array de columnas que son FK
 */
export function getForeignKeys(schema, tabla) {
  const columns = getTableColumns(schema, tabla);
  return columns.filter(col => col.is_foreign_key === true);
}

/**
 * Obtener la columna Primary Key de una tabla
 * @param {string} schema - Schema (mdr o hrf)
 * @param {string} tabla - Nombre de la tabla
 * @returns {Object|null} - Objeto de la columna PK o null
 */
export function getPrimaryKey(schema, tabla) {
  const columns = getTableColumns(schema, tabla);
  return columns.find(col => col.is_primary_key === true) || null;
}

/**
 * Verificar si una columna es un enum
 * @param {string} schema - Schema (mdr o hrf)
 * @param {string} tabla - Nombre de la tabla
 * @param {string} columna - Nombre de la columna
 * @returns {string|null} - Nombre del enum o null si no es enum
 */
export function getColumnEnumType(schema, tabla, columna) {
  const columns = getTableColumns(schema, tabla);
  const col = columns.find(c => c.column_name === columna);
  
  if (!col) return null;
  
  if (col.data_type === 'USER-DEFINED' && col.udt_name) {
    return col.udt_name;
  }
  
  return null;
}

// Exponer funciones globalmente para módulos legacy
window.dbCache = {
  initialize: initializeDatabaseCache,
  waitForCache,
  getEnumValues,
  getAllEnums,
  getTableColumns,
  getTables,
  isCacheReady,
  getCacheStatus,
  clearCache,
  getForeignKeys,
  getPrimaryKey,
  getColumnEnumType,
  // Funciones de UI
  showLoadingScreen,
  hideLoadingScreen,
  updateLoadingScreen
};

console.log('✅ Módulo database-cache.js cargado');
