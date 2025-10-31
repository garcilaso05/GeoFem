create or replace function alter_table_safe(tabla text, alter_sql text)
returns void
language plpgsql
security definer
VOLATILE
SET search_path = public
as $$
begin
  -- Solo usuarios autenticados pueden modificar la estructura de tablas
  if auth.uid() is null then
    raise exception 'Debes estar autenticado para modificar la estructura de tablas';
  end if;
  execute format('ALTER TABLE %I %s', tabla, alter_sql);
end;
$$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  nombre text,
  descripcion text,
  created_at timestamp with time zone default now()
);

-- Aseguramos la migración del esquema existente sin eliminar la tabla
alter table if exists public.profiles
  drop column if exists role;

alter table if exists public.profiles
  add column if not exists nombre text,
  add column if not exists descripcion text;

-- 2. Creamos la función para insertar automáticamente
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
VOLATILE
SET search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. Creamos el trigger en auth.users
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure handle_new_user();

-- 4. Sincronizamos usuarios antiguos (los que ya existían en auth.users)
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
left join public.profiles p on u.id = p.id
where p.id is null;

-- 5. Activamos RLS y definimos la política de acceso

alter table public.profiles enable row level security;
DROP POLICY "Enable users to view their own data only" ON profiles;
create policy "Enable users to view their own data only"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
);

set search_path to public;

create or replace function exec_create_enum(query text)
returns void
language plpgsql
security definer
VOLATILE
SET search_path = public
as $$
begin
  -- Solo usuarios autenticados pueden ejecutar esta función
  if auth.uid() is null then
    raise exception 'Debes estar autenticado para crear ENUMs';
  end if;

  execute query;
end;
$$;


-- get_public_tables

set search_path = public;

create or replace function get_public_tables()
returns table(table_name text)
language plpgsql
security definer
VOLATILE
SET search_path = public
as $$
begin
  perform set_config('search_path', 'public', false);

  return query
    select t.table_name::text as table_name
    from information_schema.tables t
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by t.table_name;
exception when others then
  raise;
end;
$$;

-- get_table_columns

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
         WHERE kcu.table_schema = 'public'
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
        AND tc.table_schema = 'public'
    ) pk ON c.column_name = pk.column_name
    WHERE c.table_schema = 'public'
      AND c.table_name = tabla
    ORDER BY c.ordinal_position;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- get_enum_values
create or replace function get_enum_values()
returns table(enum_name text, enum_value text)
language plpgsql
security definer
VOLATILE
SET search_path = public
as $$
begin
  return query
    select t.typname::text as enum_name,
           e.enumlabel::text as enum_value
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    order by t.typname, e.enumsortorder;
exception when others then
  raise;
end;
$$;


-- get_enum_types
create or replace function get_enum_types()
returns table(enum_name text)
language plpgsql
security definer
VOLATILE
SET search_path = public
as $$
begin
  perform set_config('search_path', 'public', false);

  return query
    select t.typname::text as enum_name
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    group by t.typname
    order by t.typname;
exception when others then
  raise;
end;
$$;


create or replace function get_primary_key(tabla text)
returns table(
  column_name text,
  data_type text,
  character_maximum_length int
)
language sql
as $$
  select
    a.attname as column_name,
    format_type(a.atttypid, a.atttypmod) as data_type,
    case
      when t.typname = 'varchar' then a.atttypmod - 4
      else null
    end as character_maximum_length
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  join pg_type t on t.oid = a.atttypid
  where i.indrelid = ('public.' || tabla)::regclass
    and i.indisprimary
$$;

-- ============================================
-- FUNCIONES PÚBLICAS AUXILIARES
-- ============================================

-- Función pública genérica para listar tablas de un schema dado
CREATE OR REPLACE FUNCTION public.get_public_tables(p_schema text)
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
AS $$
  SELECT table_name::text
  FROM information_schema.tables
  WHERE table_schema = p_schema AND table_type = 'BASE TABLE'
  ORDER BY table_name;
$$;


-- ============================================
-- FUNCIONES PARA EL ESQUEMA MDR (Madres)
-- ============================================

-- get_public_tables para mdr (wrapper que llama a la pública)
CREATE OR REPLACE FUNCTION mdr.get_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
AS $$
  SELECT table_name FROM public.get_public_tables('mdr');
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

-- get_enum_types para mdr (corregido con GROUP BY)
CREATE OR REPLACE FUNCTION mdr.get_enum_types()
RETURNS TABLE(enum_name text)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
AS $$
  SELECT t.typname::text AS enum_name
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'mdr'
  GROUP BY t.typname
  ORDER BY t.typname;
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
-- uso de set_config para ajustar search_path solo en el contexto de la transacción
CREATE OR REPLACE FUNCTION mdr.exec_create_enum(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  _prev text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para crear ENUMs';
  END IF;

  -- guarda y setea search_path localmente
  PERFORM set_config('search_path', 'mdr', true);
  EXECUTE query;
  -- Opcional: restaurar a public (set_config con third arg true es local a la transacción, así que no es estrictamente necesario)
  PERFORM set_config('search_path', 'public', true);
END;
$$;


-- get_primary_key para mdr
CREATE OR REPLACE FUNCTION mdr.get_primary_key(tabla text)
RETURNS TABLE(column_name text, data_type text, character_maximum_length int)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
AS $$
  SELECT
    a.attname as column_name,
    format_type(a.atttypid, a.atttypmod) as data_type,
    CASE WHEN t.typname = 'varchar' THEN a.atttypmod - 4 ELSE NULL END
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE i.indrelid = ('mdr.' || tabla)::regclass
    AND i.indisprimary;
$$;


-- ============================================
-- FUNCIONES PARA EL ESQUEMA HRF (Huérfanos)
-- ============================================

-- get_public_tables para hrf (wrapper que llama a la pública)
CREATE OR REPLACE FUNCTION hrf.get_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
AS $$
  SELECT table_name FROM public.get_public_tables('hrf');
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

-- get_enum_types para hrf (corregido con GROUP BY)
CREATE OR REPLACE FUNCTION hrf.get_enum_types()
RETURNS TABLE(enum_name text)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
AS $$
  SELECT t.typname::text AS enum_name
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'hrf'
  GROUP BY t.typname
  ORDER BY t.typname;
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

  PERFORM set_config('search_path', 'hrf', true);
  EXECUTE query;
  PERFORM set_config('search_path', 'public', true);
END;
$$;

-- get_primary_key para hrf
CREATE OR REPLACE FUNCTION hrf.get_primary_key(tabla text)
RETURNS TABLE(column_name text, data_type text, character_maximum_length int)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
AS $$
  SELECT
    a.attname as column_name,
    format_type(a.atttypid, a.atttypmod) as data_type,
    CASE WHEN t.typname = 'varchar' THEN a.atttypmod - 4 ELSE NULL END
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE i.indrelid = ('hrf.' || tabla)::regclass
    AND i.indisprimary;
$$;


-- ============================================================
-- FUNCIONES PÚBLICAS DE ACCESO A LOS ESQUEMAS MDR Y HRF
-- ============================================================

SET search_path TO public;

-- ---------- MDR ----------
CREATE OR REPLACE FUNCTION public.mdr_get_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM mdr.get_public_tables();
$$;

CREATE OR REPLACE FUNCTION public.mdr_get_table_columns(tabla text)
RETURNS TABLE(
  column_name text,
  data_type text,
  character_maximum_length int,
  udt_name text,
  fk_comment text,
  is_primary boolean
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM mdr.get_table_columns(tabla);
$$;

CREATE OR REPLACE FUNCTION public.mdr_get_enum_values()
RETURNS TABLE(enum_name text, enum_value text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM mdr.get_enum_values();
$$;

-- ---------- HRF ----------
CREATE OR REPLACE FUNCTION public.hrf_get_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM hrf.get_public_tables();
$$;

CREATE OR REPLACE FUNCTION public.hrf_get_table_columns(tabla text)
RETURNS TABLE(
  column_name text,
  data_type text,
  character_maximum_length int,
  udt_name text,
  fk_comment text,
  is_primary boolean
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM hrf.get_table_columns(tabla);
$$;

CREATE OR REPLACE FUNCTION public.hrf_get_enum_values()
RETURNS TABLE(enum_name text, enum_value text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM hrf.get_enum_values();
$$;


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
