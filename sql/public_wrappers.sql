-- ============================================================
-- FUNCIONES WRAPPER ADICIONALES PARA OPERACIONES DE ADMIN
-- ============================================================

SET search_path TO public;

-- ---------- MDR - Operaciones de modificación ----------
CREATE OR REPLACE FUNCTION public.mdr_alter_table_safe(tabla text, alter_sql text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT mdr.alter_table_safe(tabla, alter_sql);
$$;

CREATE OR REPLACE FUNCTION public.mdr_drop_table_safe(tabla text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT mdr.drop_table_safe(tabla);
$$;

CREATE OR REPLACE FUNCTION public.mdr_exec_create_enum(query text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT mdr.exec_create_enum(query);
$$;

-- ---------- HRF - Operaciones de modificación ----------
CREATE OR REPLACE FUNCTION public.hrf_alter_table_safe(tabla text, alter_sql text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT hrf.alter_table_safe(tabla, alter_sql);
$$;

CREATE OR REPLACE FUNCTION public.hrf_drop_table_safe(tabla text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT hrf.drop_table_safe(tabla);
$$;

CREATE OR REPLACE FUNCTION public.hrf_exec_create_enum(query text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT hrf.exec_create_enum(query);
$$;

-- ============================================================
-- FUNCIONES PARA LEER DATOS DE TABLAS
-- ============================================================

-- ---------- MDR - Leer datos ----------
CREATE OR REPLACE FUNCTION public.mdr_select_all(tabla text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM mdr.%I t', tabla) INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mdr_select_where(tabla text, columna text, valor anyelement)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM mdr.%I t WHERE %I = $1', tabla, columna) 
  USING valor 
  INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mdr_select_column(tabla text, columna text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (SELECT %I FROM mdr.%I) t', columna, tabla) INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ---------- HRF - Leer datos ----------
CREATE OR REPLACE FUNCTION public.hrf_select_all(tabla text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM hrf.%I t', tabla) INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.hrf_select_where(tabla text, columna text, valor anyelement)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM hrf.%I t WHERE %I = $1', tabla, columna) 
  USING valor 
  INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.hrf_select_column(tabla text, columna text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (SELECT %I FROM hrf.%I) t', columna, tabla) INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ============================================================
-- FUNCIONES PARA INSERTAR DATOS
-- ============================================================

-- ---------- MDR - Insertar datos ----------
CREATE OR REPLACE FUNCTION public.mdr_insert_row(tabla text, datos jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  columns text;
  values_list text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para insertar datos';
  END IF;
  
  -- Construir la lista de columnas y valores desde el jsonb
  SELECT string_agg(quote_ident(key), ', '), 
         string_agg(quote_nullable(value::text), ', ')
  INTO columns, values_list
  FROM jsonb_each_text(datos);
  
  -- Ejecutar INSERT
  EXECUTE format('INSERT INTO mdr.%I (%s) VALUES (%s)', tabla, columns, values_list);
END;
$$;

-- ---------- HRF - Insertar datos ----------
CREATE OR REPLACE FUNCTION public.hrf_insert_row(tabla text, datos jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  columns text;
  values_list text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para insertar datos';
  END IF;
  
  -- Construir la lista de columnas y valores desde el jsonb
  SELECT string_agg(quote_ident(key), ', '), 
         string_agg(quote_nullable(value::text), ', ')
  INTO columns, values_list
  FROM jsonb_each_text(datos);
  
  -- Ejecutar INSERT
  EXECUTE format('INSERT INTO hrf.%I (%s) VALUES (%s)', tabla, columns, values_list);
END;
$$;

-- ============================================================
-- FUNCIONES MEJORADAS PARA BÚSQUEDA DE REFERENCIAS FK
-- ============================================================

-- ---------- MDR - Seleccionar un registro por valor de columna ----------
CREATE OR REPLACE FUNCTION public.mdr_select_one_by_value(tabla text, columna text, valor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  column_type text;
BEGIN
  -- Obtener el tipo de dato de la columna
  SELECT data_type INTO column_type
  FROM information_schema.columns
  WHERE table_schema = 'mdr'
    AND table_name = tabla
    AND column_name = columna;
  
  -- Buscar según el tipo de dato
  IF column_type IN ('integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision') THEN
    -- Para números, convertir el valor a numérico
    EXECUTE format('SELECT row_to_json(t) FROM mdr.%I t WHERE %I = $1::numeric LIMIT 1', tabla, columna)
    USING valor INTO result;
  ELSIF column_type = 'boolean' THEN
    -- Para booleanos
    EXECUTE format('SELECT row_to_json(t) FROM mdr.%I t WHERE %I = $1::boolean LIMIT 1', tabla, columna)
    USING valor INTO result;
  ELSE
    -- Para texto y otros tipos
    EXECUTE format('SELECT row_to_json(t) FROM mdr.%I t WHERE %I::text = $1 LIMIT 1', tabla, columna)
    USING valor INTO result;
  END IF;
  
  RETURN COALESCE(result, '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  -- Si falla, intentar como texto
  BEGIN
    EXECUTE format('SELECT row_to_json(t) FROM mdr.%I t WHERE %I::text = $1 LIMIT 1', tabla, columna)
    USING valor INTO result;
    RETURN COALESCE(result, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RETURN '{}'::jsonb;
  END;
END;
$$;

-- ---------- HRF - Seleccionar un registro por valor de columna ----------
CREATE OR REPLACE FUNCTION public.hrf_select_one_by_value(tabla text, columna text, valor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  column_type text;
BEGIN
  -- Obtener el tipo de dato de la columna
  SELECT data_type INTO column_type
  FROM information_schema.columns
  WHERE table_schema = 'hrf'
    AND table_name = tabla
    AND column_name = columna;
  
  -- Buscar según el tipo de dato
  IF column_type IN ('integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision') THEN
    -- Para números, convertir el valor a numérico
    EXECUTE format('SELECT row_to_json(t) FROM hrf.%I t WHERE %I = $1::numeric LIMIT 1', tabla, columna)
    USING valor INTO result;
  ELSIF column_type = 'boolean' THEN
    -- Para booleanos
    EXECUTE format('SELECT row_to_json(t) FROM hrf.%I t WHERE %I = $1::boolean LIMIT 1', tabla, columna)
    USING valor INTO result;
  ELSE
    -- Para texto y otros tipos
    EXECUTE format('SELECT row_to_json(t) FROM hrf.%I t WHERE %I::text = $1 LIMIT 1', tabla, columna)
    USING valor INTO result;
  END IF;
  
  RETURN COALESCE(result, '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  -- Si falla, intentar como texto
  BEGIN
    EXECUTE format('SELECT row_to_json(t) FROM hrf.%I t WHERE %I::text = $1 LIMIT 1', tabla, columna)
    USING valor INTO result;
    RETURN COALESCE(result, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RETURN '{}'::jsonb;
  END;
END;
$$;
