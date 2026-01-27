import { FIREBASE_API_KEY, db } from '../firebase-config.js';
import { writeBatch, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initializeDatabaseCache, getTables } from './database-cache.js';

const form = document.getElementById('admin-create-form');
const messageContainer = document.getElementById('admin-create-message');
const tablesContainer = document.getElementById('tables-checkboxes');

function showMessage(msg, type = 'info') {
  if (!messageContainer) return;
  messageContainer.innerHTML = `<div class="message ${type}">${msg}</div>`;
  setTimeout(() => { messageContainer.innerHTML = ''; }, 5000);
}

async function renderTables() {
  try {
    tablesContainer.innerHTML = '<div id="tables-loading">Cargando tablas...</div>';
    await initializeDatabaseCache();

    const schemas = ['mdr', 'hrf'];
    const allTables = [];
    schemas.forEach(s => {
      const list = getTables(s) || [];
      list.forEach(t => allTables.push(t));
    });

    // Deduplicate
    const unique = Array.from(new Set(allTables)).sort();

    if (unique.length === 0) {
      tablesContainer.innerHTML = '<div>No se encontraron tablas</div>';
      return;
    }

    tablesContainer.innerHTML = '';
    unique.forEach(tbl => {
      const id = `table-${tbl}`;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <input type="checkbox" id="${id}" data-table="${tbl}" checked>
          <span>${tbl}</span>
        </label>
      `;
      tablesContainer.appendChild(wrapper);
    });

  } catch (err) {
    console.error('Error cargando tablas para admin:', err);
    tablesContainer.innerHTML = '<div>Error cargando tablas</div>';
  }
}

async function createUserAccount(email, password) {
  // Use the Identity Toolkit REST API (creates user without changing current client auth)
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
  const body = { email, password, returnSecureToken: true };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : 'Error creando cuenta';
    throw new Error(msg);
  }
  // localId is the uid
  return data.localId;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('admin-register-email').value.trim();
  const password = document.getElementById('admin-register-password').value;
  const passwordConfirm = document.getElementById('admin-register-password-confirm').value;
  const inserciones = !!document.getElementById('insercionesPermitidas').checked;

  if (!email || !password) return showMessage('Email y contraseña son obligatorios', 'error');
  if (password !== passwordConfirm) return showMessage('Las contraseñas no coinciden', 'error');

  // Build access object
  const boxes = tablesContainer.querySelectorAll('input[type=checkbox][data-table]');
  const accessTables = {};
  boxes.forEach(cb => {
    const t = cb.dataset.table;
    accessTables[t] = !!cb.checked;
  });
  // insercionesPermitidas is stored but the accessInterceptor must NOT read it
  accessTables['insercionesPermitidas'] = inserciones;

  // Decide role according to spec (single decision here)
  const role = inserciones === true ? 'COLABORADOR' : 'USER';

  try {
    showMessage('Creando cuenta...', 'info');

    // 1) Create Firebase Auth user via REST (does not affect current auth state)
    const uid = await createUserAccount(email, password);

    // 2) Write Firestore docs in a single batch
    const batch = writeBatch(db);
    const userRef = doc(db, 'users', uid);
    const privRef = doc(db, 'users', uid, 'priv', 'data');
    const accessRef = doc(db, 'users', uid, 'access', 'tables');

    batch.set(userRef, {
      _id: uid,
      email: email,
      createdAt: serverTimestamp()
    });

    batch.set(privRef, {
      role: role
    });

    batch.set(accessRef, accessTables);

    await batch.commit();

    showMessage('Usuario creado correctamente', 'success');
    form.reset();
    await renderTables();
  } catch (err) {
    console.error('Error creando usuario (admin):', err);
    showMessage('Error creando usuario: ' + (err.message || err), 'error');
  }
});

// Inicializar UI
document.addEventListener('DOMContentLoaded', () => {
  renderTables();
});

export default {};
