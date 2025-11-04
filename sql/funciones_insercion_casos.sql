-- ============================================================
-- FUNCIONES DE INSERCIÓN DE CASOS COMPLETOS - GeoFem
-- Maneja inserción de registro padre + registros hijos
-- Resuelve dependencias circulares de FK
-- ============================================================

-- ============================================================
-- INSERCIÓN DE CASO COMPLETO EN MDR (Madres)
-- ============================================================
-- Estructura de madre:
--   - contexto -> madre_contexto_asesinato
--   - madre_sociodemografico -> madre_sociodemo
--   - padre_sociodemografico -> agresor_sociodemo
--   - psico_social -> madre_salud_psico
--   - acogida -> madre_acogida
--   - servicios_ayudas -> madre_acceso_servicios_ayudas

CREATE OR REPLACE FUNCTION public.insert_caso_mdr(
  p_id_madre bigint,   -- ID generado por el frontend (aleatorio 3000-100000)
  p_datos_hijas jsonb  -- { "tabla1": {...}, "tabla2": {...}, ... }
)
RETURNS jsonb  -- Retorna { "madre_id": 123, "ids_hijas": {...} }
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  v_id_padre bigint;
  v_tabla_hija text;
  v_datos_hija jsonb;
  v_id_hija bigint;
  v_ids_hijas jsonb := '{}'::jsonb;
  v_fk_column text;
  v_result jsonb;
  -- Mapeo de tabla a columna FK en padre
  v_fk_map jsonb := '{
    "madre_contexto_asesinato": "contexto",
    "madre_sociodemo": "madre_sociodemografico",
    "agresor_sociodemo": "padre_sociodemografico",
    "madre_salud_psico": "psico_social",
    "madre_acogida": "acogida",
    "madre_acceso_servicios_ayudas": "servicios_ayudas"
  }'::jsonb;
BEGIN
  -- Verificar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para insertar datos';
  END IF;

  -- PASO 1: Insertar registro PADRE con ID especificado
  -- Usar el ID generado por el frontend (aleatorio entre 3000 y 100000)
  INSERT INTO mdr.madre (id)
  VALUES (p_id_madre)
  RETURNING id INTO v_id_padre;
  
  RAISE NOTICE 'Caso madre creado con ID: %', v_id_padre;

  -- PASO 2: Insertar registros en tablas HIJAS
  -- Las tablas hijas DEBEN tener el mismo ID que la madre (no son auto-incrementales)
  FOR v_tabla_hija, v_datos_hija IN 
    SELECT key, value FROM jsonb_each(p_datos_hijas)
  LOOP
    -- Verificar que la tabla es válida
    IF NOT (v_fk_map ? v_tabla_hija) THEN
      RAISE WARNING 'Tabla % no reconocida como hija de madre, saltando...', v_tabla_hija;
      CONTINUE;
    END IF;
    
    -- CRÍTICO: Remover cualquier campo 'id' del JSON
    v_datos_hija := v_datos_hija - 'id';
    
    -- AGREGAR el ID de la madre a los datos de la hija
    v_datos_hija := jsonb_set(v_datos_hija, '{id}', to_jsonb(v_id_padre));
    
    -- Insertar en la tabla hija con el MISMO ID que la madre
    EXECUTE format(
      'INSERT INTO mdr.%I SELECT * FROM jsonb_populate_record(null::mdr.%I, $1) RETURNING id',
      v_tabla_hija,
      v_tabla_hija
    ) USING v_datos_hija INTO v_id_hija;
    
    -- Guardar el ID de la hija (que es el mismo que el de la madre)
    v_ids_hijas := jsonb_set(v_ids_hijas, array[v_tabla_hija], to_jsonb(v_id_hija));
    
    RAISE NOTICE 'Registro en % creado con ID: %', v_tabla_hija, v_id_hija;
  END LOOP;

  -- PASO 3: Actualizar registro PADRE con FK a las hijas
  FOR v_tabla_hija IN SELECT jsonb_object_keys(v_ids_hijas)
  LOOP
    -- Obtener nombre de columna FK en el padre
    v_fk_column := v_fk_map->>v_tabla_hija;
    v_id_hija := (v_ids_hijas->>v_tabla_hija)::bigint;
    
    -- Actualizar el padre
    EXECUTE format(
      'UPDATE mdr.madre SET %I = $1 WHERE id = $2',
      v_fk_column
    ) USING v_id_hija, v_id_padre;
    
    RAISE NOTICE 'Madre.% actualizado a %', v_fk_column, v_id_hija;
  END LOOP;

  -- Retornar resultado
  v_result := jsonb_build_object(
    'madre_id', v_id_padre,
    'ids_hijas', v_ids_hijas
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_caso_mdr(bigint, jsonb) TO authenticated;

COMMENT ON FUNCTION public.insert_caso_mdr(bigint, jsonb) IS
'Inserta un caso completo en MDR: primero el registro padre (madre) con ID generado por frontend,
luego los registros hijos apuntando al padre, y finalmente actualiza el padre si necesita FK a hijos.
Evita bloqueos por dependencias circulares de FK.';

-- ============================================================
-- INSERCIÓN DE CASO COMPLETO EN HRF (Huérfanos)
-- ============================================================
-- Estructura de huerfano:
--   - madre_id -> mdr.madre (opcional)
--   - acogida -> huerfano_acogida
--   - contexto_asesinato -> huerfano_contexto_asesinato
--   - salud_psico -> huerfano_salud_psico
--   - sociodemografico -> huerfano_sociodemografico
--   - huerfano_servicio_y_ayuda -> huerfano_servicio_ayuda

CREATE OR REPLACE FUNCTION public.insert_caso_hrf(
  p_madre_id bigint,  -- ID de la madre (puede ser NULL)
  p_datos_hijas jsonb  -- { "tabla1": {...}, "tabla2": {...}, ... }
)
RETURNS jsonb  -- Retorna { "huerfano_id": 123, "ids_hijas": {...} }
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  v_id_padre bigint;
  v_tabla_hija text;
  v_datos_hija jsonb;
  v_id_hija bigint;
  v_ids_hijas jsonb := '{}'::jsonb;
  v_fk_column text;
  v_result jsonb;
  -- Mapeo de tabla a columna FK en padre
  v_fk_map jsonb := '{
    "huerfano_acogida": "acogida",
    "huerfano_contexto_asesinato": "contexto_asesinato",
    "huerfano_salud_psico": "salud_psico",
    "huerfano_sociodemografico": "sociodemografico",
    "huerfano_servicio_ayuda": "huerfano_servicio_y_ayuda"
  }'::jsonb;
BEGIN
  -- Verificar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para insertar datos';
  END IF;

  -- PASO 1: Insertar registro PADRE con todas las FK a NULL (excepto madre_id)
  -- NO incluir 'id' en el INSERT para que se genere automáticamente (bigserial)
  INSERT INTO hrf.huerfano (madre_id)
  VALUES (p_madre_id)
  RETURNING id INTO v_id_padre;
  
  RAISE NOTICE 'Caso huerfano creado con ID: % (madre_id: %)', v_id_padre, p_madre_id;

  -- PASO 2: Insertar registros en tablas HIJAS
  -- Las tablas hijas DEBEN tener el mismo ID que el huerfano (no son auto-incrementales)
  FOR v_tabla_hija, v_datos_hija IN 
    SELECT key, value FROM jsonb_each(p_datos_hijas)
  LOOP
    -- Verificar que la tabla es válida
    IF NOT (v_fk_map ? v_tabla_hija) THEN
      RAISE WARNING 'Tabla % no reconocida como hija de huerfano, saltando...', v_tabla_hija;
      CONTINUE;
    END IF;
    
    -- CRÍTICO: Remover cualquier campo 'id' del JSON
    v_datos_hija := v_datos_hija - 'id';
    
    -- AGREGAR el ID del huerfano a los datos de la hija
    v_datos_hija := jsonb_set(v_datos_hija, '{id}', to_jsonb(v_id_padre));
    
    -- Insertar en la tabla hija con el MISMO ID que el huerfano
    EXECUTE format(
      'INSERT INTO hrf.%I SELECT * FROM jsonb_populate_record(null::hrf.%I, $1) RETURNING id',
      v_tabla_hija,
      v_tabla_hija
    ) USING v_datos_hija INTO v_id_hija;
    
    -- Guardar el ID de la hija (que es el mismo que el del huerfano)
    v_ids_hijas := jsonb_set(v_ids_hijas, array[v_tabla_hija], to_jsonb(v_id_hija));
    
    RAISE NOTICE 'Registro en % creado con ID: %', v_tabla_hija, v_id_hija;
  END LOOP;

  -- PASO 3: Actualizar registro PADRE con FK a las hijas
  FOR v_tabla_hija IN SELECT jsonb_object_keys(v_ids_hijas)
  LOOP
    -- Obtener nombre de columna FK en el padre
    v_fk_column := v_fk_map->>v_tabla_hija;
    v_id_hija := (v_ids_hijas->>v_tabla_hija)::bigint;
    
    -- Actualizar el padre
    EXECUTE format(
      'UPDATE hrf.huerfano SET %I = $1 WHERE id = $2',
      v_fk_column
    ) USING v_id_hija, v_id_padre;
    
    RAISE NOTICE 'Huerfano.% actualizado a %', v_fk_column, v_id_hija;
  END LOOP;

  -- Retornar resultado
  v_result := jsonb_build_object(
    'huerfano_id', v_id_padre,
    'madre_id', p_madre_id,
    'ids_hijas', v_ids_hijas
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_caso_hrf(bigint, jsonb) TO authenticated;

COMMENT ON FUNCTION public.insert_caso_hrf(bigint, jsonb) IS
'Inserta un caso completo en HRF: primero el registro padre (huerfano) con FK a NULL,
luego los registros hijos apuntando al padre, y finalmente actualiza el padre si necesita FK a hijos.
Evita bloqueos por dependencias circulares de FK.';

-- ============================================================
-- FUNCIÓN HELPER: Obtener tabla padre de un schema
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_tabla_padre(p_schema text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN p_schema = 'mdr' THEN 'madre'
    WHEN p_schema = 'hrf' THEN 'huerfano'
    ELSE NULL
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tabla_padre(text) TO authenticated, anon;

COMMENT ON FUNCTION public.get_tabla_padre(text) IS
'Retorna el nombre de la tabla padre para un schema dado (madre para mdr, huerfano para hrf).';

-- ============================================================
-- FUNCIÓN HELPER: Obtener tablas hijas de un schema
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_tablas_hijas(p_schema text)
RETURNS TABLE(table_name text, fk_column text)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  -- Tablas hijas específicas para MDR
  SELECT 'madre_contexto_asesinato'::text, 'contexto'::text
  WHERE p_schema = 'mdr'
  UNION ALL
  SELECT 'madre_sociodemo'::text, 'madre_sociodemografico'::text
  WHERE p_schema = 'mdr'
  UNION ALL
  SELECT 'agresor_sociodemo'::text, 'padre_sociodemografico'::text
  WHERE p_schema = 'mdr'
  UNION ALL
  SELECT 'madre_salud_psico'::text, 'psico_social'::text
  WHERE p_schema = 'mdr'
  UNION ALL
  SELECT 'madre_acogida'::text, 'acogida'::text
  WHERE p_schema = 'mdr'
  UNION ALL
  SELECT 'madre_acceso_servicios_ayudas'::text, 'servicios_ayudas'::text
  WHERE p_schema = 'mdr'
  
  -- Tablas hijas específicas para HRF
  UNION ALL
  SELECT 'huerfano_acogida'::text, 'acogida'::text
  WHERE p_schema = 'hrf'
  UNION ALL
  SELECT 'huerfano_contexto_asesinato'::text, 'contexto_asesinato'::text
  WHERE p_schema = 'hrf'
  UNION ALL
  SELECT 'huerfano_salud_psico'::text, 'salud_psico'::text
  WHERE p_schema = 'hrf'
  UNION ALL
  SELECT 'huerfano_sociodemografico'::text, 'sociodemografico'::text
  WHERE p_schema = 'hrf'
  UNION ALL
  SELECT 'huerfano_servicio_ayuda'::text, 'huerfano_servicio_y_ayuda'::text
  WHERE p_schema = 'hrf'
  
  ORDER BY 1;  -- Ordenar por la primera columna (table_name)
$$;

GRANT EXECUTE ON FUNCTION public.get_tablas_hijas(text) TO authenticated, anon;

COMMENT ON FUNCTION public.get_tablas_hijas(text) IS
'Retorna la lista de tablas hijas de un schema con el nombre de la columna FK correspondiente en la tabla padre.';

