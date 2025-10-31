-- =====================================================
-- FUNCIONES PARA ACTUALIZAR FILAS (UPDATE)
-- =====================================================
-- Estas funciones permiten actualizar campos individuales en las tablas
-- Requieren autenticación y respetan las políticas RLS

-- =====================================================
-- SCHEMA: MDR (Madres)
-- =====================================================

CREATE OR REPLACE FUNCTION mdr.update_row(tabla text, id_val integer, campo text, valor text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  column_type text;
  column_udt_name text;
BEGIN
  -- Verificar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para actualizar datos';
  END IF;
  
  -- Sanitizar nombre de tabla y campo
  IF tabla !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Nombre de tabla inválido';
  END IF;
  
  IF campo !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Nombre de campo inválido';
  END IF;
  
  -- No permitir actualizar el campo 'id'
  IF campo = 'id' THEN
    RAISE EXCEPTION 'No se puede modificar el campo ID';
  END IF;
  
  -- Obtener tipo de dato y udt_name de la columna
  SELECT data_type, udt_name INTO column_type, column_udt_name
  FROM information_schema.columns
  WHERE table_schema = 'mdr'
    AND table_name = tabla
    AND column_name = campo;
  
  IF column_type IS NULL THEN
    RAISE EXCEPTION 'La columna % no existe en la tabla %', campo, tabla;
  END IF;
  
  -- Actualizar según el tipo de dato
  IF column_type IN ('integer', 'bigint', 'smallint') THEN
    EXECUTE format('UPDATE mdr.%I SET %I = $1::integer WHERE id = $2', tabla, campo)
    USING valor, id_val;
  ELSIF column_type IN ('numeric', 'decimal', 'real', 'double precision') THEN
    EXECUTE format('UPDATE mdr.%I SET %I = $1::numeric WHERE id = $2', tabla, campo)
    USING valor, id_val;
  ELSIF column_type = 'boolean' THEN
    EXECUTE format('UPDATE mdr.%I SET %I = $1::boolean WHERE id = $2', tabla, campo)
    USING valor, id_val;
  ELSIF column_type = 'date' THEN
    EXECUTE format('UPDATE mdr.%I SET %I = $1::date WHERE id = $2', tabla, campo)
    USING valor, id_val;
  ELSIF column_type = 'timestamp without time zone' OR column_type = 'timestamp with time zone' THEN
    EXECUTE format('UPDATE mdr.%I SET %I = $1::timestamp WHERE id = $2', tabla, campo)
    USING valor, id_val;
  ELSIF column_type = 'USER-DEFINED' THEN
    -- Para enums, hacer cast explícito al tipo específico (en schema public)
    EXECUTE format('UPDATE mdr.%I SET %I = $1::public.%I WHERE id = $2', tabla, campo, column_udt_name)
    USING valor, id_val;
  ELSIF column_type = 'ARRAY' THEN
    -- Para arrays, intentar cast como array de texto
    EXECUTE format('UPDATE mdr.%I SET %I = $1::text[] WHERE id = $2', tabla, campo)
    USING valor, id_val;
  ELSE
    -- Para text, varchar, character varying, etc.
    EXECUTE format('UPDATE mdr.%I SET %I = $1 WHERE id = $2', tabla, campo)
    USING valor, id_val;
  END IF;
  
  RAISE NOTICE 'Campo % actualizado en tabla % para ID %', campo, tabla, id_val;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error al actualizar: %', SQLERRM;
END;
$$;

-- =====================================================
-- SCHEMA: HRF (Huérfanos)
-- =====================================================

CREATE OR REPLACE FUNCTION hrf.update_row(tabla text, id_val integer, campo text, valor text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  column_type text;
  column_udt_name text;
BEGIN
  -- Verificar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para actualizar datos';
  END IF;
  
  -- Sanitizar nombre de tabla y campo
  IF tabla !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Nombre de tabla inválido';
  END IF;
  
  IF campo !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Nombre de campo inválido';
  END IF;
  
  -- No permitir actualizar el campo 'id'
  IF campo = 'id' THEN
    RAISE EXCEPTION 'No se puede modificar el campo ID';
  END IF;
  
  -- Obtener tipo de dato y udt_name de la columna
  SELECT data_type, udt_name INTO column_type, column_udt_name
  FROM information_schema.columns
  WHERE table_schema = 'hrf'
    AND table_name = tabla
    AND column_name = campo;
  
  IF column_type IS NULL THEN
    RAISE EXCEPTION 'La columna % no existe en la tabla %', campo, tabla;
  END IF;
  
  -- Actualizar según el tipo de dato
  IF column_type IN ('integer', 'bigint', 'smallint') THEN
    EXECUTE format('UPDATE hrf.%I SET %I = $1::integer WHERE id = $2', tabla, campo)
    USING valor, id_val;
  ELSIF column_type IN ('numeric', 'decimal', 'real', 'double precision') THEN
    EXECUTE format('UPDATE hrf.%I SET %I = $1::numeric WHERE id = $2', tabla, campo)
    USING valor, id_val;
  ELSIF column_type = 'boolean' THEN
    EXECUTE format('UPDATE hrf.%I SET %I = $1::boolean WHERE id = $2', tabla, campo)
    USING valor, id_val;
  ELSIF column_type = 'date' THEN
    EXECUTE format('UPDATE hrf.%I SET %I = $1::date WHERE id = $2', tabla, campo)
    USING valor, id_val;
  ELSIF column_type = 'timestamp without time zone' OR column_type = 'timestamp with time zone' THEN
    EXECUTE format('UPDATE hrf.%I SET %I = $1::timestamp WHERE id = $2', tabla, campo)
    USING valor, id_val;
  ELSIF column_type = 'USER-DEFINED' THEN
    -- Para enums, hacer cast explícito al tipo específico (en schema public)
    EXECUTE format('UPDATE hrf.%I SET %I = $1::public.%I WHERE id = $2', tabla, campo, column_udt_name)
    USING valor, id_val;
  ELSIF column_type = 'ARRAY' THEN
    -- Para arrays, intentar cast como array de texto
    EXECUTE format('UPDATE hrf.%I SET %I = $1::text[] WHERE id = $2', tabla, campo)
    USING valor, id_val;
  ELSE
    -- Para text, varchar, character varying, etc.
    EXECUTE format('UPDATE hrf.%I SET %I = $1 WHERE id = $2', tabla, campo)
    USING valor, id_val;
  END IF;
  
  RAISE NOTICE 'Campo % actualizado en tabla % para ID %', campo, tabla, id_val;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error al actualizar: %', SQLERRM;
END;
$$;

-- =====================================================
-- WRAPPERS EN SCHEMA PUBLIC
-- =====================================================

CREATE OR REPLACE FUNCTION public.mdr_update_row(tabla text, id_val integer, campo text, valor text)
RETURNS void 
LANGUAGE sql 
SECURITY DEFINER 
VOLATILE
AS $$ 
  SELECT mdr.update_row(tabla, id_val, campo, valor); 
$$;

CREATE OR REPLACE FUNCTION public.hrf_update_row(tabla text, id_val integer, campo text, valor text)
RETURNS void 
LANGUAGE sql 
SECURITY DEFINER 
VOLATILE
AS $$ 
  SELECT hrf.update_row(tabla, id_val, campo, valor); 
$$;

-- =====================================================
-- PERMISOS
-- =====================================================

GRANT EXECUTE ON FUNCTION mdr.update_row(text, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION hrf.update_row(text, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mdr_update_row(text, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hrf_update_row(text, integer, text, text) TO authenticated;

-- =====================================================
-- COMENTARIOS
-- =====================================================

COMMENT ON FUNCTION mdr.update_row IS 'Actualiza un campo individual de una fila en el schema mdr. Requiere autenticación.';
COMMENT ON FUNCTION hrf.update_row IS 'Actualiza un campo individual de una fila en el schema hrf. Requiere autenticación.';
COMMENT ON FUNCTION public.mdr_update_row IS 'Wrapper para actualizar datos en mdr desde el schema public.';
COMMENT ON FUNCTION public.hrf_update_row IS 'Wrapper para actualizar datos en hrf desde el schema public.';
