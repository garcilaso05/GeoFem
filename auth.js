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
const registerForm = document.getElementById('register-form');
const logoutBtn = document.getElementById('logout-btn');
const messageContainer = document.getElementById('message-container');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');

// Función para mostrar mensajes
function showMessage(message, type = 'error') {
  messageContainer.innerHTML = `<div class="message ${type}">${message}</div>`;
  setTimeout(() => {
    messageContainer.innerHTML = '';
  }, 5000);
}

// Función para cambiar entre tabs
window.showTab = function(tab) {
  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
  }
  messageContainer.innerHTML = '';
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
  const content = document.getElementById('content');
  
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
function showUserApp(user, userEmail) {
  console.log('showUserApp llamada para:', userEmail);
  
  authView.classList.add('hidden');
  userView.classList.add('hidden');
  appView.classList.remove('hidden');
  
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
  
  const adminButtons = document.querySelectorAll('#app-nav .admin-only');
  adminButtons.forEach(btn => {
    btn.style.display = 'none';
  });
  
  setTimeout(() => {
    const firstButton = document.querySelector('#app-nav button:not(.admin-only)');
    if (firstButton) {
      console.log('Cargando módulo por defecto');
      firstButton.click();
    }
  }, 100);
  
  console.log('App de usuario mostrada correctamente');
}

// Función para mostrar la aplicación para administradores ADMIN
function showAdminApp(user, userEmail) {
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
    btn.style.display = 'inline-block';
  });
  
  setTimeout(() => {
    const firstButton = document.querySelector('#app-nav button');
    if (firstButton) {
      console.log('Cargando módulo por defecto para admin');
      firstButton.click();
    }
  }, 100);
  
  console.log('App de admin mostrada correctamente');
}

// Manejar registro
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-password-confirm').value;

  if (password !== confirmPassword) {
    showMessage('Las contraseñas no coinciden');
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const uid = user.uid;

    const batch = writeBatch(db);

    const userDocRef = doc(db, 'users', uid);
    batch.set(userDocRef, {
      _id: uid,
      email: user.email,
      createdAt: serverTimestamp()
    });

    const privDocRef = doc(db, 'users', uid, 'priv', 'data');
    batch.set(privDocRef, {
      role: 'USER'
    });

    await batch.commit();

    const logsRef = collection(db, 'users', uid, 'logs');
    await addDoc(logsRef, {
      registro_timestamp: serverTimestamp()
    });

    const favoritesRef = collection(db, 'users', uid, 'favorites');
    await addDoc(favoritesRef, {
      grafico1: null,
      grafico2: null,
      grafico3: null
    });

    showMessage('Registro exitoso. Bienvenido!', 'success');
    registerForm.reset();
    
  } catch (error) {
    console.error('Error en registro:', error);
    let errorMessage = 'Error al registrar usuario';
    
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'El email ya está registrado';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'La contraseña debe tener al menos 6 caracteres';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Email inválido';
    }
    
    showMessage(errorMessage);
  }
});

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
    await signOut(auth);
    showMessage('Sesión cerrada correctamente', 'success');
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
    showMessage('Error al cerrar sesión');
  }
});

// Manejar cierre de sesión desde la app
document.getElementById('app-logout-btn').addEventListener('click', async () => {
  try {
    console.log('Cerrando sesión...');
    
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
      const privDocRef = doc(db, 'users', user.uid, 'priv', 'data');
      const privDoc = await getDoc(privDocRef);
      
      if (privDoc.exists()) {
        const role = privDoc.data().role;
        console.log('Rol obtenido:', role);
        
        if (role === 'USER') {
          console.log('Mostrando app como USER');
          showUserApp(user, user.email);
        } else if (role === 'ADMIN') {
          if (window._supabaseAuthCreds) {
            console.log('Admin ya autenticado con Supabase, mostrando app');
            showAdminApp(user, user.email);
          } else {
            console.log('Mostrando formulario de auth Supabase para ADMIN');
            authView.classList.add('hidden');
            userView.classList.add('hidden');
            appView.classList.add('hidden');
            showSupabaseAuthForm();
          }
        } else {
          console.error('Rol no reconocido:', role);
          showMessage('Rol de usuario no válido');
          authStateProcessed = false;
          await signOut(auth);
        }
      } else {
        console.error('No se encontró información del usuario');
        showMessage('Error al cargar información del usuario');
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
    
    authView.classList.remove('hidden');
    userView.classList.add('hidden');
    appView.classList.add('hidden');
    
    window._supabaseAuthCreds = null;
    window._currentUserRole = null;
    window._supabaseInstance = null;
  }
});