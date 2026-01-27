import { db } from '../firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * accessInterceptor.js
 * - Leer /users/{uid}/access/tables una sola vez
 * - Guardar en memoria de sesión (window.sessionAccess)
 * - Eliminar de caché/memoria SOLO las tablas con valor === false
 *
 * RESTRICCIONES: no leer role, no leer insercionesPermitidas, no asumir valores por defecto.
 */
export async function applyAccessRestrictions(user) {
  try {
    if (!user || !user.uid) return;

    // Evitar múltiples lecturas si ya cargado para este uid
    if (window.sessionAccess && window.sessionAccess._loadedForUid === user.uid) {
      console.log('accessInterceptor: permisos ya cargados en esta sesión');
      return;
    }

    const accessRef = doc(db, 'users', user.uid, 'access', 'tables');
    const accessSnap = await getDoc(accessRef);
    const accessData = accessSnap.exists() ? accessSnap.data() : {};

    // Construir conjunto de tablas DENEGADAS explícitamente (valor === false)
    const denied = new Set();
    Object.keys(accessData).forEach(key => {
      // Nunca considerar la clave insercionesPermitidas en el filtrado
      if (key === 'insercionesPermitidas') return;
      const val = accessData[key];
      if (val === false) {
        denied.add(key);
      }
    });

    // Guardar solo lo necesario en memoria de sesión
    window.sessionAccess = {
      _loadedForUid: user.uid,
      denied: Array.from(denied)
    };

    console.log('accessInterceptor: permisos cargados (solo denied):', window.sessionAccess);

    // Filtrar sessionStorage cache si existe
    try {
      const key = 'geofem_db_cache';
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Filtrar tablas por schema: eliminar las tablas explícitamente denegadas
        if (parsed.tables) {
          Object.keys(parsed.tables).forEach(schema => {
            const arr = parsed.tables[schema] || [];
            parsed.tables[schema] = arr.filter(tbl => !denied.has(tbl));
          });
        }
        // Filtrar tableColumns
        if (parsed.tableColumns) {
          Object.keys(parsed.tableColumns).forEach(schema => {
            const obj = parsed.tableColumns[schema] || {};
            const filteredObj = {};
            Object.keys(obj).forEach(tbl => {
              if (!denied.has(tbl)) {
                filteredObj[tbl] = obj[tbl];
              }
            });
            parsed.tableColumns[schema] = filteredObj;
          });
        }

        sessionStorage.setItem(key, JSON.stringify(parsed));
        console.log('accessInterceptor: sessionStorage cache filtrada');
      }
    } catch (err) {
      console.error('accessInterceptor: error filtrando sessionStorage', err);
    }

    // Si no existe window.dbCache, no intentamos sobrescribir funciones
    if (!window.dbCache) {
      console.warn('accessInterceptor: window.dbCache no disponible, solo filtrado de sessionStorage aplicado');
      return;
    }

    // Guardar originales
    if (!window.dbCache._origGetTables) {
      window.dbCache._origGetTables = window.dbCache.getTables.bind(window.dbCache);
    }
    if (!window.dbCache._origGetTableColumns) {
      window.dbCache._origGetTableColumns = window.dbCache.getTableColumns.bind(window.dbCache);
    }

    // Reemplazar getTables: eliminar tablas explícitamente denegadas
    window.dbCache.getTables = function(schema) {
      const orig = window.dbCache._origGetTables(schema) || [];
      return orig.filter(tbl => !denied.has(tbl));
    };

    // Reemplazar getTableColumns: devolver vacío para tablas denegadas
    window.dbCache.getTableColumns = function(schema, tabla) {
      if (denied.has(tabla)) return [];
      return window.dbCache._origGetTableColumns(schema, tabla) || [];
    };

    console.log('accessInterceptor: interceptors aplicados (dbCache)');

  } catch (error) {
    console.error('accessInterceptor: error aplicando restricciones', error);
  }
}

export default { applyAccessRestrictions };
