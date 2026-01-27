import { auth, db } from '../firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, collection, addDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { formatDisplayName } from './seguridad.js';

function showMessage(msg, type = 'error') {
  const c = document.getElementById('admin-create-message');
  if (!c) return;
  c.innerHTML = `<div class="message ${type}">${msg}</div>`;
  setTimeout(() => { c.innerHTML = ''; }, 5000);
}

async function ensureDbCacheReady(timeout = 10000) {
  if (window.dbCache && window.dbCache.isCacheReady && window.dbCache.isCacheReady()) return true;
  if (window.dbCache && window.dbCache.waitForCache) {
    return await window.dbCache.waitForCache(timeout);
  }
  // No existe dbCache: return false
  return false;
}

function renderTableCheckboxes(tables) {
  const container = document.getElementById('tables-checkboxes');
  if (!container) return;
  container.innerHTML = '';

  if (!tables || tables.length === 0) {
    container.innerHTML = '<div>No hay tablas disponibles</div>';
    return;
  }

  // Orden alfabético
  tables.sort();

  tables.forEach(tbl => {
    const id = `perm_${tbl}`;
    const wrapper = document.createElement('div');
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.name = tbl; // usar el nombre de tabla como key

    // Usar nombre legible para mostrar
    let display = tbl;
    try {
      display = formatDisplayName(tbl) || tbl;
    } catch (err) {
      console.warn('formatDisplayName fallo para', tbl, err);
    }

    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + display));
    wrapper.appendChild(label);
    container.appendChild(wrapper);
  });
}

async function loadAndRenderTables() {
  const ok = await ensureDbCacheReady(10000);
  const container = document.getElementById('tables-checkboxes');
  if (!container) return;

  if (!ok) {
    container.innerHTML = '<div>No se pudo cargar la lista de tablas (cache no disponible)</div>';
    return;
  }

  // Obtener tablas de ambos schemas
  try {
    const mdr = window.dbCache.getTables('mdr') || [];
    const hrf = window.dbCache.getTables('hrf') || [];
    const all = Array.from(new Set([...mdr, ...hrf]));
    renderTableCheckboxes(all);
  } catch (err) {
    console.error('Error obteniendo tablas desde dbCache:', err);
    container.innerHTML = '<div>Error cargando tablas</div>';
  }
}

// Handler del formulario: reproduce exactamente la lógica de alta existente en auth.js
const form = document.getElementById('admin-create-form');
if (form) {
  // Cargar tablas cuando el módulo se inicialice
  loadAndRenderTables();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('admin-register-email').value;
    const password = document.getElementById('admin-register-password').value;
    const confirmPassword = document.getElementById('admin-register-password-confirm').value;

    if (password !== confirmPassword) {
      showMessage('Las contraseñas no coinciden');
      return;
    }

    try {
      // 1) Crear usuario en Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const uid = user.uid;

      // 2) Preparar batch: crear /users/{uid} y /users/{uid}/priv/data
      const batch = writeBatch(db);

      const userDocRef = doc(db, 'users', uid);
      batch.set(userDocRef, {
        _id: uid,
        email: user.email,
        createdAt: serverTimestamp()
      });

      const privDocRef = doc(db, 'users', uid, 'priv', 'data');
      // Role determined at creation time: if insercionesPermitidas === true -> COLABORADOR
      const insercionesCb = document.getElementById('insercionesPermitidas');
      const insercionesValue = !!(insercionesCb && insercionesCb.checked);
      const assignedRole = insercionesValue ? 'COLABORADOR' : 'USER';
      batch.set(privDocRef, {
        role: assignedRole
      });

      // 3) Preparar documento de access/tables con booleans de checkboxes
      const tableCheckboxes = Array.from(document.querySelectorAll('#tables-checkboxes input[type=checkbox]'));
      const accessDoc = {};
      tableCheckboxes.forEach(cb => {
        const key = cb.name || cb.id.replace(/^perm_/, '');
        accessDoc[key] = !!cb.checked;
      });

  // Añadir insercionesPermitidas (es parte del documento de access, pero NO participa en filtrado)
  accessDoc['insercionesPermitidas'] = insercionesValue;

      const accessDocRef = doc(db, 'users', uid, 'access', 'tables');
      batch.set(accessDocRef, accessDoc);

      // 4) Commit del batch
      await batch.commit();

      // 5) Crear logs (separado, como en la lógica original)
      const logsRef = collection(db, 'users', uid, 'logs');
      await addDoc(logsRef, {
        registro_timestamp: serverTimestamp()
      });

      // 6) Crear documento de favoritos para gráficos (mantener la misma estructura que original)
      const favoritesDocRef = doc(db, 'users', uid, 'favorites', 'graficos');
      await setDoc(favoritesDocRef, {
        TipoGrafico1: null,
        TablaGrafico1: null,
        CampoGrafico1: null,
        TipoGrafico2: null,
        TablaGrafico2: null,
        CampoGrafico2: null,
        TipoGrafico3: null,
        TablaGrafico3: null,
        CampoGrafico3: null
      });

      showMessage('Usuario creado correctamente', 'success');
      form.reset();
      // Volver a renderizar tablas en caso de que algo haya cambiado
      loadAndRenderTables();

    } catch (error) {
      console.error('Error creando usuario (admin flow):', error);
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
} else {
  console.log('admin_crear_usuario: no se encontró el formulario');
}
