-- =====================================================
-- FUNCIONES PARA OBTENER ENUMERADOS DEL SCHEMA PUBLIC
-- =====================================================
-- Los enums están en schema public y son compartidos entre mdr y hrf
-- Estas funciones permiten listarlos sin necesidad de tabla profiles

-- Función para obtener todos los valores de todos los enums
CREATE OR REPLACE FUNCTION public.get_enum_values()
RETURNS TABLE(enum_name text, enum_value text)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Verificar autenticación (ya no usamos tabla profiles)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para ver los enumerados';
  END IF;

  RETURN QUERY
    SELECT t.typname::text AS enum_name,
           e.enumlabel::text AS enum_value
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder;
    
EXCEPTION 
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error al obtener enumerados: %', SQLERRM;
END;
$$;

-- Función para obtener solo los nombres de los enums (sin valores)
CREATE OR REPLACE FUNCTION public.get_enum_types()
RETURNS TABLE(enum_name text)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Verificar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para ver los tipos de enumerados';
  END IF;

  RETURN QUERY
    SELECT t.typname::text AS enum_name
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
    
EXCEPTION 
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error al obtener tipos de enumerados: %', SQLERRM;
END;
$$;

-- Otorgar permisos de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION public.get_enum_values() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_enum_types() TO authenticated;

-- Comentarios para documentación
COMMENT ON FUNCTION public.get_enum_values() IS 'Obtiene todos los valores de todos los enumerados del schema public. Requiere autenticación.';
COMMENT ON FUNCTION public.get_enum_types() IS 'Obtiene la lista de nombres de enumerados en el schema public. Requiere autenticación.';
