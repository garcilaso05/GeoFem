// Menús permitidos por rol
export const MENUS = {
  USER: [
    'visualizar_datos',
    'generar_graficos',
    'geomapa'
  ],
  COLABORADOR: [
    // EXACTAMENTE estos módulos para modo colaborador (editor)
    'visualizar_datos',
    'generar_graficos',
    'geomapa',
    'editar_caso',
    'inserciones'
  ],
  ADMIN: 'ALL'
};

export default { MENUS };
