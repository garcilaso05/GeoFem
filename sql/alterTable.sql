create or replace function alter_table_safe(tabla text, alter_sql text, p_schema text default 'mdr')
returns void
language plpgsql
security definer
VOLATILE
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes estar autenticado para modificar la estructura de tablas';
  end if;
  execute format('ALTER TABLE %I.%I %s', p_schema, tabla, alter_sql);
end;
$$;

create or replace function drop_table_safe(tabla text, p_schema text default 'mdr')
returns void
language plpgsql
security definer
VOLATILE
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes estar autenticado para borrar tablas';
  end if;
  execute format('DROP TABLE %I.%I', p_schema, tabla);
end;
$$;