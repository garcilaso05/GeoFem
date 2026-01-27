/**
 * menus.config.js
 * Define menús permitidos por rol. Solo describe los módulos exactos que
 * debe mostrar un COLABORADOR en modo editor.
 */
export const MENUS = {
  // ADMIN: sin cambios (tiene acceso total a los botones admin-only)
  ADMIN: 'ALL',

  // COLABORADOR (modo editor) -> exactamente estos módulos
  COLABORADOR: [
    'visualizar_datos',
    'generar_graficos',
    'geomapa',
    'buscar_caso',
    'editar_caso',
    'inserciones'
  ],

  // USER: comportamiento por defecto (no incluimos lista aquí)
  USER: null
};

export default { MENUS };
