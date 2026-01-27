import { db } from '../firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Solo lectura del role persistente en Firestore
export async function getRole(uid) {
  if (!uid) return null;
  try {
    const ref = doc(db, 'users', uid, 'priv', 'data');
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    return data && data.role ? data.role : null;
  } catch (err) {
    console.error('roles.js: error leyendo role', err);
    return null;
  }
}

export default { getRole };
