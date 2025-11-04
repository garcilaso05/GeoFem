-- ============================================================
-- FUNCIONES DE METADATA - GeoFem
-- Solo para obtener información de estructura de BD
-- Las operaciones de datos se hacen directamente desde el cliente
-- ============================================================

-- ============================================================
-- ENUMS - Obtener todos los valores de todos los enums
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_enum_values()
RETURNS TABLE(enum_name text, enum_value text, enum_order integer)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  -- Buscar ENUMs en el schema public (donde siempre están en PostgreSQL)
  SELECT 
    t.typname::text as enum_name,
    e.enumlabel::text as enum_value,
    e.enumsortorder::integer as enum_order
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'  -- ENUMs están siempre en public
    AND t.typtype = 'e'  -- Solo tipos ENUM
  ORDER BY t.typname, e.enumsortorder;
$$;

GRANT EXECUTE ON FUNCTION public.get_enum_values() TO anon, authenticated;

COMMENT ON FUNCTION public.get_enum_values() IS 
'Obtiene todos los enums del schema public con sus valores ordenados. Los ENUMs en PostgreSQL se almacenan en el schema public independientemente de dónde se usen.';

-- ============================================================
-- TABLAS - Obtener lista de tablas de un schema
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_tables(p_schema text)
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT table_name::text
  FROM information_schema.tables
  WHERE table_schema = p_schema 
    AND table_type = 'BASE TABLE'
    AND table_schema IN ('mdr', 'hrf')
  ORDER BY table_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_tables(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_tables(text) IS 
'Obtiene la lista de tablas de un schema (mdr o hrf)';

-- ============================================================
-- COLUMNAS - Obtener información detallada de columnas
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_table_columns(p_schema text, p_tabla text)
RETURNS TABLE (
  column_name text,
  data_type text,
  character_maximum_length int,
  udt_name text,
  fk_comment text,
  is_primary boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      c.column_name::text,
      c.data_type::text,
      c.character_maximum_length::int,
      c.udt_name::text,
      -- Detectar FK automáticamente desde constraints, o usar comentario si existe
      COALESCE(
        -- Intentar obtener FK desde information_schema
        (SELECT 'FK -> ' || ccu.table_name || '.' || ccu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu 
           ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
           AND tc.table_schema = ccu.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_schema = p_schema
           AND tc.table_name = p_tabla
           AND kcu.column_name = c.column_name
         LIMIT 1),
        -- Si no hay FK, intentar obtener comentario manual
        pgd.description,
        NULL
      )::text as fk_comment,
      COALESCE(pk.column_name IS NOT NULL, false) as is_primary
    FROM information_schema.columns c
    LEFT JOIN pg_catalog.pg_statio_all_tables st ON 
      c.table_schema = st.schemaname AND 
      c.table_name = st.relname
    LEFT JOIN pg_catalog.pg_description pgd ON 
      pgd.objoid = st.relid AND 
      pgd.objsubid = c.ordinal_position
    LEFT JOIN (
      SELECT 
        kcu.column_name,
        kcu.table_name,
        kcu.table_schema
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = p_tabla
        AND tc.table_schema = p_schema
    ) pk ON c.column_name = pk.column_name
    WHERE c.table_schema = p_schema
      AND c.table_name = p_tabla
    ORDER BY c.ordinal_position;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_table_columns(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_table_columns(text, text) IS 
'Obtiene información detallada de las columnas de una tabla incluyendo FK y PK';

-- ============================================================
-- CREAR ENUM - Solo usuarios autenticados
-- ============================================================

CREATE OR REPLACE FUNCTION public.exec_create_enum(p_schema text, p_query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  -- Verificar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para crear ENUMs';
  END IF;
  
  -- Validar schema
  IF p_schema NOT IN ('mdr', 'hrf') THEN
    RAISE EXCEPTION 'Schema inválido. Solo se permiten mdr o hrf';
  END IF;

  -- Establecer search_path y ejecutar
  EXECUTE format('SET search_path TO %I', p_schema);
  EXECUTE p_query;
  EXECUTE 'SET search_path TO public';
END;
$$;

GRANT EXECUTE ON FUNCTION public.exec_create_enum(text, text) TO authenticated;

COMMENT ON FUNCTION public.exec_create_enum(text, text) IS 
'Crea un enum en el schema especificado. Solo para usuarios autenticados.';

-- ============================================================
-- AÑADIR COLUMNA - Solo usuarios autenticados
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_column_safe(
  p_schema text,
  p_tabla text,
  p_columna text,
  p_tipo text,
  p_default text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  alter_sql text;
BEGIN
  -- Verificar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para modificar la estructura de tablas';
  END IF;
  
  -- Validar schema
  IF p_schema NOT IN ('mdr', 'hrf') THEN
    RAISE EXCEPTION 'Schema inválido. Solo se permiten mdr o hrf';
  END IF;
  
  -- Validar nombres (solo alfanuméricos y guiones bajos)
  IF NOT (p_tabla ~ '^[a-zA-Z_][a-zA-Z0-9_]*$') THEN
    RAISE EXCEPTION 'Nombre de tabla inválido';
  END IF;
  
  IF NOT (p_columna ~ '^[a-zA-Z_][a-zA-Z0-9_]*$') THEN
    RAISE EXCEPTION 'Nombre de columna inválido';
  END IF;

  -- Construir SQL
  alter_sql := format('ALTER TABLE %I.%I ADD COLUMN %I %s', 
    p_schema, p_tabla, p_columna, p_tipo);
  
  IF p_default IS NOT NULL THEN
    alter_sql := alter_sql || format(' DEFAULT %s', p_default);
  END IF;

  EXECUTE alter_sql;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_column_safe(text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.add_column_safe(text, text, text, text, text) IS 
'Añade una columna a una tabla de forma segura. Solo para usuarios autenticados.';

-- ============================================================
-- RENOMBRAR COLUMNA - Solo usuarios autenticados
-- ============================================================

CREATE OR REPLACE FUNCTION public.rename_column_safe(
  p_schema text,
  p_tabla text,
  p_columna_antigua text,
  p_columna_nueva text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  -- Verificar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para modificar la estructura de tablas';
  END IF;
  
  -- Validar schema
  IF p_schema NOT IN ('mdr', 'hrf') THEN
    RAISE EXCEPTION 'Schema inválido. Solo se permiten mdr o hrf';
  END IF;
  
  -- Validar nombres
  IF NOT (p_tabla ~ '^[a-zA-Z_][a-zA-Z0-9_]*$') THEN
    RAISE EXCEPTION 'Nombre de tabla inválido';
  END IF;
  
  IF NOT (p_columna_antigua ~ '^[a-zA-Z_][a-zA-Z0-9_]*$') THEN
    RAISE EXCEPTION 'Nombre de columna antigua inválido';
  END IF;
  
  IF NOT (p_columna_nueva ~ '^[a-zA-Z_][a-zA-Z0-9_]*$') THEN
    RAISE EXCEPTION 'Nombre de columna nueva inválido';
  END IF;

  EXECUTE format('ALTER TABLE %I.%I RENAME COLUMN %I TO %I', 
    p_schema, p_tabla, p_columna_antigua, p_columna_nueva);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_column_safe(text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.rename_column_safe(text, text, text, text) IS 
'Renombra una columna de forma segura. Solo para usuarios autenticados.';

-- ============================================================
-- RESUMEN
-- ============================================================

COMMENT ON SCHEMA public IS 
'Schema público con funciones de metadata para GeoFem.
Las operaciones de datos (SELECT, INSERT, UPDATE, DELETE) se realizan directamente desde el cliente.
Los schemas mdr y hrf están expuestos y accesibles directamente.';
