-- ============================================================
-- CONFIGURAR PERMISOS - GeoFem
-- Configura permisos de schema y tablas para mdr y hrf
-- ============================================================

CREATE OR REPLACE FUNCTION public.configurar_permisos_schemas()
RETURNS TABLE(
  accion text,
  schema_name text,
  objeto text,
  resultado text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  grant_count int := 0;
BEGIN
  -- Validar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para modificar permisos';
  END IF;

  -- PASO 1: Dar USAGE en los schemas mdr y hrf
  -- En Supabase, necesitamos dar acceso a los roles correctos
  EXECUTE 'GRANT USAGE ON SCHEMA mdr TO postgres, anon, authenticated, service_role';
  EXECUTE 'GRANT USAGE ON SCHEMA hrf TO postgres, anon, authenticated, service_role';
  
  -- También dar acceso completo al schema
  EXECUTE 'GRANT ALL ON SCHEMA mdr TO postgres';
  EXECUTE 'GRANT ALL ON SCHEMA hrf TO postgres';
  
  RETURN QUERY SELECT 
    'GRANT USAGE'::text,
    'mdr'::text,
    'schema'::text,
    'Acceso al schema mdr concedido a todos los roles'::text;
    
  RETURN QUERY SELECT 
    'GRANT USAGE'::text,
    'hrf'::text,
    'schema'::text,
    'Acceso al schema hrf concedido a todos los roles'::text;

  -- PASO 2: Dar permisos SELECT a todas las tablas (para anon y authenticated)
  FOR r IN 
    SELECT 
      schemaname as schema_name,
      tablename as table_name
    FROM pg_tables
    WHERE schemaname IN ('mdr', 'hrf')
    ORDER BY schemaname, tablename
  LOOP
    -- SELECT para todos (anon + authenticated)
    EXECUTE format('GRANT SELECT ON %I.%I TO postgres, anon, authenticated, service_role', 
      r.schema_name, r.table_name);
    
    grant_count := grant_count + 1;
    
    RETURN QUERY SELECT 
      'GRANT SELECT'::text,
      r.schema_name,
      r.table_name,
      'SELECT concedido a todos los roles'::text;

    -- INSERT solo para authenticated
    EXECUTE format('GRANT INSERT ON %I.%I TO postgres, authenticated, service_role', 
      r.schema_name, r.table_name);
    
    grant_count := grant_count + 1;
    
    RETURN QUERY SELECT 
      'GRANT INSERT'::text,
      r.schema_name,
      r.table_name,
      'INSERT concedido a authenticated'::text;

    -- UPDATE solo para authenticated
    EXECUTE format('GRANT UPDATE ON %I.%I TO postgres, authenticated, service_role', 
      r.schema_name, r.table_name);
    
    grant_count := grant_count + 1;
    
    RETURN QUERY SELECT 
      'GRANT UPDATE'::text,
      r.schema_name,
      r.table_name,
      'UPDATE concedido a authenticated'::text;

  END LOOP;

  -- PASO 3: Dar permisos en secuencias (para INSERT con columnas ID auto-incrementales)
  FOR r IN 
    SELECT 
      schemaname as schema_name,
      sequencename as sequence_name
    FROM pg_sequences
    WHERE schemaname IN ('mdr', 'hrf')
    ORDER BY schemaname, sequencename
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO postgres, authenticated, service_role', 
      r.schema_name, r.sequence_name);
    
    grant_count := grant_count + 1;
    
    RETURN QUERY SELECT 
      'GRANT SEQUENCE'::text,
      r.schema_name,
      r.sequence_name,
      'USAGE, SELECT en secuencia concedido a todos los roles'::text;
  END LOOP;

  -- Resumen final
  RETURN QUERY SELECT 
    'RESUMEN'::text,
    ''::text,
    ''::text,
    format('Total: %s permisos concedidos', grant_count)::text;

END;
$$;

GRANT EXECUTE ON FUNCTION public.configurar_permisos_schemas() TO authenticated;

COMMENT ON FUNCTION public.configurar_permisos_schemas() IS 
'Configura todos los permisos necesarios en schemas mdr y hrf:
- USAGE en schemas para anon + authenticated
- SELECT en todas las tablas para anon + authenticated
- INSERT/UPDATE en todas las tablas para authenticated
- USAGE/SELECT en secuencias para authenticated
Solo ejecutable por usuarios autenticados.';

-- ============================================================
-- FUNCIÓN PARA VERIFICAR PERMISOS ACTUALES
-- ============================================================

CREATE OR REPLACE FUNCTION public.ver_permisos_schemas()
RETURNS TABLE(
  schema_name text,
  tabla text,
  grantee text,
  privilege_type text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    table_schema::text as schema_name,
    table_name::text as tabla,
    grantee::text,
    privilege_type::text
  FROM information_schema.table_privileges
  WHERE table_schema IN ('mdr', 'hrf')
    AND grantee IN ('anon', 'authenticated', 'postgres')
  ORDER BY table_schema, table_name, grantee, privilege_type;
$$;

GRANT EXECUTE ON FUNCTION public.ver_permisos_schemas() TO anon, authenticated;

COMMENT ON FUNCTION public.ver_permisos_schemas() IS 
'Muestra todos los permisos actuales de las tablas en schemas mdr y hrf';

-- ============================================================
-- INSTRUCCIONES DE USO
-- ============================================================

/*

Para configurar los permisos:

1. Verificar permisos actuales:
   SELECT * FROM ver_permisos_schemas();

2. Ejecutar configuración de permisos (debes estar autenticado):
   SELECT * FROM configurar_permisos_schemas();

3. Verificar resultado:
   SELECT * FROM ver_permisos_schemas();

PERMISOS CONFIGURADOS:

A nivel de SCHEMA:
- USAGE en mdr → anon, authenticated
- USAGE en hrf → anon, authenticated

A nivel de TABLAS:
- SELECT → anon, authenticated (lectura pública)
- INSERT → authenticated (requiere autenticación)
- UPDATE → authenticated (requiere autenticación)

A nivel de SECUENCIAS:
- USAGE, SELECT → authenticated (para auto-incrementales)

IMPORTANTE:
- Los permisos de SCHEMA son necesarios para acceder a cualquier objeto dentro
- Los permisos de tabla permiten las operaciones SQL
- Las políticas RLS (ya configuradas) controlan QUÉ filas ve cada usuario
- Sin USAGE en schema = "permission denied for schema"
- Sin permisos en tabla = "permission denied for table"

ALTERNATIVA - Ejecutar comandos SQL directamente:

Si la función no funciona, ejecuta estos comandos directamente en el SQL Editor:

*/

-- ============================================================
-- COMANDOS DIRECTOS (ejecutar si la función falla)
-- ============================================================

-- Dar acceso a los schemas
GRANT USAGE ON SCHEMA mdr TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA hrf TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA mdr TO postgres;
GRANT ALL ON SCHEMA hrf TO postgres;

-- Dar permisos en todas las tablas existentes
GRANT SELECT ON ALL TABLES IN SCHEMA mdr TO postgres, anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA hrf TO postgres, anon, authenticated, service_role;

GRANT INSERT, UPDATE ON ALL TABLES IN SCHEMA mdr TO postgres, authenticated, service_role;
GRANT INSERT, UPDATE ON ALL TABLES IN SCHEMA hrf TO postgres, authenticated, service_role;

-- Dar permisos en todas las secuencias
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA mdr TO postgres, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA hrf TO postgres, authenticated, service_role;

-- Dar permisos por defecto para tablas/secuencias futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA mdr GRANT SELECT ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA hrf GRANT SELECT ON TABLES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA mdr GRANT INSERT, UPDATE ON TABLES TO postgres, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA hrf GRANT INSERT, UPDATE ON TABLES TO postgres, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA mdr GRANT USAGE, SELECT ON SEQUENCES TO postgres, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA hrf GRANT USAGE, SELECT ON SEQUENCES TO postgres, authenticated, service_role;
