-- ============================================
-- FUNCIONES PARA EL ESQUEMA MDR (Madres)
-- ============================================

-- Cambiar al esquema mdr
SET search_path TO mdr;

-- get_public_tables para mdr
CREATE OR REPLACE FUNCTION mdr.get_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
AS $$
  SELECT table_name::text
  FROM information_schema.tables
  WHERE table_schema = 'mdr' AND table_type = 'BASE TABLE'
  ORDER BY table_name;
$$;

-- get_table_columns para mdr
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
VOLATILE
AS $$
BEGIN
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
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- get_enum_values para mdr
CREATE OR REPLACE FUNCTION mdr.get_enum_values()
RETURNS TABLE(enum_name text, enum_value text)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
AS $$
  SELECT t.typname::text, e.enumlabel::text
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'mdr'
  ORDER BY t.typname, e.enumsortorder;
$$;

-- alter_table_safe para mdr
CREATE OR REPLACE FUNCTION mdr.alter_table_safe(tabla text, alter_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para modificar la estructura de tablas';
  END IF;
  EXECUTE format('ALTER TABLE mdr.%I %s', tabla, alter_sql);
END;
$$;

-- drop_table_safe para mdr
CREATE OR REPLACE FUNCTION mdr.drop_table_safe(tabla text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para borrar tablas';
  END IF;
  EXECUTE format('DROP TABLE mdr.%I', tabla);
END;
$$;

-- exec_create_enum para mdr
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
  EXECUTE format('SET search_path TO mdr');
  EXECUTE query;
  EXECUTE 'SET search_path TO public';
END;
$$;

-- ============================================
-- FUNCIONES PARA EL ESQUEMA HRF (Huérfanos)
-- ============================================

-- Cambiar al esquema hrf
SET search_path TO hrf;

-- get_public_tables para hrf
CREATE OR REPLACE FUNCTION hrf.get_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
AS $$
  SELECT table_name::text
  FROM information_schema.tables
  WHERE table_schema = 'hrf' AND table_type = 'BASE TABLE'
  ORDER BY table_name;
$$;

-- get_table_columns para hrf
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
VOLATILE
AS $$
BEGIN
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
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- get_enum_values para hrf
CREATE OR REPLACE FUNCTION hrf.get_enum_values()
RETURNS TABLE(enum_name text, enum_value text)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
AS $$
  SELECT t.typname::text, e.enumlabel::text
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'hrf'
  ORDER BY t.typname, e.enumsortorder;
$$;

-- alter_table_safe para hrf
CREATE OR REPLACE FUNCTION hrf.alter_table_safe(tabla text, alter_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para modificar la estructura de tablas';
  END IF;
  EXECUTE format('ALTER TABLE hrf.%I %s', tabla, alter_sql);
END;
$$;

-- drop_table_safe para hrf
CREATE OR REPLACE FUNCTION hrf.drop_table_safe(tabla text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para borrar tablas';
  END IF;
  EXECUTE format('DROP TABLE hrf.%I', tabla);
END;
$$;

-- exec_create_enum para hrf
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
  EXECUTE format('SET search_path TO hrf');
  EXECUTE query;
  EXECUTE 'SET search_path TO public';
END;
$$;

-- Resetear search_path
SET search_path TO public;
END;
$$;

-- exec_create_enum para hrf
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
  EXECUTE format('SET search_path TO hrf');
  EXECUTE query;
  EXECUTE 'SET search_path TO public';
END;
$$;

-- Resetear search_path
SET search_path TO public;
