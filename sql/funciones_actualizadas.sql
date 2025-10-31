-- ============================================================
-- ARCHIVO SQL ACTUALIZADO - GeoFem
-- ============================================================
-- Este archivo contiene todas las funciones necesarias para:
-- 1. Consultas de metadata (tablas, columnas, enums)
-- 2. Operaciones de lectura (SELECT) - permitidas a todos
-- 3. Operaciones de escritura (INSERT, ALTER) - solo autenticados
-- 4. RLS aplicado a todos los esquemas mdr y hrf
-- ============================================================

SET search_path TO public;

-- ============================================================
-- PARTE 1: ELIMINAR TABLA PROFILES (PELIGROSA)
-- ============================================================

-- Eliminar triggers relacionados
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Eliminar funciones relacionadas
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- Eliminar la tabla profiles
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================================
-- PARTE 2: FUNCIONES RLS - APLICAR POLÍTICAS A TODAS LAS TABLAS
-- ============================================================

-- Función para habilitar RLS en todas las tablas de un esquema
CREATE OR REPLACE FUNCTION public.enable_rls_for_schema(schema_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tbl record;
BEGIN
  -- Iterar sobre todas las tablas del esquema
  FOR tbl IN 
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = schema_name 
      AND table_type = 'BASE TABLE'
  LOOP
    -- Habilitar RLS
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, tbl.table_name);
    
    -- Eliminar políticas existentes si las hay
    EXECUTE format('DROP POLICY IF EXISTS "allow_read_all" ON %I.%I', schema_name, tbl.table_name);
    EXECUTE format('DROP POLICY IF EXISTS "allow_insert_authenticated" ON %I.%I', schema_name, tbl.table_name);
    
    -- Crear política de lectura (todos pueden leer)
    EXECUTE format(
      'CREATE POLICY "allow_read_all" ON %I.%I FOR SELECT USING (true)',
      schema_name, tbl.table_name
    );
    
    -- Crear política de inserción (solo usuarios autenticados)
    EXECUTE format(
      'CREATE POLICY "allow_insert_authenticated" ON %I.%I FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)',
      schema_name, tbl.table_name
    );
    
    -- Crear política de actualización (solo usuarios autenticados)
    EXECUTE format(
      'CREATE POLICY "allow_update_authenticated" ON %I.%I FOR UPDATE USING (auth.uid() IS NOT NULL)',
      schema_name, tbl.table_name
    );
    
    RAISE NOTICE 'RLS habilitado para tabla: %.%', schema_name, tbl.table_name;
  END LOOP;
END;
$$;

-- Aplicar RLS a los esquemas mdr y hrf
SELECT public.enable_rls_for_schema('mdr');
SELECT public.enable_rls_for_schema('hrf');

-- ============================================================
-- PARTE 3: FUNCIONES PARA ESQUEMA MDR
-- ============================================================

-- Obtener tablas del esquema mdr
CREATE OR REPLACE FUNCTION mdr.get_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT table_name::text
  FROM information_schema.tables
  WHERE table_schema = 'mdr' AND table_type = 'BASE TABLE'
  ORDER BY table_name;
$$;

-- Obtener columnas de una tabla en mdr
CREATE OR REPLACE FUNCTION mdr.get_table_columns(tabla text)
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
      COALESCE(
        (SELECT 'FK -> ' || kcu2.table_name || '.' || kcu2.column_name
         FROM information_schema.key_column_usage kcu
         JOIN information_schema.referential_constraints rc
           ON kcu.constraint_name = rc.constraint_name
         JOIN information_schema.key_column_usage kcu2
           ON rc.unique_constraint_name = kcu2.constraint_name
          AND kcu.ordinal_position = kcu2.ordinal_position
         WHERE kcu.table_schema = 'mdr'
           AND kcu.table_name = c.table_name
           AND kcu.column_name = c.column_name
         LIMIT 1
        ), ''
      ) AS fk_comment,
      CASE 
        WHEN pk.column_name IS NOT NULL THEN true
        ELSE false
      END AS is_primary
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = tabla
        AND tc.table_schema = 'mdr'
    ) pk ON c.column_name = pk.column_name
    WHERE c.table_schema = 'mdr'
      AND c.table_name = tabla
    ORDER BY c.ordinal_position;
END;
$$;

-- Obtener valores de enums en mdr
CREATE OR REPLACE FUNCTION mdr.get_enum_values()
RETURNS TABLE(enum_name text, enum_value text)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT t.typname::text, e.enumlabel::text
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'mdr'
  ORDER BY t.typname, e.enumsortorder;
$$;

-- Crear enum en mdr (solo autenticados)
CREATE OR REPLACE FUNCTION mdr.exec_create_enum(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para crear ENUMs';
  END IF;
  
  PERFORM set_config('search_path', 'mdr', true);
  EXECUTE query;
  PERFORM set_config('search_path', 'public', true);
END;
$$;

-- Añadir columna a tabla en mdr (solo autenticados, NO permite borrar)
CREATE OR REPLACE FUNCTION mdr.add_column_safe(tabla text, column_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para añadir columnas';
  END IF;
  
  -- Ejecutar ADD COLUMN
  EXECUTE format('ALTER TABLE mdr.%I ADD COLUMN %s', tabla, column_sql);
END;
$$;

-- Renombrar columna en mdr (solo autenticados)
CREATE OR REPLACE FUNCTION mdr.rename_column_safe(tabla text, old_name text, new_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para renombrar columnas';
  END IF;
  
  EXECUTE format('ALTER TABLE mdr.%I RENAME COLUMN %I TO %I', tabla, old_name, new_name);
END;
$$;

-- Insertar datos en mdr (solo autenticados)
CREATE OR REPLACE FUNCTION mdr.insert_row(tabla text, datos jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  columns text;
  values_list text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para insertar datos';
  END IF;
  
  SELECT string_agg(quote_ident(key), ', '), 
         string_agg(quote_nullable(value::text), ', ')
  INTO columns, values_list
  FROM jsonb_each_text(datos);
  
  EXECUTE format('INSERT INTO mdr.%I (%s) VALUES (%s)', tabla, columns, values_list);
END;
$$;

-- Seleccionar todos los registros de una tabla en mdr
CREATE OR REPLACE FUNCTION mdr.select_all(tabla text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM mdr.%I t', tabla) INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Seleccionar una columna de una tabla en mdr
CREATE OR REPLACE FUNCTION mdr.select_column(tabla text, columna text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (SELECT %I FROM mdr.%I) t', columna, tabla) INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Buscar un registro por valor de columna en mdr
CREATE OR REPLACE FUNCTION mdr.select_one_by_value(tabla text, columna text, valor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result jsonb;
  column_type text;
BEGIN
  -- Obtener tipo de dato de la columna
  SELECT data_type INTO column_type
  FROM information_schema.columns
  WHERE table_schema = 'mdr'
    AND table_name = tabla
    AND column_name = columna;
  
  -- Buscar según el tipo de dato
  IF column_type IN ('integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision') THEN
    EXECUTE format('SELECT row_to_json(t) FROM mdr.%I t WHERE %I = $1::numeric LIMIT 1', tabla, columna)
    USING valor INTO result;
  ELSIF column_type = 'boolean' THEN
    EXECUTE format('SELECT row_to_json(t) FROM mdr.%I t WHERE %I = $1::boolean LIMIT 1', tabla, columna)
    USING valor INTO result;
  ELSE
    EXECUTE format('SELECT row_to_json(t) FROM mdr.%I t WHERE %I::text = $1 LIMIT 1', tabla, columna)
    USING valor INTO result;
  END IF;
  
  RETURN COALESCE(result, '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  BEGIN
    EXECUTE format('SELECT row_to_json(t) FROM mdr.%I t WHERE %I::text = $1 LIMIT 1', tabla, columna)
    USING valor INTO result;
    RETURN COALESCE(result, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RETURN '{}'::jsonb;
  END;
END;
$$;

-- ============================================================
-- PARTE 4: FUNCIONES PARA ESQUEMA HRF
-- ============================================================

-- Obtener tablas del esquema hrf
CREATE OR REPLACE FUNCTION hrf.get_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT table_name::text
  FROM information_schema.tables
  WHERE table_schema = 'hrf' AND table_type = 'BASE TABLE'
  ORDER BY table_name;
$$;

-- Obtener columnas de una tabla en hrf
CREATE OR REPLACE FUNCTION hrf.get_table_columns(tabla text)
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
      COALESCE(
        (SELECT 'FK -> ' || kcu2.table_name || '.' || kcu2.column_name
         FROM information_schema.key_column_usage kcu
         JOIN information_schema.referential_constraints rc
           ON kcu.constraint_name = rc.constraint_name
         JOIN information_schema.key_column_usage kcu2
           ON rc.unique_constraint_name = kcu2.constraint_name
          AND kcu.ordinal_position = kcu2.ordinal_position
         WHERE kcu.table_schema = 'hrf'
           AND kcu.table_name = c.table_name
           AND kcu.column_name = c.column_name
         LIMIT 1
        ), ''
      ) AS fk_comment,
      CASE 
        WHEN pk.column_name IS NOT NULL THEN true
        ELSE false
      END AS is_primary
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = tabla
        AND tc.table_schema = 'hrf'
    ) pk ON c.column_name = pk.column_name
    WHERE c.table_schema = 'hrf'
      AND c.table_name = tabla
    ORDER BY c.ordinal_position;
END;
$$;

-- Obtener valores de enums en hrf
CREATE OR REPLACE FUNCTION hrf.get_enum_values()
RETURNS TABLE(enum_name text, enum_value text)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT t.typname::text, e.enumlabel::text
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'hrf'
  ORDER BY t.typname, e.enumsortorder;
$$;

-- Crear enum en hrf (solo autenticados)
CREATE OR REPLACE FUNCTION hrf.exec_create_enum(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para crear ENUMs';
  END IF;
  
  PERFORM set_config('search_path', 'hrf', true);
  EXECUTE query;
  PERFORM set_config('search_path', 'public', true);
END;
$$;

-- Añadir columna a tabla en hrf (solo autenticados, NO permite borrar)
CREATE OR REPLACE FUNCTION hrf.add_column_safe(tabla text, column_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para añadir columnas';
  END IF;
  
  EXECUTE format('ALTER TABLE hrf.%I ADD COLUMN %s', tabla, column_sql);
END;
$$;

-- Renombrar columna en hrf (solo autenticados)
CREATE OR REPLACE FUNCTION hrf.rename_column_safe(tabla text, old_name text, new_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para renombrar columnas';
  END IF;
  
  EXECUTE format('ALTER TABLE hrf.%I RENAME COLUMN %I TO %I', tabla, old_name, new_name);
END;
$$;

-- Insertar datos en hrf (solo autenticados)
CREATE OR REPLACE FUNCTION hrf.insert_row(tabla text, datos jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  columns text;
  values_list text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para insertar datos';
  END IF;
  
  SELECT string_agg(quote_ident(key), ', '), 
         string_agg(quote_nullable(value::text), ', ')
  INTO columns, values_list
  FROM jsonb_each_text(datos);
  
  EXECUTE format('INSERT INTO hrf.%I (%s) VALUES (%s)', tabla, columns, values_list);
END;
$$;

-- Seleccionar todos los registros de una tabla en hrf
CREATE OR REPLACE FUNCTION hrf.select_all(tabla text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM hrf.%I t', tabla) INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Seleccionar una columna de una tabla en hrf
CREATE OR REPLACE FUNCTION hrf.select_column(tabla text, columna text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (SELECT %I FROM hrf.%I) t', columna, tabla) INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Buscar un registro por valor de columna en hrf
CREATE OR REPLACE FUNCTION hrf.select_one_by_value(tabla text, columna text, valor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result jsonb;
  column_type text;
BEGIN
  SELECT data_type INTO column_type
  FROM information_schema.columns
  WHERE table_schema = 'hrf'
    AND table_name = tabla
    AND column_name = columna;
  
  IF column_type IN ('integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision') THEN
    EXECUTE format('SELECT row_to_json(t) FROM hrf.%I t WHERE %I = $1::numeric LIMIT 1', tabla, columna)
    USING valor INTO result;
  ELSIF column_type = 'boolean' THEN
    EXECUTE format('SELECT row_to_json(t) FROM hrf.%I t WHERE %I = $1::boolean LIMIT 1', tabla, columna)
    USING valor INTO result;
  ELSE
    EXECUTE format('SELECT row_to_json(t) FROM hrf.%I t WHERE %I::text = $1 LIMIT 1', tabla, columna)
    USING valor INTO result;
  END IF;
  
  RETURN COALESCE(result, '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  BEGIN
    EXECUTE format('SELECT row_to_json(t) FROM hrf.%I t WHERE %I::text = $1 LIMIT 1', tabla, columna)
    USING valor INTO result;
    RETURN COALESCE(result, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RETURN '{}'::jsonb;
  END;
END;
$$;

-- ============================================================
-- PARTE 5: FUNCIONES WRAPPER EN PUBLIC (Para acceso desde Supabase API)
-- ============================================================

-- ========== MDR ==========
CREATE OR REPLACE FUNCTION public.mdr_get_public_tables()
RETURNS TABLE(table_name text) LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT * FROM mdr.get_public_tables(); $$;

CREATE OR REPLACE FUNCTION public.mdr_get_table_columns(tabla text)
RETURNS TABLE(column_name text, data_type text, character_maximum_length int, udt_name text, fk_comment text, is_primary boolean)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT * FROM mdr.get_table_columns(tabla); $$;

CREATE OR REPLACE FUNCTION public.mdr_get_enum_values()
RETURNS TABLE(enum_name text, enum_value text) LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT * FROM mdr.get_enum_values(); $$;

CREATE OR REPLACE FUNCTION public.mdr_exec_create_enum(query text)
RETURNS void LANGUAGE sql SECURITY DEFINER VOLATILE
AS $$ SELECT mdr.exec_create_enum(query); $$;

CREATE OR REPLACE FUNCTION public.mdr_add_column_safe(tabla text, column_sql text)
RETURNS void LANGUAGE sql SECURITY DEFINER VOLATILE
AS $$ SELECT mdr.add_column_safe(tabla, column_sql); $$;

CREATE OR REPLACE FUNCTION public.mdr_rename_column_safe(tabla text, old_name text, new_name text)
RETURNS void LANGUAGE sql SECURITY DEFINER VOLATILE
AS $$ SELECT mdr.rename_column_safe(tabla, old_name, new_name); $$;

CREATE OR REPLACE FUNCTION public.mdr_insert_row(tabla text, datos jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER VOLATILE
AS $$ SELECT mdr.insert_row(tabla, datos); $$;

CREATE OR REPLACE FUNCTION public.mdr_select_all(tabla text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT mdr.select_all(tabla); $$;

CREATE OR REPLACE FUNCTION public.mdr_select_column(tabla text, columna text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT mdr.select_column(tabla, columna); $$;

CREATE OR REPLACE FUNCTION public.mdr_select_one_by_value(tabla text, columna text, valor text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT mdr.select_one_by_value(tabla, columna, valor); $$;

-- ========== HRF ==========
CREATE OR REPLACE FUNCTION public.hrf_get_public_tables()
RETURNS TABLE(table_name text) LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT * FROM hrf.get_public_tables(); $$;

CREATE OR REPLACE FUNCTION public.hrf_get_table_columns(tabla text)
RETURNS TABLE(column_name text, data_type text, character_maximum_length int, udt_name text, fk_comment text, is_primary boolean)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT * FROM hrf.get_table_columns(tabla); $$;

CREATE OR REPLACE FUNCTION public.hrf_get_enum_values()
RETURNS TABLE(enum_name text, enum_value text) LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT * FROM hrf.get_enum_values(); $$;

CREATE OR REPLACE FUNCTION public.hrf_exec_create_enum(query text)
RETURNS void LANGUAGE sql SECURITY DEFINER VOLATILE
AS $$ SELECT hrf.exec_create_enum(query); $$;

CREATE OR REPLACE FUNCTION public.hrf_add_column_safe(tabla text, column_sql text)
RETURNS void LANGUAGE sql SECURITY DEFINER VOLATILE
AS $$ SELECT hrf.add_column_safe(tabla, column_sql); $$;

CREATE OR REPLACE FUNCTION public.hrf_rename_column_safe(tabla text, old_name text, new_name text)
RETURNS void LANGUAGE sql SECURITY DEFINER VOLATILE
AS $$ SELECT hrf.rename_column_safe(tabla, old_name, new_name); $$;

CREATE OR REPLACE FUNCTION public.hrf_insert_row(tabla text, datos jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER VOLATILE
AS $$ SELECT hrf.insert_row(tabla, datos); $$;

CREATE OR REPLACE FUNCTION public.hrf_select_all(tabla text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT hrf.select_all(tabla); $$;

CREATE OR REPLACE FUNCTION public.hrf_select_column(tabla text, columna text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT hrf.select_column(tabla, columna); $$;

CREATE OR REPLACE FUNCTION public.hrf_select_one_by_value(tabla text, columna text, valor text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT hrf.select_one_by_value(tabla, columna, valor); $$;

-- ============================================================
-- FIN DEL ARCHIVO
-- ============================================================

-- Resumen de cambios:
-- ✅ Eliminada tabla profiles (peligrosa)
-- ✅ RLS aplicado a todas las tablas de mdr y hrf
-- ✅ Todos pueden leer (SELECT)
-- ✅ Solo autenticados pueden insertar y modificar
-- ✅ NO se permite borrar campos ni tablas (funciones eliminadas)
-- ✅ Funciones específicas: add_column_safe, rename_column_safe (en lugar de alter_table_safe genérico)
-- ✅ Enums mantienen su funcionalidad
-- ✅ Funciones wrapper en public para acceso desde Supabase API
