import { auth, db } from '../firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, collection, addDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function showMessage(message, type = 'error') {
  const container = document.getElementById('register-message-container');
  if (!container) return;
  container.innerHTML = `<div class="message ${type}">${message}</div>`;
  setTimeout(() => { container.innerHTML = ''; }, 5000);
}

const registerForm = document.getElementById('register-form');
if (registerForm) {
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

      // Crear documento de favoritos para gráficos
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
} else {
  console.log('No se encontró el formulario de registro en esta página.');
}
