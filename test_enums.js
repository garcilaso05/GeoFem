/**
 * SCRIPT DE PRUEBA - Sistema de ENUMs
 * 
 * Ejecutar estos comandos en la consola del navegador después de hacer login
 * para verificar que el sistema de ENUMs funciona correctamente.
 */

// ============================================================
// PASO 1: Verificar que la caché está inicializada
// ============================================================

console.log('='.repeat(60));
console.log('PASO 1: Verificar inicialización de caché');
console.log('='.repeat(60));

if (window.dbCache) {
  console.log('✅ window.dbCache existe');
  
  if (window.dbCache.isCacheReady()) {
    console.log('✅ Caché inicializada correctamente');
  } else {
    console.error('❌ Caché NO inicializada - Cerrar sesión y volver a iniciar');
  }
} else {
  console.error('❌ window.dbCache NO existe - Error crítico');
}

// ============================================================
// PASO 2: Verificar funciones helper disponibles
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('PASO 2: Verificar funciones helper');
console.log('='.repeat(60));

const funcionesRequeridas = [
  'getEnumValues',
  'getAllEnums',
  'isEnumColumn',
  'createEnumSelect',
  'createEnumOptionsHTML',
  'getTableColumns',
  'getTables'
];

funcionesRequeridas.forEach(fn => {
  if (typeof window.dbCache[fn] === 'function') {
    console.log(`✅ ${fn} disponible`);
  } else {
    console.error(`❌ ${fn} NO disponible`);
  }
});

// ============================================================
// PASO 3: Verificar ENUMs cargados
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('PASO 3: Verificar ENUMs cargados');
console.log('='.repeat(60));

const todosLosEnums = window.dbCache.getAllEnums();
const nombresEnums = Object.keys(todosLosEnums);

console.log(`Total de ENUMs cargados: ${nombresEnums.length}`);

if (nombresEnums.length > 0) {
  console.log('✅ ENUMs encontrados:', nombresEnums);
  
  // Mostrar detalles de los primeros 3 ENUMs
  nombresEnums.slice(0, 3).forEach(nombre => {
    const valores = todosLosEnums[nombre];
    console.log(`  - ${nombre}: ${valores.length} valores`, valores);
  });
  
} else {
  console.error('❌ No se encontraron ENUMs en caché');
  console.error('   Posibles causas:');
  console.error('   1. La función get_enum_values() no está actualizada en Supabase');
  console.error('   2. Los permisos no están configurados');
  console.error('   3. No hay ENUMs en el schema public');
  console.error('   → Ejecutar sql/verificar_enums.sql en Supabase para diagnosticar');
}

// ============================================================
// PASO 4: Probar getEnumValues() con ENUMs comunes
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('PASO 4: Probar getEnumValues() con ENUMs comunes');
console.log('='.repeat(60));

const enumsComunes = [
  'estado_civil',
  'nivel_educativo',
  'nacionalidad',
  'genero',
  'tipo_documento'
];

enumsComunes.forEach(nombre => {
  const valores = window.dbCache.getEnumValues(nombre);
  
  if (valores.length > 0) {
    console.log(`✅ ${nombre}: ${valores.length} valores`, valores);
  } else {
    console.warn(`⚠️ ${nombre}: No encontrado o sin valores`);
  }
});

// ============================================================
// PASO 5: Probar isEnumColumn()
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('PASO 5: Probar isEnumColumn()');
console.log('='.repeat(60));

// Ejemplo de columnas de prueba
const columnasPrueba = [
  { column_name: 'estado_civil', data_type: 'USER-DEFINED', udt_name: 'estado_civil' },
  { column_name: 'nombre', data_type: 'text', udt_name: null },
  { column_name: 'edad', data_type: 'integer', udt_name: null },
  { column_name: 'datos_array', data_type: 'ARRAY', udt_name: '_text' }
];

columnasPrueba.forEach(col => {
  const esEnum = window.dbCache.isEnumColumn(col);
  const simbolo = esEnum ? '✅ ENUM' : '❌ NO ENUM';
  console.log(`${simbolo}: ${col.column_name} (${col.data_type})`);
});

// ============================================================
// PASO 6: Probar createEnumSelect()
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('PASO 6: Probar createEnumSelect()');
console.log('='.repeat(60));

// Buscar la primera columna ENUM real en la caché
let primeraColumnaEnum = null;
const schemas = ['mdr', 'hrf'];

buscarColumna:
for (const schema of schemas) {
  const tablas = window.dbCache.getTables(schema);
  
  for (const tabla of tablas) {
    const columnas = window.dbCache.getTableColumns(schema, tabla);
    
    for (const col of columnas) {
      if (window.dbCache.isEnumColumn(col)) {
        primeraColumnaEnum = { schema, tabla, col };
        break buscarColumna;
      }
    }
  }
}

if (primeraColumnaEnum) {
  console.log(`Probando con columna real: ${primeraColumnaEnum.schema}.${primeraColumnaEnum.tabla}.${primeraColumnaEnum.col.column_name}`);
  
  const select = window.dbCache.createEnumSelect(primeraColumnaEnum.col, null, {
    includeEmpty: true,
    emptyText: '-- Prueba --',
    className: 'test-select',
    id: 'test-enum-select'
  });
  
  if (select && select.tagName === 'SELECT') {
    console.log('✅ Select creado correctamente');
    console.log(`   Opciones: ${select.options.length}`);
    console.log(`   Clase: ${select.className}`);
    console.log(`   ID: ${select.id}`);
    
    // Mostrar las primeras 3 opciones
    const opciones = Array.from(select.options).slice(0, 3).map(opt => opt.value);
    console.log(`   Primeras opciones:`, opciones);
    
  } else {
    console.error('❌ createEnumSelect() falló');
  }
  
} else {
  console.warn('⚠️ No se encontró ninguna columna ENUM en las tablas');
}

// ============================================================
// PASO 7: Probar createEnumOptionsHTML()
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('PASO 7: Probar createEnumOptionsHTML()');
console.log('='.repeat(60));

if (nombresEnums.length > 0) {
  const primerEnum = nombresEnums[0];
  const valores = todosLosEnums[primerEnum];
  const primerValor = valores[0];
  
  const html = window.dbCache.createEnumOptionsHTML(primerEnum, primerValor, true);
  
  if (html && html.includes('<option')) {
    console.log(`✅ HTML generado para ${primerEnum}`);
    console.log(`   Longitud: ${html.length} caracteres`);
    console.log(`   Opciones: ${(html.match(/<option/g) || []).length}`);
    console.log(`   Preview:`, html.substring(0, 100) + '...');
  } else {
    console.error('❌ createEnumOptionsHTML() falló');
  }
} else {
  console.warn('⚠️ No hay ENUMs para probar createEnumOptionsHTML()');
}

// ============================================================
// PASO 8: Verificar tablas y columnas en caché
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('PASO 8: Verificar tablas y columnas en caché');
console.log('='.repeat(60));

schemas.forEach(schema => {
  const tablas = window.dbCache.getTables(schema);
  console.log(`Schema ${schema}: ${tablas.length} tablas`);
  
  if (tablas.length > 0) {
    // Contar columnas ENUM en todo el schema
    let totalColumnasEnum = 0;
    
    tablas.forEach(tabla => {
      const columnas = window.dbCache.getTableColumns(schema, tabla);
      const columnasEnum = columnas.filter(col => window.dbCache.isEnumColumn(col));
      totalColumnasEnum += columnasEnum.length;
    });
    
    console.log(`  └─ Total columnas ENUM: ${totalColumnasEnum}`);
  }
});

// ============================================================
// PASO 9: Estado final de la caché
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('PASO 9: Estado final de la caché');
console.log('='.repeat(60));

const status = window.dbCache.getCacheStatus();
console.log('Estado completo de la caché:', status);

// ============================================================
// RESUMEN FINAL
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('RESUMEN FINAL');
console.log('='.repeat(60));

const resumen = {
  cacheLista: window.dbCache.isCacheReady(),
  totalEnums: nombresEnums.length,
  tablasMDR: window.dbCache.getTables('mdr').length,
  tablasHRF: window.dbCache.getTables('hrf').length,
  funcionesDisponibles: funcionesRequeridas.filter(fn => typeof window.dbCache[fn] === 'function').length,
  todosFuncionando: true
};

// Verificar que todo esté OK
if (!resumen.cacheLista) {
  resumen.todosFuncionando = false;
  console.error('❌ Caché no inicializada');
}

if (resumen.totalEnums === 0) {
  resumen.todosFuncionando = false;
  console.error('❌ No hay ENUMs cargados');
}

if (resumen.funcionesDisponibles !== funcionesRequeridas.length) {
  resumen.todosFuncionando = false;
  console.error('❌ Faltan funciones helper');
}

if (resumen.tablasMDR === 0 && resumen.tablasHRF === 0) {
  resumen.todosFuncionando = false;
  console.error('❌ No hay tablas en caché');
}

console.table(resumen);

if (resumen.todosFuncionando) {
  console.log('\n🎉 ¡TODOS LOS TESTS PASARON! Sistema de ENUMs funcionando correctamente.');
  console.log('📝 Puedes probar los módulos:');
  console.log('   - Buscar Caso: Los filtros deben mostrar desplegables con valores');
  console.log('   - Editar Caso: Los filtros y campos editables deben tener desplegables');
  console.log('   - Inserciones: Los formularios deben tener desplegables para ENUMs');
} else {
  console.log('\n⚠️ HAY PROBLEMAS - Revisar errores anteriores');
  console.log('📝 Soluciones:');
  console.log('   1. Ejecutar sql/verificar_enums.sql en Supabase');
  console.log('   2. Actualizar función get_enum_values() desde sql/funciones_metadata.sql');
  console.log('   3. Cerrar sesión y volver a iniciar (sessionStorage.clear(); location.reload())');
  console.log('   4. Revisar consola para errores específicos');
}

console.log('\n' + '='.repeat(60));
