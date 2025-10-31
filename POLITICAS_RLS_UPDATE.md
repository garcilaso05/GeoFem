# Políticas RLS para Operaciones UPDATE

## Introducción

Para que el módulo **"Editar Caso"** funcione correctamente, necesitamos habilitar políticas de Row Level Security (RLS) que permitan operaciones **UPDATE** a usuarios autenticados.

## Estado Actual

Actualmente, las tablas tienen RLS habilitado pero solo con políticas de **SELECT** (lectura). Necesitamos agregar políticas de **UPDATE** para cada tabla.

## Políticas Requeridas

### Estrategia de Seguridad

Las políticas UPDATE deben:
1. ✅ Verificar que el usuario esté autenticado (`auth.uid() IS NOT NULL`)
2. ✅ Permitir actualizar cualquier fila (ya que los admins deben poder editar todos los casos)
3. ❌ NO permitir modificar el campo `id` (esto se valida en la función)

### Sintaxis General

```sql
-- Para cada tabla en schema MDR
CREATE POLICY "allow_authenticated_update" ON mdr.<nombre_tabla>
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Para cada tabla en schema HRF
CREATE POLICY "allow_authenticated_update" ON hrf.<nombre_tabla>
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
```

## Script SQL Completo

### Para Schema MDR (Madres)

```sql
-- Habilitar RLS en todas las tablas si no está habilitado
ALTER TABLE mdr.madre ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdr.madre_sociodemo ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdr.agresor_sociodemo ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdr.madre_contexto_asesinato ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdr.madre_salud_psico ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdr.madre_acceso_servicios_ayudas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdr.madre_acogida ENABLE ROW LEVEL SECURITY;

-- Políticas UPDATE para cada tabla
CREATE POLICY "allow_authenticated_update" ON mdr.madre
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "allow_authenticated_update" ON mdr.madre_sociodemo
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "allow_authenticated_update" ON mdr.agresor_sociodemo
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "allow_authenticated_update" ON mdr.madre_contexto_asesinato
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "allow_authenticated_update" ON mdr.madre_salud_psico
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "allow_authenticated_update" ON mdr.madre_acceso_servicios_ayudas
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "allow_authenticated_update" ON mdr.madre_acogida
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
```

### Para Schema HRF (Huérfanos)

```sql
-- Habilitar RLS en todas las tablas si no está habilitado
ALTER TABLE hrf.huerfano ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrf.huerfano_sociodemo ENABLE ROW LEVEL SECURITY;
-- ... (agregar todas las tablas de HRF)

-- Políticas UPDATE para cada tabla
CREATE POLICY "allow_authenticated_update" ON hrf.huerfano
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "allow_authenticated_update" ON hrf.huerfano_sociodemo
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- ... (repetir para todas las tablas de HRF)
```

## Script Dinámico para Aplicar a Todas las Tablas

Si tienes muchas tablas, puedes usar este script para generar las políticas automáticamente:

### Para MDR:

```sql
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'mdr'
  LOOP
    -- Habilitar RLS
    EXECUTE format('ALTER TABLE mdr.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    
    -- Eliminar política si existe (para re-crearla)
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS allow_authenticated_update ON mdr.%I', r.tablename);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Ignorar errores
    END;
    
    -- Crear política UPDATE
    EXECUTE format('
      CREATE POLICY allow_authenticated_update ON mdr.%I
      FOR UPDATE TO authenticated
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL)
    ', r.tablename);
    
    RAISE NOTICE 'Política UPDATE creada para tabla: mdr.%', r.tablename;
  END LOOP;
END $$;
```

### Para HRF:

```sql
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'hrf'
  LOOP
    -- Habilitar RLS
    EXECUTE format('ALTER TABLE hrf.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    
    -- Eliminar política si existe (para re-crearla)
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS allow_authenticated_update ON hrf.%I', r.tablename);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Ignorar errores
    END;
    
    -- Crear política UPDATE
    EXECUTE format('
      CREATE POLICY allow_authenticated_update ON hrf.%I
      FOR UPDATE TO authenticated
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL)
    ', r.tablename);
    
    RAISE NOTICE 'Política UPDATE creada para tabla: hrf.%', r.tablename;
  END LOOP;
END $$;
```

## Verificación

Para verificar que las políticas se crearon correctamente:

```sql
-- Ver políticas de una tabla específica
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname IN ('mdr', 'hrf')
  AND cmd = 'UPDATE'
ORDER BY schemaname, tablename;
```

Deberías ver políticas llamadas `allow_authenticated_update` para cada tabla.

## Instrucciones de Despliegue

### Paso 1: Ejecutar Funciones UPDATE

En Supabase SQL Editor, ejecuta:
```sql
-- Contenido de sql/funciones_update.sql
```

### Paso 2: Aplicar Políticas RLS

Ejecuta los scripts dinámicos de arriba, o crea las políticas manualmente para cada tabla.

### Paso 3: Verificar

```sql
-- Verificar funciones
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE '%update_row%';

-- Verificar políticas
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname IN ('mdr', 'hrf') 
  AND cmd = 'UPDATE';
```

## Seguridad Adicional

### Limitación por Rol (Opcional)

Si quieres que SOLO administradores puedan actualizar, puedes modificar las políticas:

```sql
-- Ejemplo: Solo permitir UPDATE a usuarios con rol ADMIN
CREATE POLICY "allow_admin_update" ON mdr.madre_sociodemo
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'ADMIN'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'ADMIN'
  )
);
```

Pero esto requiere que tengas una tabla `user_roles` (que actualmente no tienes porque eliminamos `profiles`).

### Auditoría (Opcional)

Para auditar cambios, puedes crear triggers que registren quién modificó qué:

```sql
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  tabla TEXT,
  row_id INTEGER,
  campo TEXT,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

## Resumen

1. ✅ **Funciones SQL creadas**: `mdr_update_row`, `hrf_update_row`
2. ⏳ **Políticas RLS pendientes**: Ejecutar scripts para habilitar UPDATE
3. ✅ **Frontend listo**: Módulo "Editar Caso" implementado
4. ⏳ **Testing**: Probar actualización después de aplicar RLS

## Notas Importantes

- Las políticas solo afectan a usuarios que acceden vía Supabase client
- Las funciones SECURITY DEFINER bypasean RLS durante su ejecución
- Por eso la validación de autenticación está en la función misma
- RLS es una capa adicional de seguridad pero no es estrictamente necesaria si las funciones validan correctamente
