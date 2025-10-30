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

create policy "Enable users to view their own data only"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
);