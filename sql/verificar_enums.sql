-- ============================================================
-- SCRIPT DE VERIFICACIÓN - Sistema de ENUMs
-- Ejecutar en Supabase SQL Editor para verificar que todo funciona
-- ============================================================

-- ============================================================
-- PASO 1: Verificar que la función get_enum_values() existe y funciona
-- ============================================================

-- Debería retornar todas las columnas: enum_name, enum_value, enum_order
SELECT * FROM get_enum_values() LIMIT 5;

-- Contar cuántos ENUMs hay en total
SELECT 
  COUNT(DISTINCT enum_name) as total_enums,
  COUNT(*) as total_valores
FROM get_enum_values();

-- ============================================================
-- PASO 2: Verificar que los ENUMs están en el schema public
-- ============================================================

SELECT 
  n.nspname as schema_name,
  t.typname as enum_name,
  COUNT(e.enumlabel) as num_valores
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typtype = 'e'
GROUP BY n.nspname, t.typname
ORDER BY n.nspname, t.typname;

-- ============================================================
-- PASO 3: Listar todos los ENUMs con sus valores
-- ============================================================

SELECT 
  enum_name,
  enum_value,
  enum_order
FROM get_enum_values()
ORDER BY enum_name, enum_order;

-- ============================================================
-- PASO 4: Verificar ENUMs específicos (ejemplos comunes)
-- ============================================================

-- Estado civil
SELECT * FROM get_enum_values() 
WHERE enum_name = 'estado_civil'
ORDER BY enum_order;

-- Nivel educativo
SELECT * FROM get_enum_values() 
WHERE enum_name = 'nivel_educativo'
ORDER BY enum_order;

-- Nacionalidad
SELECT * FROM get_enum_values() 
WHERE enum_name = 'nacionalidad'
ORDER BY enum_order;

-- ============================================================
-- PASO 5: Encontrar columnas que usan ENUMs en mdr y hrf
-- ============================================================

-- Columnas ENUM en schema mdr
SELECT 
  c.table_name,
  c.column_name,
  c.udt_name as enum_type
FROM information_schema.columns c
WHERE c.table_schema = 'mdr'
  AND c.data_type = 'USER-DEFINED'
ORDER BY c.table_name, c.column_name;

-- Columnas ENUM en schema hrf
SELECT 
  c.table_name,
  c.column_name,
  c.udt_name as enum_type
FROM information_schema.columns c
WHERE c.table_schema = 'hrf'
  AND c.data_type = 'USER-DEFINED'
ORDER BY c.table_name, c.column_name;

-- ============================================================
-- PASO 6: Verificar correspondencia entre udt_name y ENUMs existentes
-- ============================================================

-- Columnas con ENUMs que SÍ existen
SELECT 
  c.table_schema,
  c.table_name,
  c.column_name,
  c.udt_name,
  'EXISTE' as estado
FROM information_schema.columns c
WHERE c.table_schema IN ('mdr', 'hrf')
  AND c.data_type = 'USER-DEFINED'
  AND EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
      AND t.typname = c.udt_name
  )
ORDER BY c.table_schema, c.table_name, c.column_name;

-- Columnas con ENUMs que NO existen (esto es un problema)
SELECT 
  c.table_schema,
  c.table_name,
  c.column_name,
  c.udt_name,
  '❌ NO EXISTE' as estado
FROM information_schema.columns c
WHERE c.table_schema IN ('mdr', 'hrf')
  AND c.data_type = 'USER-DEFINED'
  AND NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
      AND t.typname = c.udt_name
  )
ORDER BY c.table_schema, c.table_name, c.column_name;

-- ============================================================
-- PASO 7: Verificar permisos de la función
-- ============================================================

SELECT 
  p.proname as function_name,
  n.nspname as schema_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'get_enum_values'
  AND n.nspname = 'public';

-- ============================================================
-- PASO 8: Estadísticas generales
-- ============================================================

SELECT 
  'Total de ENUMs en public' as metrica,
  COUNT(DISTINCT typname)::text as valor
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public' AND t.typtype = 'e'

UNION ALL

SELECT 
  'Total de columnas ENUM en mdr',
  COUNT(*)::text
FROM information_schema.columns
WHERE table_schema = 'mdr' AND data_type = 'USER-DEFINED'

UNION ALL

SELECT 
  'Total de columnas ENUM en hrf',
  COUNT(*)::text
FROM information_schema.columns
WHERE table_schema = 'hrf' AND data_type = 'USER-DEFINED'

UNION ALL

SELECT 
  'Total de valores ENUM',
  COUNT(*)::text
FROM get_enum_values();

-- ============================================================
-- RESULTADO ESPERADO
-- ============================================================

/*
✅ PASO 1: Debe retornar filas con enum_name, enum_value, enum_order
✅ PASO 2: Todos los ENUMs deben estar en schema 'public'
✅ PASO 3: Debe listar todos los ENUMs con sus valores ordenados
✅ PASO 4: Debe mostrar valores de ENUMs comunes
✅ PASO 5: Debe listar columnas que usan ENUMs en mdr y hrf
✅ PASO 6: Todas las columnas deben tener estado 'EXISTE', ninguna con '❌ NO EXISTE'
✅ PASO 7: Debe mostrar la definición de la función
✅ PASO 8: Debe mostrar estadísticas generales

Si algún paso falla, revisa:
1. Que la función get_enum_values() esté actualizada
2. Que los permisos estén configurados (GRANT EXECUTE)
3. Que los ENUMs existan en el schema public
*/
