/**
 * database-cache.js
 * Sistema centralizado de caché para metadatos de la base de datos
 * Se inicializa una sola vez al hacer login y almacena:
 * - Enumerados (enums)
 * - Columnas de todas las tablas (por schema)
 * - Información de FK/PK
 * - Tipos de datos
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js";

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
  lastUpdate: null
};

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
    const { data, error } = await supabase.rpc(`${schema}_get_public_tables`);
    
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
    const { data, error } = await supabase.rpc(`${schema}_get_table_columns`, { tabla });
    
    if (error) {
      console.error(`❌ Error cargando columnas de ${schema}.${tabla}:`, error);
      return false;
    }
    
    if (!cache.tableColumns[schema]) {
      cache.tableColumns[schema] = {};
    }
    
    cache.tableColumns[schema][tabla] = data || [];
    return true;
  } catch (err) {
    console.error(`❌ Excepción cargando columnas de ${schema}.${tabla}:`, err);
    return false;
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
 * Se llama una sola vez después del login exitoso
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
 */
export function clearCache() {
  cache.initialized = false;
  cache.loading = false;
  cache.enums = {};
  cache.tableColumns = { mdr: {}, hrf: {} };
  cache.tables = { mdr: [], hrf: [] };
  cache.lastUpdate = null;
  console.log('🗑️ Caché limpiada');
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
