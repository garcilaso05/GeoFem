// modulos/seguridad.js
// Versión 2.0 - Incluye formateo de nombres para display

/**
 * Sanitiza un identificador de SQL (como nombre de tabla o columna) para prevenir inyección de SQL.
 * Solo permite caracteres alfanuméricos y guiones bajos. No puede empezar con número.
 * @param {string} identifier El identificador a sanitizar.
 * @returns {string} El identificador sanitizado.
 * @throws {Error} Si el identificador no es válido.
 */
const RESERVED_WORDS = new Set([
  'select','from','where','insert','update','delete','drop','table','create','alter','join','on','as','and','or','not','null','into','values','set','primary','key','foreign','references','unique','check','default','index','view','trigger','procedure','function','database','grant','revoke','union','all','distinct','order','by','group','having','limit','offset','case','when','then','else','end','exists','between','like','in','is','asc','desc','int','integer','varchar','char','text','date','timestamp','boolean','true','false'
]);

export function sanitizeIdentifier(identifier) {
  if (typeof identifier !== 'string') {
    throw new Error('El identificador debe ser una cadena.');
  }
  if (identifier.length < 1 || identifier.length > 64) {
    throw new Error('El identificador debe tener entre 1 y 64 caracteres.');
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Nombre inválido: "${identifier}". Solo se permiten caracteres alfanuméricos y guiones bajos, y no debe comenzar con un número.`);
  }
  if (RESERVED_WORDS.has(identifier.toLowerCase())) {
    throw new Error(`El identificador "${identifier}" es una palabra reservada de SQL.`);
  }
  return identifier;
}

/**
 * Escapa un valor de texto para ser usado dentro de una cadena SQL.
 * Reemplaza comillas simples por dobles comillas simples.
 * @param {string} value El valor a escapar.
 * @returns {string} El valor escapado.¡AJÁ! Creo que encontré el problema. El código está filtrando la tabla raíz (madre o huerfano), pero si tienes por ejemplo 7 tablas y 1 es la raíz, deberías ver 6 tablas. Pero creo que el problema es que la tabla raíz puede tener un nombre que no sea exactamente "madre" o "huerfano".
 Perfecto! Ahora vamos a añadir un conteo al final del proceso para confirmar cuántas tablas realmente se renderizaron:
 
 
 
 */
export function escapeSqlValue(value) {
  if (typeof value !== 'string' && value !== null && typeof value !== 'undefined') {
    throw new Error('Solo se pueden escapar valores de tipo string, null o undefined.');
  }
  if (value === null || typeof value === 'undefined') {
    return 'NULL';
  }
  // Opcional: rechazar caracteres de control no imprimibles
  if (/[^\x20-\x7E]/.test(value)) {
    throw new Error('El valor contiene caracteres no permitidos.');
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Formatea un nombre de base de datos para mostrarlo de forma legible.
 * Convierte: madre_contexto_edad (integer) → Madre Contexto Edad
 * 
 * Reglas:
 * - Reemplaza _ por espacios
 * - Capitaliza cada palabra
 * - Elimina tipos entre paréntesis (integer), (varchar), etc.
 * - Regla especial: "ano" → "Año" (por seriedad)
 * 
 * @param {string} name El nombre a formatear
 * @returns {string} El nombre formateado
 */
export function formatDisplayName(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  // 1. Eliminar tipos entre paréntesis: (integer), (varchar), etc.
  let formatted = name.replace(/\s*\([^)]*\)\s*/g, '');
  
  // 2. Reemplazar guiones bajos por espacios
  formatted = formatted.replace(/_/g, ' ');
  
  // 3. Capitalizar cada palabra
  formatted = formatted
    .toLowerCase()
    .split(' ')
    .map(word => {
      // Regla especial: "ano" → "Año"
      if (word === 'ano') {
        return 'Año';
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
  
  // 4. Limpiar espacios múltiples y trim
  formatted = formatted.replace(/\s+/g, ' ').trim();
  
  return formatted;
}

/**
 * Formatea un nombre de columna con su tipo de dato para mostrar.
 * Convierte: madre_contexto_edad (integer) → Madre Contexto Edad
 * 
 * @param {string} columnName El nombre de la columna
 * @param {string} dataType El tipo de dato (opcional, se eliminará del display)
 * @returns {string} El nombre formateado SIN el tipo de dato
 */
export function formatColumnName(columnName, dataType = null) {
  // Si viene con tipo incluido en el nombre, formatDisplayName ya lo elimina
  return formatDisplayName(columnName);
}
