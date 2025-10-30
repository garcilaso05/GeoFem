-- get_public_tables

set search_path = public;

create or replace function get_public_tables(p_schema text default 'mdr')
returns table(table_name text)
language plpgsql
security definer
VOLATILE
as $$
begin
  return query
    select t.table_name::text as table_name
    from information_schema.tables t
    where t.table_schema = p_schema and t.table_type = 'BASE TABLE'
    order by t.table_name;
exception when others then
  raise;
end;
$$;

-- get_table_columns

CREATE OR REPLACE FUNCTION get_table_columns(tabla text, p_schema text default 'mdr')
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
         WHERE kcu.table_schema = p_schema
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
        AND tc.table_schema = p_schema
    ) pk ON c.column_name = pk.column_name
    WHERE c.table_schema = p_schema
      AND c.table_name = tabla
    ORDER BY c.ordinal_position;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- get_enum_values
create or replace function get_enum_values(p_schema text default 'mdr')
returns table(enum_name text, enum_value text)
language plpgsql
security definer
VOLATILE
as $$
begin
  return query
    select t.typname::text as enum_name,
           e.enumlabel::text as enum_value
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = p_schema
    order by t.typname, e.enumsortorder;
exception when others then
  raise;
end;
$$;


-- get_enum_types
create or replace function get_enum_types(p_schema text default 'mdr')
returns table(enum_name text)
language plpgsql
security definer
VOLATILE
as $$
begin
  return query
    select t.typname::text as enum_name
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = p_schema
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