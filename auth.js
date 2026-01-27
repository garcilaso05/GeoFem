import { auth, db } from './firebase-config.js';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  doc, 
  setDoc, 
  collection, 
  addDoc, 
  writeBatch, 
  serverTimestamp, 
  getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserRole } from './modulos/roles.js';
import { MENUS } from './modulos/menus.config.js';

// In-memory session access permissions (not persisted)
window.sessionAccess = window.sessionAccess || null;

// Manejo de mensajes desde ventanas emergentes (colaborador)
window._collaboratorEditing = false;
window.addEventListener('message', (evt) => {
  try {
    const data = evt.data || {};
    if (data.type === 'collab-auth-success') {
      console.log('Mensaje recibido: collab-auth-success', data);
      // Marcar que el colaborador entró en modo editor
      window._collaboratorEditing = true;
      // Actualizar la navegación para mostrar solo lo permitido
      updateNavForCurrentRole();
      // Ocultar el botón de "Entrar como Colaborador" una vez que está en modo editor
      try {
        const btn = document.getElementById('enter-collab-btn');
        if (btn) btn.style.display = 'none';
      } catch (e) {
        /* no-op */
      }
    }
  } catch (err) {
    console.error('Error manejando message event:', err);
  }
});

/**
 * Actualizar navegación según rol y modo editor colaborador
 * - Para ADMIN: dejar todo como está (admin-only mostrados)
 * - Para USER: ocultar admin-only
 * - Para COLABORADOR en modo lector: se comporta como USER
 * - Para COLABORADOR en modo editor (window._collaboratorEditing === true):
 *   mostrar solo los módulos exactos definidos en MENUS.COLABORADOR
 */
function updateNavForCurrentRole() {
  const role = window._currentUserRole;
  const navButtons = document.querySelectorAll('#app-nav button');

  // ADMIN: mostrar todo (respeta .admin-only)
  if (role === 'ADMIN') {
    navButtons.forEach(btn => { btn.style.display = ''; });
    return;
  }

  // Si colaborador en modo editor -> mostrar solo los módulos listados
  if (role === 'COLABORADOR' && window._collaboratorEditing === true) {
    const allowed = new Set(MENUS.COLABORADOR || []);
    navButtons.forEach(btn => {
      const onclick = btn.getAttribute('onclick') || '';
      const match = onclick.match(/loadModule\('([^']+)'\)/);
      if (match) {
        const moduleName = match[1];
        if (allowed.has(moduleName)) {
          btn.style.display = '';
        } else {
          btn.style.display = 'none';
        }
      } else {
        // Buttons without loadModule (logout, etc.) keep visible
        // But ensure admin-only are hidden
        if (btn.classList.contains('admin-only')) btn.style.display = 'none';
      }
    });
    return;
  }

  // Default: USER or COLABORADOR in reader mode -> hide admin-only buttons
  navButtons.forEach(btn => {
    if (btn.classList.contains('admin-only')) {
      btn.style.display = 'none';
    } else {
      btn.style.display = '';
    }
  });
}

// Credenciales de Supabase
const SUPABASE_PUBLIC = {
  url: 'https://rroritvsvpabpkjtiskq.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyb3JpdHZzdnBhYnBranRpc2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDg2MDgsImV4cCI6MjA3NzMyNDYwOH0.kkK1B5kjo1NLHwvU_Tpu4jqtO1k5ctokuoWzSpZGeDI'
};

// Variables globales
window._supabaseAuthCreds = null;
window._currentUserRole = null;
window._currentSchema = 'mdr'; // Schema por defecto: Madres
let authStateProcessed = false;

// Función para obtener credenciales de Supabase según el nivel de acceso
window.getSupabaseCreds = function() {
  // Siempre devolvemos las credenciales públicas
  // La autenticación se maneja a través de la instancia global
  return SUPABASE_PUBLIC;
};

// Elementos del DOM
const authView = document.getElementById('auth-view');
const userView = document.getElementById('user-view');
const appView = document.getElementById('app-view');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const messageContainer = document.getElementById('message-container');
const tabLogin = document.getElementById('tab-login');

// Función para mostrar mensajes
function showMessage(message, type = 'error') {
  messageContainer.innerHTML = `<div class="message ${type}">${message}</div>`;
  setTimeout(() => {
    messageContainer.innerHTML = '';
  }, 5000);
}

// Función para cambiar entre tabs
window.showTab = function(tab) {
  // Si no existe la UI de registro (la hemos movido a otro módulo), solo mostramos el login.
  if (tab === 'login') {
    if (loginForm) loginForm.classList.remove('hidden');
    if (tabLogin) tabLogin.classList.add('active');
  } else {
    // Intento de mostrar registro: si existe el formulario, mostrarlo; si no, fallback a login
    const maybeRegister = document.getElementById('register-form');
    if (maybeRegister) {
      if (loginForm) loginForm.classList.add('hidden');
      maybeRegister.classList.remove('hidden');
      if (tabLogin) tabLogin.classList.remove('active');
    } else {
      // No hay registro en esta vista, quedarse en login
      if (loginForm) loginForm.classList.remove('hidden');
      if (tabLogin) tabLogin.classList.add('active');
    }
  }
  if (messageContainer) messageContainer.innerHTML = '';
};

// Función para cargar módulos
window.loadModule = async function(moduleName) {
  const container = document.getElementById('module-container');
  const buttons = document.querySelectorAll('#app-nav button');
  
  buttons.forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  
  try {
    // NO limpiar la instancia si está autenticada (ADMIN)
    // Solo limpiarla si no hay credenciales autenticadas
    if (!window._supabaseAuthCreds || !window._supabaseAuthCreds.authenticated) {
      window._supabaseInstance = null;
    }
    
    window.dispatchEvent(new CustomEvent('easySQL:moduleChange', { detail: { module: moduleName } }));
    
    const htmlResponse = await fetch(`modulos/${moduleName}.html`);
    if (!htmlResponse.ok) throw new Error('No se pudo cargar el módulo HTML');
    const htmlContent = await htmlResponse.text();
    container.innerHTML = htmlContent;
    
    await import(`./modulos/${moduleName}.js?t=${Date.now()}`);
    
  } catch (error) {
    console.error('Error cargando módulo:', error);
    container.innerHTML = `<div class="error-message">Error cargando el módulo: ${error.message}</div>`;
  }
};

// Función para mostrar formulario de autenticación de Supabase para ADMIN
function showSupabaseAuthForm() {
  // Usar auth-content en lugar de content
  const content = document.getElementById('auth-content');
  
  if (!content) {
    console.error('No se encontró el elemento auth-content');
    return;
  }
  
  content.innerHTML = `
    <h2>Autenticación de Administrador</h2>
    <p>Para acceder como administrador con permisos completos, ingresa tus credenciales de Supabase:</p>
    
    <div id="supabase-message-container"></div>
    
    <form id="supabase-auth-form">
      <div class="form-group">
        <label for="supabase-email">Email de Supabase</label>
        <input type="email" id="supabase-email" required placeholder="Email registrado en Supabase">
      </div>
      <div class="form-group">
        <label for="supabase-password">Contraseña de Supabase</label>
        <input type="password" id="supabase-password" required placeholder="Contraseña de Supabase">
      </div>
      <button type="submit">Autenticar como Administrador</button>
      <button type="button" class="secondary" id="cancel-admin-btn">Acceder como Usuario</button>
    </form>
    <p style="font-size: 12px; color: #666; margin-top: 15px;">
      <strong>Nota:</strong> Estas son las credenciales de tu cuenta de Supabase (PostgreSQL), 
      no las de Firebase. Si no tienes acceso de administrador, puedes acceder como usuario con funciones limitadas.
    </p>
  `;
  
  document.getElementById('supabase-auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await authenticateSupabase();
  });
  
  document.getElementById('cancel-admin-btn').addEventListener('click', () => {
    // Marcar que el admin ha decidido acceder como usuario para evitar aplicar restricciones
    window._adminAccessAsUser = true;
    const user = auth.currentUser;
    if (user) {
      showUserApp(user, user.email);
    }
  });
}

// Función para mostrar mensajes en el formulario de Supabase
function showSupabaseMessage(message, type = 'error') {
  const container = document.getElementById('supabase-message-container');
  if (container) {
    container.innerHTML = `<div class="message ${type}">${message}</div>`;
    setTimeout(() => {
      container.innerHTML = '';
    }, 5000);
  }
}

// Función para autenticar con Supabase
async function authenticateSupabase() {
  const email = document.getElementById('supabase-email').value;
  const password = document.getElementById('supabase-password').value;
  
  try {
    // Limpiar caché al iniciar sesión
    console.log('🧹 Limpiando caché antes de iniciar sesión...');
    sessionStorage.clear();
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js");
    
    // 1. Crear cliente con ANON KEY (no con el token de acceso)
    const supabase = createClient(SUPABASE_PUBLIC.url, SUPABASE_PUBLIC.key);
    
    // 2. Autenticar - Supabase guarda el JWT automáticamente en localStorage
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) {
      throw new Error('Email o contraseña incorrectos: ' + error.message);
    }
    
    if (!data.session) {
      throw new Error('No se pudo establecer la sesión');
    }
    
    // 3. Guardar la instancia autenticada globalmente
    // Esta instancia ya tiene el JWT adjunto automáticamente
    window._supabaseInstance = supabase;
    
    // 4. Marcar que las credenciales están autenticadas (para distinguir de USER)
    window._supabaseAuthCreds = {
      url: SUPABASE_PUBLIC.url,
      key: SUPABASE_PUBLIC.key, // Seguimos usando ANON KEY
      authenticated: true,
      userEmail: email
    };
    
    showSupabaseMessage('Autenticación exitosa', 'success');
    
    setTimeout(() => {
      showAdminApp(auth.currentUser, auth.currentUser.email);
    }, 1000);
    
  } catch (error) {
    console.error('Error autenticando con Supabase:', error);
    showSupabaseMessage('Error: ' + error.message);
  }
}

// Función para cambiar el esquema
window.changeSchema = function(schema) {
  console.log('Cambiando esquema a:', schema);
  window._currentSchema = schema;
  
  // Disparar evento de cambio de esquema
  window.dispatchEvent(new CustomEvent('schema:change', { detail: { schema } }));
  
  // Recargar el módulo actual
  const activeButton = document.querySelector('#app-nav button.active');
  if (activeButton) {
    activeButton.click();
  }
};

// Función para obtener el esquema actual
window.getCurrentSchema = function() {
  return window._currentSchema || 'mdr';
};

// Función para mostrar la aplicación para usuarios USER
// isCollaboratorAvailable: true si el usuario tiene role === 'COLABORADOR' (modo lector)
async function showUserApp(user, userEmail, isCollaboratorAvailable = false) {
  console.log('showUserApp llamada para:', userEmail);

  authView.classList.add('hidden');
  userView.classList.add('hidden');
  appView.classList.remove('hidden');

  // En modo lector (USER o COLABORADOR lector) se marca rol USER en la UI
  window._currentUserRole = 'USER';

  const emailElement = document.getElementById('app-user-email');
  if (emailElement) {
    emailElement.textContent = userEmail;
  }

  // Inicializar el selector de esquema
  const schemaSelector = document.getElementById('schema-selector');
  if (schemaSelector) {
    schemaSelector.value = window._currentSchema;
  }

  // Ocultar botones admin por defecto (USER behavior)
  const adminButtons = document.querySelectorAll('#app-nav .admin-only');
  adminButtons.forEach(btn => {
    btn.style.display = 'none';
  });

  // Inicializar caché de base de datos
  console.log('🚀 Inicializando caché de base de datos...');
  try {
    const { initializeDatabaseCache } = await import('./modulos/database-cache.js');
    await initializeDatabaseCache();
    console.log('✅ Caché inicializada correctamente');
  } catch (error) {
    console.error('❌ Error inicializando caché:', error);
  }

  // Aplicar restricciones de acceso según permisos (solo para NON-ADMIN)
  try {
    const { applyAccessRestrictions } = await import('./modulos/accessInterceptor.js');
    await applyAccessRestrictions(user);
  } catch (err) {
    console.error('Error aplicando restricciones de acceso:', err);
  }

  // Si el usuario es COLABORADOR, mostrar botón que abre ventana para entrar como editor
  try {
    if (isCollaboratorAvailable) {
      let btn = document.getElementById('enter-collab-btn');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'enter-collab-btn';
        btn.textContent = 'Entrar como Colaborador';
        // Use the new nav-collab class so it matches sidebar buttons and has vivid color
        btn.className = 'nav-collab';
        // No extra margin; align with other buttons
        btn.style.margin = '0';
        btn.addEventListener('click', () => {
          window.open('modulos/collab_login.html', 'collab_login', 'width=420,height=540');
        });
        const nav = document.getElementById('app-nav');
        const logoutButton = document.getElementById('app-logout-btn');
        if (nav) {
          // Insert the button immediately before the logout button so it appears above it
          if (logoutButton) nav.insertBefore(btn, logoutButton);
          else nav.appendChild(btn);
        }
      } else {
        btn.style.display = '';
      }
    } else {
      const existing = document.getElementById('enter-collab-btn');
      if (existing) existing.style.display = 'none';
    }
  } catch (err) {
    console.error('Error mostrando botón colaborador:', err);
  }

  setTimeout(() => {
    const firstButton = document.querySelector('#app-nav button:not(.admin-only)');
    if (firstButton) {
      console.log('Cargando módulo por defecto');
      firstButton.click();
    }
  }, 100);

  // Asegurar que la navegación refleja si el colaborador entró en modo editor
  updateNavForCurrentRole();

  console.log('App de usuario mostrada correctamente');
}

// Función para mostrar la aplicación para administradores ADMIN
async function showAdminApp(user, userEmail) {
  console.log('showAdminApp llamada para:', userEmail);
  
  authView.classList.add('hidden');
  userView.classList.add('hidden');
  appView.classList.remove('hidden');
  
  window._currentUserRole = 'ADMIN';
  
  const emailElement = document.getElementById('app-user-email');
  if (emailElement) {
    emailElement.textContent = userEmail + ' (Admin)';
  }
  
  // Inicializar el selector de esquema
  const schemaSelector = document.getElementById('schema-selector');
  if (schemaSelector) {
    schemaSelector.value = window._currentSchema;
  }
  
  const adminButtons = document.querySelectorAll('#app-nav .admin-only');
  adminButtons.forEach(btn => {
    btn.style.display = 'flex';
  });
  
  // Inicializar caché de base de datos
  console.log('🚀 Inicializando caché de base de datos...');
  try {
    const { initializeDatabaseCache } = await import('./modulos/database-cache.js');
    await initializeDatabaseCache();
    console.log('✅ Caché inicializada correctamente');
  } catch (error) {
    console.error('❌ Error inicializando caché:', error);
  }
  
  setTimeout(() => {
    const firstButton = document.querySelector('#app-nav button');
    if (firstButton) {
      console.log('Cargando módulo por defecto para admin');
      firstButton.click();
    }
  }, 100);
  
  console.log('App de admin mostrada correctamente');
}

// La lógica de registro se ha movido a `modulos/registro.html` + `modulos/registro.js`.
// Si necesitas volver a exponer el formulario en la vista de autenticación, importa o
// inserta el módulo correspondiente donde haga falta.

// Manejar inicio de sesión
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showMessage('Inicio de sesión exitoso', 'success');
    loginForm.reset();
  } catch (error) {
    console.error('Error en login:', error);
    let errorMessage = 'Error al iniciar sesión';
    
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
      errorMessage = 'Email o contraseña incorrectos';
    } else if (error.code === 'auth/user-not-found') {
      errorMessage = 'Usuario no encontrado';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Email inválido';
    }
    
    showMessage(errorMessage);
  }
});

// Manejar cierre de sesión
logoutBtn.addEventListener('click', async () => {
  try {
    authStateProcessed = false;
    
    // Limpiar sessionStorage antes de cerrar sesión
    console.log('🧹 Limpiando caché de sessionStorage...');
    sessionStorage.clear();
    // Reset admin-as-user flag
    window._adminAccessAsUser = false;
    
    await signOut(auth);
    showMessage('Sesión cerrada correctamente', 'success');
    
    // Recargar página para limpiar estado
    setTimeout(() => {
      location.reload();
    }, 500);
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
    showMessage('Error al cerrar sesión');
  }
});

// Manejar cierre de sesión desde la app
document.getElementById('app-logout-btn').addEventListener('click', async () => {
  try {
    console.log('Cerrando sesión...');
    
    // Limpiar caché de base de datos
    if (window.dbCache) {
      window.dbCache.clearCache();
    }
    
    // Limpiar sessionStorage
    console.log('🧹 Limpiando caché de sessionStorage...');
    sessionStorage.clear();
  // Reset admin-as-user flag
  window._adminAccessAsUser = false;
    
    // Si hay una sesión de Supabase activa, cerrarla
    if (window._supabaseInstance && window._supabaseAuthCreds?.authenticated) {
      await window._supabaseInstance.auth.signOut();
      console.log('Sesión de Supabase cerrada');
    }
    
    authStateProcessed = false;
    window._supabaseAuthCreds = null;
    window._currentUserRole = null;
    window._supabaseInstance = null;
    
    appView.classList.add('hidden');
    
    await signOut(auth);
    
    console.log('Sesión cerrada correctamente');
    
    // Recargar página para limpiar estado completamente
    setTimeout(() => {
      location.reload();
    }, 500);
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
    alert('Error al cerrar sesión: ' + error.message);
  }
});

// Observador del estado de autenticación
onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (authStateProcessed && window._currentUserRole) {
      console.log('Auth state ya procesado, ignorando...');
      return;
    }
    
    console.log('Usuario autenticado:', user.email);
    authStateProcessed = true;
    
    try {
      // Delegar lectura de rol a modulos/roles.js
      const role = await getUserRole(user.uid);
      console.log('Rol obtenido:', role);

      if (role === 'USER') {
        console.log('Mostrando app como USER');
        await showUserApp(user, user.email, false);
      } else if (role === 'COLABORADOR') {
        console.log('Mostrando app como COLABORADOR (modo lector)');
        // Mostrar la app en modo lector, pero habilitar el botón para entrar como editor
        await showUserApp(user, user.email, true);
        // Dejar window._currentUserRole como 'USER' (lector) until enters editor mode
        window._currentUserRole = 'COLABORADOR';
      } else if (role === 'ADMIN') {
        if (window._supabaseAuthCreds) {
          console.log('Admin ya autenticado con Supabase, mostrando app');
          showAdminApp(user, user.email);
        } else {
          console.log('Mostrando formulario de auth Supabase para ADMIN');
          // Mostrar la vista de auth y ocultar las demás
          authView.classList.remove('hidden');
          userView.classList.add('hidden');
          appView.classList.add('hidden');
          // Mostrar el formulario de Supabase
          showSupabaseAuthForm();
        }
      } else {
        console.error('Rol no reconocido:', role);
        showMessage('Rol de usuario no válido');
        authStateProcessed = false;
        await signOut(auth);
      }
    } catch (error) {
      console.error('Error al obtener rol:', error);
      showMessage('Error al verificar permisos');
      authStateProcessed = false;
      await signOut(auth);
    }
  } else {
    console.log('Usuario no autenticado, mostrando login');
    authStateProcessed = false;
    
    // Limpiar caché cuando no hay usuario autenticado
    console.log('🧹 Limpiando caché (sin usuario autenticado)...');
    sessionStorage.clear();
    
    authView.classList.remove('hidden');
    userView.classList.add('hidden');
    appView.classList.add('hidden');
    
    window._supabaseAuthCreds = null;
    window._currentUserRole = null;
    window._supabaseInstance = null;
  }
});