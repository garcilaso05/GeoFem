-- ============================================================
-- DIAGNÓSTICO DE ENUMS - GeoFem
-- Funciones para diagnosticar problemas con ENUMs
-- ============================================================

-- ============================================================
-- FUNCIÓN 1: Diagnóstico completo de ENUMs
-- ============================================================

CREATE OR REPLACE FUNCTION public.diagnostico_enums()
RETURNS TABLE(
  seccion text,
  detalle text,
  valor text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  enum_count int;
  col_count int;
BEGIN
  -- Establecer search_path para encontrar ENUMs en public
  SET search_path TO public, mdr, hrf, pg_catalog;
  
  -- Sección 1: Contar ENUMs totales
  SELECT COUNT(DISTINCT t.typname) INTO enum_count
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'  -- Buscar solo en public donde están los ENUMs
    AND t.typtype = 'e';
  
  RETURN QUERY SELECT 
    '1. RESUMEN'::text,
    'Total de ENUMs encontrados en schema public'::text,
    enum_count::text;

  -- Sección 2: Listar todos los ENUMs del schema public
  RETURN QUERY
  SELECT 
    '2. ENUMS EN PUBLIC'::text,
    t.typname::text,
    COUNT(e.enumlabel)::text || ' valores'
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typtype = 'e'
  GROUP BY t.typname
  ORDER BY t.typname;

  -- Sección 3: Mostrar algunos valores de ejemplo de cada ENUM
  RETURN QUERY
  SELECT 
    '3. VALORES DE EJEMPLO'::text,
    t.typname::text,
    string_agg(e.enumlabel::text, ', ' ORDER BY e.enumsortorder) FILTER (WHERE rn <= 3)
  FROM (
    SELECT 
      t.typname,
      e.enumlabel,
      e.enumsortorder,
      ROW_NUMBER() OVER (PARTITION BY t.typname ORDER BY e.enumsortorder) as rn
    FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
  ) sub
  WHERE rn <= 3
  GROUP BY typname
  ORDER BY typname;

  -- Sección 4: Columnas que usan ENUMs en mdr
  RETURN QUERY
  SELECT 
    '4. COLUMNAS ENUM EN MDR'::text,
    c.table_name || '.' || c.column_name::text,
    c.udt_name::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'mdr'
    AND c.data_type = 'USER-DEFINED'
  ORDER BY c.table_name, c.column_name;

  -- Sección 5: Columnas que usan ENUMs en hrf
  RETURN QUERY
  SELECT 
    '5. COLUMNAS ENUM EN HRF'::text,
    c.table_name || '.' || c.column_name::text,
    c.udt_name::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'hrf'
    AND c.data_type = 'USER-DEFINED'
  ORDER BY c.table_name, c.column_name;

  -- Sección 6: Verificar función get_enum_values
  BEGIN
    SELECT COUNT(*) INTO enum_count FROM get_enum_values();
    RETURN QUERY SELECT 
      '6. FUNCIÓN get_enum_values()'::text,
      'Funciona correctamente'::text,
      'Retorna ' || enum_count::text || ' filas';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 
      '6. FUNCIÓN get_enum_values()'::text,
      'ERROR'::text,
      SQLERRM::text;
  END;

END;
$$;

GRANT EXECUTE ON FUNCTION public.diagnostico_enums() TO anon, authenticated;

COMMENT ON FUNCTION public.diagnostico_enums() IS 
'Diagnóstico completo del sistema de ENUMs. Muestra todos los ENUMs disponibles y dónde se usan.';

-- ============================================================
-- FUNCIÓN 2: Comparar ENUM vs UDT_NAME
-- ============================================================

CREATE OR REPLACE FUNCTION public.comparar_enum_udt(p_schema text, p_tabla text)
RETURNS TABLE(
  columna text,
  data_type text,
  udt_name text,
  enum_existe boolean,
  schema_enum text,
  valores_enum text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path TO public, mdr, hrf, pg_catalog;
  
  RETURN QUERY
  SELECT 
    c.column_name::text,
    c.data_type::text,
    c.udt_name::text,
    EXISTS(
      SELECT 1 FROM pg_catalog.pg_type t 
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = c.udt_name
        AND t.typtype = 'e'
        AND n.nspname = 'public'
    ) as enum_existe,
    (
      SELECT n.nspname::text
      FROM pg_catalog.pg_type t 
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = c.udt_name
        AND t.typtype = 'e'
      LIMIT 1
    ) as schema_enum,
    (
      SELECT string_agg(e.enumlabel::text, ', ' ORDER BY e.enumsortorder)
      FROM pg_catalog.pg_type t
      JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = c.udt_name
      LIMIT 1
    ) as valores_enum
  FROM information_schema.columns c
  WHERE c.table_schema = p_schema
    AND c.table_name = p_tabla
    AND c.data_type = 'USER-DEFINED'
  ORDER BY c.ordinal_position;
END;
$$;

GRANT EXECUTE ON FUNCTION public.comparar_enum_udt(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.comparar_enum_udt(text, text) IS 
'Compara los udt_name de las columnas con los ENUMs existentes para verificar coincidencias.';

-- ============================================================
-- FUNCIÓN 3: Listar ENUMs con más detalle
-- ============================================================

CREATE OR REPLACE FUNCTION public.listar_enums_detallado()
RETURNS TABLE(
  schema_name text,
  enum_name text,
  num_valores int,
  valores text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  SET search_path TO public, pg_catalog;
  
  RETURN QUERY
  SELECT 
    n.nspname::text as schema_name,
    t.typname::text as enum_name,
    COUNT(e.enumlabel)::int as num_valores,
    string_agg(e.enumlabel::text, ', ' ORDER BY e.enumsortorder) as valores
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typtype = 'e'
  GROUP BY n.nspname, t.typname
  ORDER BY t.typname;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_enums_detallado() TO anon, authenticated;

COMMENT ON FUNCTION public.listar_enums_detallado() IS 
'Lista todos los ENUMs con sus valores de forma legible.';

-- ============================================================
-- INSTRUCCIONES DE USO
-- ============================================================

/*

PASO 1: Ejecutar diagnóstico completo
--------------------------------------
SELECT * FROM diagnostico_enums();

Esto te mostrará:
- Cuántos ENUMs hay en total
- Lista de ENUMs por schema
- Ejemplos de valores
- Columnas que usan ENUMs en mdr y hrf
- Si get_enum_values() funciona

PASO 2: Ver ENUMs en detalle
-----------------------------
SELECT * FROM listar_enums_detallado();

Esto muestra todos los ENUMs con TODOS sus valores.

PASO 3: Comparar una tabla específica
--------------------------------------
SELECT * FROM comparar_enum_udt('mdr', 'persona');

Reemplaza 'persona' con tu tabla. Esto muestra:
- Columnas USER-DEFINED
- Si el ENUM existe
- En qué schema está
- Sus valores

PASO 4: Verificar get_enum_values()
------------------------------------
SELECT * FROM get_enum_values() LIMIT 20;

Debe retornar filas como:
enum_name | enum_value
----------+-----------
tipo_x    | valor1
tipo_x    | valor2

Si retorna 0 filas, el problema está en la función o en que los ENUMs
están en un schema diferente (ni mdr ni hrf).

SOLUCIÓN COMÚN: ENUMs en schema 'public'
-----------------------------------------
Si diagnostico_enums() muestra ENUMs en schema 'public' pero 
get_enum_values() retorna vacío, es porque la función solo busca
en 'mdr' y 'hrf'.

Ejecuta para ver dónde están:
SELECT * FROM listar_enums_detallado();

Si dice schema_name = 'public', entonces necesitas modificar
get_enum_values() para incluir 'public' en el WHERE.

*/
