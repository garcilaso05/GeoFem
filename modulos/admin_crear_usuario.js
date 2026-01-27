import { FIREBASE_API_KEY, db } from '../firebase-config.js';
import { writeBatch, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initializeDatabaseCache, getTables } from './database-cache.js';
import { formatDisplayName } from './seguridad.js';

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
    const loading = document.getElementById('tables-loading');
    if (loading) loading.textContent = 'Cargando tablas...';

    // Try to obtain tables from in-memory dbCache first (fast)
    let mdrList = [];
    let hrfList = [];

    try {
      if (window.dbCache && typeof window.dbCache.getTables === 'function') {
        mdrList = window.dbCache.getTables('mdr') || [];
        hrfList = window.dbCache.getTables('hrf') || [];
      }
    } catch (err) {
      console.warn('Error leyendo window.dbCache:', err);
      mdrList = [];
      hrfList = [];
    }

    // If not available in memory, try sessionStorage cache copy
    if ((!mdrList || mdrList.length === 0) && (!hrfList || hrfList.length === 0)) {
      try {
        const raw = sessionStorage.getItem('geofem_db_cache');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.tables) {
            mdrList = parsed.tables.mdr || [];
            hrfList = parsed.tables.hrf || [];
          }
        }
      } catch (err) {
        console.warn('Error leyendo sessionStorage cache:', err);
      }
    }

    // If still empty, fall back to initializeDatabaseCache but with timeout to avoid hanging
    if ((!mdrList || mdrList.length === 0) && (!hrfList || hrfList.length === 0)) {
      try {
        // attempt but don't block forever (5s)
        const initPromise = initializeDatabaseCache();
        const timeout = new Promise((res, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
        await Promise.race([initPromise, timeout]);
      } catch (err) {
        console.warn('initializeDatabaseCache fallback failed or timed out:', err);
      }

      // try again reading exported getter which may now be populated
      try {
        mdrList = getTables('mdr') || [];
        hrfList = getTables('hrf') || [];
      } catch (err) {
        console.warn('Error leyendo getTables tras fallback:', err);
      }
    }

  const mdrContainer = document.getElementById('tables-mdr-list');
  const hrfContainer = document.getElementById('tables-hrf-list');
    const grid = document.getElementById('tables-grid');

    // Las únicas tablas que deben forzarse como marcadas/disabled son
    // las tablas con nombre EXACTO 'madre' y 'huerfano' (case-insensitive).
    // No debemos inferir por subcadenas (ej. 'madre_acogida' NO debe forzarse).
    const PARENT_EXACT = new Set(['madre', 'huerfano']);
    function isParentTable(name) {
      if (!name) return false;
      return PARENT_EXACT.has(name.toLowerCase());
    }

    // Helper to create items
    function createItem(tbl, schemaPrefix) {
      const id = `${schemaPrefix}-${tbl}`;
      const wrapper = document.createElement('div');
      wrapper.className = 'table-item';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = id;
      chk.dataset.table = tbl;
      chk.dataset.schema = schemaPrefix;
      chk.checked = true;
      if (isParentTable(tbl)) {
        chk.checked = true;
        chk.disabled = true; // cannot be unchecked
      }
      const label = document.createElement('span');
      // Mostrar nombre humanizado pero conservar el atributo data-table con el nombre real
      label.textContent = formatDisplayName(tbl) || tbl;
      wrapper.appendChild(chk);
      wrapper.appendChild(label);
      return wrapper;
    }

    // Render MDR
    if (mdrContainer) {
      mdrContainer.innerHTML = '';
      (mdrList || []).forEach(tbl => {
        mdrContainer.appendChild(createItem(tbl, 'mdr'));
      });
    }

    // Render HRF
    if (hrfContainer) {
      hrfContainer.innerHTML = '';
      (hrfList || []).forEach(tbl => {
        hrfContainer.appendChild(createItem(tbl, 'hrf'));
      });
    }

    // Show grid
    if (grid) grid.style.display = 'flex';
    if (loading) loading.remove();

    // Select-all handlers
    const selectAllMdr = document.getElementById('select-all-mdr');
    const selectAllHrf = document.getElementById('select-all-hrf');
    if (selectAllMdr) selectAllMdr.addEventListener('click', () => {
      const checks = mdrContainer.querySelectorAll('input[type=checkbox]');
      // If all non-disabled are checked => uncheck them, else check them
      const nonDisabled = Array.from(checks).filter(c => !c.disabled);
      const allChecked = nonDisabled.every(c => c.checked);
      nonDisabled.forEach(c => c.checked = !allChecked);
    });
    if (selectAllHrf) selectAllHrf.addEventListener('click', () => {
      const checks = hrfContainer.querySelectorAll('input[type=checkbox]');
      const nonDisabled = Array.from(checks).filter(c => !c.disabled);
      const allChecked = nonDisabled.every(c => c.checked);
      nonDisabled.forEach(c => c.checked = !allChecked);
    });

  } catch (err) {
    console.error('Error cargando tablas para admin:', err);
    const loading = document.getElementById('tables-loading');
    if (loading) loading.textContent = 'Error cargando tablas';
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

  // Build access object from both columns
  const boxes = document.querySelectorAll('#tables-grid input[type=checkbox][data-table]');
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

// Inicializar UI inmediatamente cuando el módulo se importa (el HTML ya fue insertado por loadModule)
// Usamos llamada directa porque DOMContentLoaded ya ocurrió cuando se importan módulos dinámicamente.
renderTables();

// Toggle show/hide passwords
try {
  const toggleBtn = document.getElementById('toggle-password-visibility');
  const eyeImg = document.getElementById('eye-icon');
  if (toggleBtn && eyeImg) {
    toggleBtn.addEventListener('click', () => {
      const p1 = document.getElementById('admin-register-password');
      const p2 = document.getElementById('admin-register-password-confirm');
      if (!p1 || !p2) return;
      const show = p1.type === 'password';
      p1.type = show ? 'text' : 'password';
      p2.type = show ? 'text' : 'password';
      // Swap icon
      eyeImg.src = show ? '/ojoAbierto.png' : '/ojoCerrado.png';
      toggleBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
  }
} catch (err) {
  console.warn('No se pudo inicializar toggle de contraseñas', err);
}

export default {};
