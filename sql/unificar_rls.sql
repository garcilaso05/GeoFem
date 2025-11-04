-- ============================================================
-- UNIFICAR POLÍTICAS RLS - GeoFem
-- Estandariza todas las políticas RLS en los schemas mdr y hrf
-- ============================================================

CREATE OR REPLACE FUNCTION public.unificar_politicas_rls()
RETURNS TABLE(
  accion text,
  schema_name text,
  tabla text,
  resultado text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  policy_name text;
  drop_count int := 0;
  create_count int := 0;
BEGIN
  -- Validar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para modificar políticas RLS';
  END IF;

  -- PASO 1: Primero eliminar TODAS las políticas existentes de todos los schemas
  FOR r IN 
    SELECT 
      schemaname as schema_name,
      tablename as table_name,
      policyname as policy_name
    FROM pg_policies
    WHERE schemaname IN ('mdr', 'hrf')
    ORDER BY schemaname, tablename, policyname
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
      r.policy_name, r.schema_name, r.table_name);
    
    drop_count := drop_count + 1;
    
    RETURN QUERY SELECT 
      'DROP'::text,
      r.schema_name,
      r.table_name,
      format('Eliminada política: %s', r.policy_name)::text;
  END LOOP;

  -- PASO 2: Ahora crear las políticas nuevas para cada tabla
  FOR r IN 
    SELECT 
      schemaname as schema_name,
      tablename as table_name
    FROM pg_tables
    WHERE schemaname IN ('mdr', 'hrf')
    ORDER BY schemaname, tablename
  LOOP

        -- Habilitar RLS en la tabla (por si no estaba habilitado)
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 
      r.schema_name, r.table_name);

    -- PASO 3: Crear política SELECT (acceso público: anon + authenticated)
    EXECUTE format('
      CREATE POLICY %I ON %I.%I
      FOR SELECT
      TO anon, authenticated
      USING (true)
    ', 
      format('%s_select_policy', r.table_name),
      r.schema_name, 
      r.table_name
    );
    
    create_count := create_count + 1;
    
    RETURN QUERY SELECT 
      'CREATE'::text,
      r.schema_name,
      r.table_name,
      'Creada política: SELECT (public)'::text;

    -- PASO 4: Crear política INSERT (solo authenticated)
    EXECUTE format('
      CREATE POLICY %I ON %I.%I
      FOR INSERT
      TO authenticated
      WITH CHECK (true)
    ', 
      format('%s_insert_policy', r.table_name),
      r.schema_name, 
      r.table_name
    );
    
    create_count := create_count + 1;
    
    RETURN QUERY SELECT 
      'CREATE'::text,
      r.schema_name,
      r.table_name,
      'Creada política: INSERT (authenticated)'::text;

    -- PASO 5: Crear política UPDATE (solo authenticated)
    EXECUTE format('
      CREATE POLICY %I ON %I.%I
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true)
    ', 
      format('%s_update_policy', r.table_name),
      r.schema_name, 
      r.table_name
    );
    
    create_count := create_count + 1;
    
    RETURN QUERY SELECT 
      'CREATE'::text,
      r.schema_name,
      r.table_name,
      'Creada política: UPDATE (authenticated)'::text;

  END LOOP;

  -- Resumen final
  RETURN QUERY SELECT 
    'RESUMEN'::text,
    ''::text,
    ''::text,
    format('Total: %s políticas eliminadas, %s políticas creadas', 
      drop_count, create_count)::text;

END;
$$;

GRANT EXECUTE ON FUNCTION public.unificar_politicas_rls() TO authenticated;

COMMENT ON FUNCTION public.unificar_politicas_rls() IS 
'Unifica todas las políticas RLS de los schemas mdr y hrf:
- SELECT: Acceso público (anon + authenticated)
- INSERT: Solo authenticated
- UPDATE: Solo authenticated
Solo ejecutable por usuarios autenticados.';

-- ============================================================
-- FUNCIÓN PARA VERIFICAR POLÍTICAS ACTUALES
-- ============================================================

CREATE OR REPLACE FUNCTION public.ver_politicas_rls()
RETURNS TABLE(
  schema_name text,
  tabla text,
  politica text,
  comando text,
  roles text[],
  permissive text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    schemaname::text,
    tablename::text,
    policyname::text,
    cmd::text,
    roles::text[],
    permissive::text
  FROM pg_policies
  WHERE schemaname IN ('mdr', 'hrf')
  ORDER BY schemaname, tablename, cmd, policyname;
$$;

GRANT EXECUTE ON FUNCTION public.ver_politicas_rls() TO anon, authenticated;

COMMENT ON FUNCTION public.ver_politicas_rls() IS 
'Muestra todas las políticas RLS actuales de los schemas mdr y hrf';

-- ============================================================
-- INSTRUCCIONES DE USO
-- ============================================================

/*

Para ejecutar la unificación de políticas RLS:

1. Verificar políticas actuales:
   SELECT * FROM ver_politicas_rls();

2. Ejecutar unificación (debes estar autenticado):
   SELECT * FROM unificar_politicas_rls();

3. Verificar resultado:
   SELECT * FROM ver_politicas_rls();

RESULTADO ESPERADO:
- Cada tabla tendrá exactamente 3 políticas:
  * {tabla}_select_policy: SELECT para anon + authenticated
  * {tabla}_insert_policy: INSERT para authenticated
  * {tabla}_update_policy: UPDATE para authenticated

IMPORTANTE:
- DELETE no tiene política → Nadie puede eliminar registros
- Todas las políticas usan USING (true) / WITH CHECK (true)
- Las políticas son permisivas (no restrictivas)
- Se mantiene RLS habilitado en todas las tablas

*/
