import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Añade una entrada en la colección `petpend` con las credenciales asignadas.
 * Siempre crea un documento nuevo (no reutiliza ni modifica existentes).
 * @param {Firestore} db - instancia de Firestore (desde firebase-config.js)
 * @param {string} username - nombre de usuario (correo)
 * @param {string} password - contraseña asignada
 * @returns {Promise<string>} id del documento creado
 */
export async function addPetpendEntry(db, username, password) {
  if (!db) throw new Error('Firestore (db) no proporcionado');
  if (!username) throw new Error('username requerido');
  if (!password) throw new Error('password requerido');

  const colRef = collection(db, 'petpend');
  const payload = {
    username: username,
    password: password,
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(colRef, payload);
  return docRef.id;
}

export default { addPetpendEntry };
