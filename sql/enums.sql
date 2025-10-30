set search_path to public;

create or replace function exec_create_enum(query text, p_schema text default 'mdr')
returns void
language plpgsql
security definer
VOLATILE
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes estar autenticado para crear ENUMs';
  end if;
  execute format('SET search_path TO %I', p_schema);
  execute query;
  execute 'SET search_path TO public';
end;
$$;
$$;
