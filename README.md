# GeoFem

Aplicación web para la gestión y análisis de datos sobre feminicidios y menores huérfanos en España, orientada a equipos técnicos e institucionales.

## Origen

Proyecto iniciado en la hackatón FemMap 2025, donde obtuvo el primer premio al "Mejor Proyecto". A raíz de este reconocimiento, el desarrollo continuó durante el periodo estival mediante una beca en la Universitat Rovira i Virgili (URV), con el objetivo de transformar el prototipo inicial en una herramienta operativa funcional a nivel estatal.

## Descripción

GeoFem es una aplicación Full-stack de gestión de bases de datos PostgreSQL alojadas en Supabase. Permite el registro, edición, consulta y análisis visual de casos de feminicidios y la situación de los menores huérfanos resultantes, con control de acceso granular por rol de usuario.

La aplicación está diseñada para entornos institucionales donde múltiples perfiles profesionales —jurídico, social, psicológico, entre otros— necesitan interactuar con datos sensibles bajo estrictas políticas de seguridad.

## Arquitectura

La aplicación es una Single-Page Application (SPA) construida con JavaScript nativo (ES Modules), sin frameworks de frontend. El backend de datos se gestiona a través de Supabase (PostgreSQL), y la autenticación y gestión de usuarios se delega a Firebase.

```
GeoFem/
├── index.html              # Punto de entrada. Gestiona las vistas de autenticación y aplicación.
├── auth.js                 # Lógica central de autenticación, roles y estado de sesión.
├── firebase-config.js      # Configuración e inicialización de Firebase.
├── estilos.css             # Estilos globales de la interfaz.
└── modulos/                # Módulos funcionales cargados dinámicamente.
    ├── inserciones.js/html         # Inserción de nuevos casos (madres / huérfanos).
    ├── editar_caso.js/html         # Edición de registros existentes.
    ├── buscar_caso.js/html         # Búsqueda avanzada y consulta de casos.
    ├── visualizar_datos.js/html    # Tabla paginada con exportación a CSV.
    ├── generar_graficos.js/html    # Generador de gráficos estadísticos (Chart.js).
    ├── geomapa.js/html             # Mapa de distribución por provincias (Leaflet).
    ├── editar_tabla.js/html        # Modificación de la estructura de tablas (admin).
    ├── crear_enumerado.js/html     # Creación y gestión de tipos ENUM en la base de datos.
    ├── admin_crear_usuario.js/html # Creación de usuarios con asignación de permisos por tabla.
    ├── roles.js                    # Lectura del rol de usuario desde Firestore.
    ├── accessInterceptor.js        # Aplicación de restricciones de acceso por tabla.
    ├── database-cache.js           # Caché de metadatos de la base de datos (tablas, columnas, enums).
    ├── seguridad.js                # Sanitización de identificadores SQL y utilidades de formato.
    └── menus.config.js             # Configuración de menús accesibles por rol.
└── sql/                    # Scripts SQL para configuración del servidor Supabase.
    ├── funciones_insercion_casos.sql   # Funciones RPC para inserción transaccional de casos.
    ├── funciones_actualizadas.sql      # Funciones de metadatos, RLS y operaciones de escritura.
    ├── configurar_permisos.sql         # Configuración de permisos por schema y tabla.
    ├── unificar_rls.sql                # Unificación de políticas Row Level Security.
    └── funciones_enums_public.sql      # Funciones para gestión de tipos enumerados.
```

## Base de datos

La base de datos PostgreSQL se estructura en dos esquemas independientes:

- **`mdr` (Madres):** Registros sobre las víctimas de feminicidio. Incluye datos sociodemográficos, contexto del asesinato, perfil del agresor, salud psicosocial, acogida y acceso a servicios.
- **`hrf` (Huérfanos):** Registros sobre los menores en situación de orfandad. Vinculados a los registros del esquema `mdr` mediante clave foránea.

Cada caso se compone de un registro raíz y múltiples registros en tablas hijas relacionadas. La inserción y actualización se realizan mediante funciones RPC (`insert_caso_mdr`, `insert_caso_hrf`) que garantizan la integridad transaccional y resuelven dependencias de clave foránea.

Las políticas Row Level Security (RLS) controlan el acceso a nivel de fila:

- `SELECT`: accesible para roles `anon` y `authenticated`.
- `INSERT` / `UPDATE`: restringido a usuarios `authenticated`.

## Autenticación y roles

La autenticación primaria se realiza con **Firebase Authentication** (email/contraseña). El rol y los permisos de cada usuario se almacenan en **Firebase Firestore**, en la ruta `/users/{uid}/priv/data`.

Se definen tres roles de usuario:

| Rol | Acceso |
|---|---|
| `ADMIN` | Acceso completo. Requiere doble autenticación (Firebase + Supabase). Puede crear usuarios, modificar la estructura de tablas y gestionar enumerados. |
| `COLABORADOR` | Acceso a visualización, búsqueda, gráficos, mapa, edición e inserción de casos. Los permisos de acceso por tabla son configurables individualmente desde el panel de administración. |
| `USER` | Acceso de solo lectura. Visualización, búsqueda, gráficos y mapa. Los módulos accesibles dependen de la configuración de permisos asignada por el administrador. |

Los permisos de acceso a tablas específicas se almacenan en `/users/{uid}/access/tables` y son aplicados en tiempo de ejecución por el módulo `accessInterceptor.js`.

## Funcionalidades principales

- **Inserción de casos:** Formulario dinámico generado a partir de los metadatos de la base de datos. Permite registrar un caso completo (registro raíz y tablas hijas) en una sola operación transaccional. Compatible con los esquemas `mdr` y `hrf`.
- **Edición de casos:** Búsqueda por identificador o filtros, con edición en línea de campos. Soporte para tipos de dato texto, numérico, fecha, booleano y ENUM. Los cambios se agrupan y se confirman en una única operación de escritura.
- **Búsqueda avanzada:** Filtrado por múltiples campos simultáneos con visualización expandible de los registros relacionados de cada caso.
- **Visualización de datos:** Tabla paginada con soporte para referencias entre tablas (claves foráneas) y exportación a CSV.
- **Generación de gráficos:** Selección interactiva de tabla y campo para generar gráficos de tipo circular, dona, barras o líneas mediante Chart.js. Permite guardar gráficos como favoritos persistentes en Firestore.
- **Geolocalización:** Mapa de España por provincias con distribución de casos. Visualización de marcadores proporcionales a la cantidad de registros y ranking de las cinco provincias con mayor incidencia.
- **Gestión de estructura (admin):** Creación y modificación de tablas. Creación y gestión de tipos ENUM directamente desde la interfaz.
- **Gestión de usuarios (admin):** Creación de cuentas con asignación de rol y permisos de acceso granulares por tabla. Disponible un sistema de presets de permisos por perfil profesional (jurídico, social, psicológico, etc.).
- **Caché de metadatos:** El módulo `database-cache.js` centraliza y cachea en sesión los metadatos de la base de datos (estructura de tablas, tipos de columnas, valores de enumerados), reduciendo las consultas repetidas al servidor.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Base de datos | PostgreSQL (Supabase) |
| Backend / API | Supabase (RPC, RLS, PostgREST) |
| Autenticación | Firebase Authentication |
| Gestión de usuarios y permisos | Firebase Firestore |
| Frontend | JavaScript (ES Modules), HTML5, CSS3 |
| Visualización de datos | Chart.js |
| Geolocalización | Leaflet.js |

## Requisitos de despliegue

La aplicación no requiere servidor de aplicaciones propio. Es una aplicación web estática que puede servirse desde cualquier servidor HTTP. Las dependencias externas (Firebase, Supabase, Chart.js, Leaflet) se cargan desde CDN.

Para el correcto funcionamiento es necesario:

1. Un proyecto activo en [Supabase](https://supabase.com) con los esquemas `mdr` y `hrf` configurados y los scripts SQL del directorio `sql/` ejecutados.
2. Un proyecto activo en [Firebase](https://firebase.google.com) con Authentication (email/contraseña) y Firestore habilitados.
3. Actualizar las credenciales de conexión en `firebase-config.js` y en la constante `SUPABASE_PUBLIC` de `auth.js`.

## Licencia

Consultar el archivo [LICENSE](LICENSE) para los términos de uso y distribución.
