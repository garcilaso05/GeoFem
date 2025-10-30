# Cambios en el Sistema de Autenticación

## Resumen de Cambios

Se ha implementado un nuevo flujo de registro e inicio de sesión con dos niveles de acceso: **USER** y **ADMIN** (colaborador).

---

## 1. REGISTRO

### Formulario de Registro
- **Nombre Completo**: Campo obligatorio
- **Email**: Validación de formato correcto
- **Confirmar Email**: Debe coincidir con el email ingresado
- **Contraseña**: Mínimo 8 caracteres, debe incluir:
  - Mayúsculas
  - Minúsculas
  - Números

### Flujo de Registro
1. El usuario completa el formulario con validaciones
2. Se crea la cuenta en Firebase Auth
3. Se guarda en Firebase Firestore:
   - Colección `users`:
     - `_id`: UID del usuario
     - `email`: Email del usuario
     - `nombreCompleto`: Nombre completo
     - `rol`: "USER" (por defecto)
     - `createdAt`: Timestamp
   - Subcolección `logs`: Log de registro
   - Subcolección `favorites`: Gráficos favoritos
4. El usuario accede automáticamente con nivel USER

---

## 2. INICIO DE SESIÓN

### Flujo para Usuarios (USER)
1. Ingresa email y contraseña
2. Se autentica con Firebase Auth
3. Se obtienen sus datos de Firebase Firestore (rol, nombre, favoritos)
4. **Acceso directo** sin pedir contraseña adicional
5. Menú disponible:
   - Visualizar Datos
   - Generar Gráficos

### Flujo para Administradores (ADMIN)
1. Ingresa email y contraseña
2. Se autentica con Firebase Auth
3. Se detecta que es colaborador
4. Se muestra opción:
   - **Acceder como Usuario**: Menú limitado (USER)
   - **Acceder como Colaborador**: Pide contraseña de Supabase

### Si elige Colaborador:
1. Se pide contraseña de Supabase
2. Se permiten **2 intentos**
3. Si la contraseña es correcta:
   - Conexión exitosa a Supabase
   - Menú completo de colaborador:
     - Crear Enumerado
     - Crear Tabla
     - Editar Tabla
     - Inserciones
     - Visualizar Datos
     - Generar Gráficos
     - Subir Archivo
4. Si falla después de 2 intentos:
   - Acceso automático como usuario (menú limitado)

---

## 3. ESTRUCTURA DE DATOS

### Firebase Firestore - Colección `users`
```javascript
{
  _id: "uid-del-usuario",
  email: "usuario@ejemplo.com",
  nombreCompleto: "Juan Pérez",
  rol: "USER" | "ADMIN",
  createdAt: timestamp
}
```

### Subcolecciones
- `users/{uid}/logs`: Registros de actividad
- `users/{uid}/favorites`: Gráficos favoritos

---

## 4. NIVELES DE ACCESO

### USER (Usuario Regular)
- **Autenticación**: Solo Firebase Auth
- **Módulos disponibles**:
  - Visualizar Datos
  - Generar Gráficos
- **Sin acceso a**: Creación/edición de tablas, enumerados, inserciones

### ADMIN (Colaborador)
- **Autenticación**: Firebase Auth + Supabase (opcional)
- **Opción de acceso**:
  - Como Usuario: Menú limitado
  - Como Colaborador: Menú completo (requiere contraseña Supabase)
- **Módulos disponibles (como colaborador)**:
  - Todos los módulos disponibles
  - Acceso completo a la base de datos

---

## 5. VALIDACIONES IMPLEMENTADAS

### Registro
- ✅ Nombre completo obligatorio
- ✅ Email con formato válido
- ✅ Confirmación de email
- ✅ Contraseña segura (8+ caracteres, mayúsculas, minúsculas, números)

### Inicio de Sesión
- ✅ Autenticación con Firebase Auth
- ✅ Carga de datos de usuario desde Firestore
- ✅ Detección automática de rol
- ✅ 2 intentos para contraseña de Supabase (colaboradores)
- ✅ Fallback a usuario si falla autenticación de colaborador

---

## 6. CAMBIOS EN ARCHIVOS

### `index.html`
- Actualizado formulario de registro con campos adicionales
- Eliminado campo "Confirmar Contraseña"

### `auth.js`
- Nuevas funciones de validación: `validarEmail()`, `validarContrasena()`
- Registro mejorado con validaciones
- Variable global `currentUserData` para almacenar datos del usuario
- Flujo de inicio de sesión con detección de rol
- Funciones nuevas:
  - `mostrarOpcionColaborador()`: Opciones para admin
  - `mostrarFormularioColaborador()`: Form de contraseña Supabase
  - `loginColaborador()`: Login con 2 intentos
  - `mostrarMenuUsuario()`: Menú limitado
  - `mostrarMenuColaborador()`: Menú completo
  - `mostrarMenu()`: Función genérica para renderizar menús

---

## 7. NOTAS IMPORTANTES

- **Para cambiar un usuario de USER a ADMIN**: Editar manualmente en Firebase Firestore el campo `rol` de "USER" a "ADMIN"
- **Los usuarios ADMIN siempre pueden acceder como usuarios** sin necesidad de contraseña de Supabase
- **La contraseña de Supabase puede ser diferente** a la contraseña de Firebase Auth
- **Seguridad**: Las funciones de PostgreSQL ya están configuradas para permitir acceso según autenticación (anon vs auth)

---

## 8. PRÓXIMOS PASOS RECOMENDADOS

1. Probar el flujo completo de registro
2. Probar inicio de sesión como USER
3. Cambiar manualmente un usuario a ADMIN en Firestore
4. Probar flujo de colaborador con contraseña correcta e incorrecta
5. Verificar que los módulos se muestren correctamente según el rol
