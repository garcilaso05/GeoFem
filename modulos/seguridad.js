// modulos/seguridad.js

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
 * @returns {string} El valor escapado.
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
