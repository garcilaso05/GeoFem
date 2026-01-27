import { db } from '../firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// accessInterceptor: responsibility single
// - leer /users/{uid}/access/tables una vez
// - guardar en window.sessionAccess
// - eliminar de la caché/memoria solo las tablas con valor === false
// NO debe leer role ni usar insercionesPermitidas para tomar decisiones
export async function applyAccessRestrictions(user) {
  try {
    if (!user || !user.uid) return;

    // Evitar múltiples lecturas si ya cargado
    if (window.sessionAccess && window.sessionAccess._loadedForUid === user.uid) {
      console.log('accessInterceptor: permisos ya cargados para', user.uid);
      return;
    }

    const accessRef = doc(db, 'users', user.uid, 'access', 'tables');
    const accessSnap = await getDoc(accessRef);
    const accessData = accessSnap.exists() ? accessSnap.data() : {};

    // Guardar lo leído en memoria de sesión. Incluir uid cargado para evitar relecturas.
    window.sessionAccess = Object.assign({}, accessData, { _loadedForUid: user.uid });

    console.log('accessInterceptor: permisos cargados en memoria', window.sessionAccess);

    // Filtrar copia en sessionStorage: solo borrar tablas con valor === false
    try {
      const key = 'geofem_db_cache';
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.tables) {
          Object.keys(parsed.tables).forEach(schema => {
            const arr = parsed.tables[schema] || [];
            parsed.tables[schema] = arr.filter(tbl => {
              // Si la entrada existe y es false => eliminar
              if (Object.prototype.hasOwnProperty.call(accessData, tbl)) {
                return accessData[tbl] !== false;
              }
              // Si no existe => mantener
              return true;
            });
          });
        }

        if (parsed.tableColumns) {
          Object.keys(parsed.tableColumns).forEach(schema => {
            const obj = parsed.tableColumns[schema] || {};
            const filteredObj = {};
            Object.keys(obj).forEach(tbl => {
              if (Object.prototype.hasOwnProperty.call(accessData, tbl)) {
                if (accessData[tbl] !== false) filteredObj[tbl] = obj[tbl];
              } else {
                filteredObj[tbl] = obj[tbl];
              }
            });
            parsed.tableColumns[schema] = filteredObj;
          });
        }

        sessionStorage.setItem(key, JSON.stringify(parsed));
        console.log('accessInterceptor: sessionStorage filtrado (solo tablas explicitamente false eliminadas)');
      }
    } catch (err) {
      console.error('accessInterceptor: error filtrando sessionStorage', err);
    }

    // Si no existe dbCache no se puede reemplazar funciones; salir con estado guardado en memoria
    if (!window.dbCache) {
      console.warn('accessInterceptor: window.dbCache no disponible; solo se aplicó filtro a sessionStorage');
      return;
    }

    // Guardar originales si no existen
    if (!window.dbCache._origGetTables) {
      window.dbCache._origGetTables = window.dbCache.getTables.bind(window.dbCache);
    }
    if (!window.dbCache._origGetTableColumns) {
      window.dbCache._origGetTableColumns = window.dbCache.getTableColumns.bind(window.dbCache);
    }

    // Reemplazar getTables: eliminar solo tablas con valor === false
    window.dbCache.getTables = function(schema) {
      const orig = window.dbCache._origGetTables(schema) || [];
      const filtered = orig.filter(tbl => {
        if (Object.prototype.hasOwnProperty.call(accessData, tbl)) {
          return accessData[tbl] !== false;
        }
        return true; // ausente => visible
      });
      return filtered;
    };

    // Reemplazar getTableColumns: si tabla existe y es false -> devolver []
    window.dbCache.getTableColumns = function(schema, tabla) {
      if (Object.prototype.hasOwnProperty.call(accessData, tabla) && accessData[tabla] === false) {
        return [];
      }
      return window.dbCache._origGetTableColumns(schema, tabla) || [];
    };

    console.log('accessInterceptor: interceptores aplicados en dbCache');

  } catch (error) {
    console.error('accessInterceptor: error cargando permisos', error);
  }
}

export default { applyAccessRestrictions };
