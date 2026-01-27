import { db } from '../firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * roles.js
 * - Única responsabilidad: leer /users/{uid}/priv/data y devolver role
 * - No realizar ninguna otra acción
 */
export async function getUserRole(uid) {
  if (!uid) return null;
  try {
    const privRef = doc(db, 'users', uid, 'priv', 'data');
    const snap = await getDoc(privRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return data.role || null;
  } catch (err) {
    console.error('roles.getUserRole error:', err);
    return null;
  }
}

export default { getUserRole };
