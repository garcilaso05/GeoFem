-- Función mejorada para obtener columnas de una tabla
-- Esta versión incluye información de primary key que necesita el módulo editar_tabla
-- Ejecutar en Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_table_columns(tabla text)
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
VOLATILE
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();

  IF user_role IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado';
  END IF;

  RETURN QUERY
    SELECT
      c.column_name::text   AS column_name,
      c.data_type::text     AS data_type,
      c.character_maximum_length::int AS character_maximum_length,
      c.udt_name::text      AS udt_name,
      COALESCE(
        (SELECT 'FK -> ' || kcu2.table_name || '.' || kcu2.column_name
         FROM information_schema.key_column_usage kcu
         JOIN information_schema.referential_constraints rc
           ON kcu.constraint_name = rc.constraint_name
         JOIN information_schema.key_column_usage kcu2
           ON rc.unique_constraint_name = kcu2.constraint_name
          AND kcu.ordinal_position = kcu2.ordinal_position
         WHERE kcu.table_schema = 'public'
           AND kcu.table_name = c.table_name
           AND kcu.column_name = c.column_name
         LIMIT 1
        ), ''
      ) AS fk_comment,
      -- Agregar información de primary key
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
        AND tc.table_schema = 'public'
    ) pk ON c.column_name = pk.column_name
    WHERE c.table_schema = 'public'
      AND c.table_name = tabla
    ORDER BY c.ordinal_position;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;