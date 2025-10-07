// subir_archivo.js
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import CryptoJS from "https://cdn.jsdelivr.net/npm/crypto-js@4.1.1/+esm";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Configuración de Firebase (igual que en crear_llave.js)
const firebaseConfig = {
  apiKey: "AIzaSyChCxRwuIdx4eDL2hZiIa_N-J1oezJefOQ",
  authDomain: "licencias-easysql.firebaseapp.com",
  databaseURL: "https://licencias-easysql-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "licencias-easysql",
  storageBucket: "licencias-easysql.firebasestorage.app",
  messagingSenderId: "1097237756092",
  appId: "1:1097237756092:web:c4c895bc986ab4df8fb8b9"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let credenciales = null;
let supabase = null;
let licenciaCodigo = null;

// Paso 1: Leer archivo y desencriptar

document.getElementById("formArchivo").onsubmit = async function(e) {
  e.preventDefault();
  const progreso = document.getElementById("progresoArchivo");
  progreso.textContent = "Procesando archivo...";
  const fileInput = document.getElementById("archivoEasySQL");
  const clave = document.getElementById("claveDesencriptar").value;
  if (!fileInput.files.length) {
    progreso.textContent = "Selecciona un archivo .easySQL";
    return;
  }
  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = async function(ev) {
    try {
      // Desencriptar
      const encrypted = ev.target.result;
      const decrypted = CryptoJS.AES.decrypt(encrypted, clave);
      const uint8arr = new Uint8Array(decrypted.words.length * 4);
      for (let i = 0; i < decrypted.words.length; ++i) {
        const word = decrypted.words[i];
        uint8arr[i * 4 + 0] = (word >> 24) & 0xff;
        uint8arr[i * 4 + 1] = (word >> 16) & 0xff;
        uint8arr[i * 4 + 2] = (word >> 8) & 0xff;
        uint8arr[i * 4 + 3] = word & 0xff;
      }
      // Descomprimir
      const zip = await JSZip.loadAsync(uint8arr);
      credenciales = JSON.parse(await zip.file("credenciales.json").async("string"));
      const licenciaJson = await zip.file("licencia.json").async("string");
      licenciaCodigo = JSON.parse(licenciaJson).codigo;
      // Comprobar licencia en Firestore
      const licenciaRef = doc(db, "licencias", licenciaCodigo);
      const licenciaSnap = await getDoc(licenciaRef);
      if (!licenciaSnap.exists() || licenciaSnap.data().activo !== true) {
        progreso.textContent = "Licencia no válida o desactivada.";
        return;
      }
      // Mostrar login
      document.getElementById("subirArchivoBox").style.display = "none";
      document.getElementById("loginBox").style.display = "block";
      progreso.textContent = "";
    } catch (err) {
      progreso.textContent = "Error al desencriptar, descomprimir o validar la licencia. ¿Clave correcta?";
    }
  };
  reader.readAsText(file);
};

// Paso 2: Login usuario Supabase

document.getElementById("formLogin").onsubmit = async function(e) {
  e.preventDefault();
  const progreso = document.getElementById("progresoLogin");
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPass").value;
  // Crear instancia de Supabase con las credenciales desencriptadas
  supabase = createClient(credenciales.url, credenciales.key);
  // Login con email y password
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
  if (error) {
    progreso.textContent = "Usuario o contraseña incorrectos.";
    return;
  }
  // Guardar acceso en Firestore (en subcolección privado)
  try {
    const now = new Date();
    const fecha = `${now.getFullYear()}_${(now.getMonth()+1).toString().padStart(2,'0')}_${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}`;
    const accesoField = `acceso_${fecha}`;
    const privadoRef = doc(db, `licencias/${licenciaCodigo}/privado`, "datos");
    await updateDoc(privadoRef, { [accesoField]: email });
  } catch (err) {
    // No bloquear acceso si falla el log, solo mostrar aviso
    console.warn("No se pudo registrar el acceso en Firestore", err);
  }
  // Guardar instancia global para el resto de módulos
  window._supabaseInstance = supabase;
  // Mostrar todos los menús (sin roles)
  mostrarMenuApp();
};

// Mostrar todos los menús tras login
function mostrarMenuApp() {
  document.querySelector("header nav").innerHTML = '';
  const nav = document.querySelector("header nav");
  nav.innerHTML += '<button onclick="loadModule(\'modulos/crear_tabla.html\',\'modulos/crear_tabla.js\')">Crear Tablas</button>';
  nav.innerHTML += '<button onclick="loadModule(\'modulos/crear_enumerado.html\',\'modulos/crear_enumerado.js\')">Crear enumerado</button>';
  nav.innerHTML += '<button onclick="loadModule(\'modulos/inserciones.html\',\'modulos/inserciones.js\')">Inserciones</button>';
  nav.innerHTML += '<button onclick="loadModule(\'modulos/visualizar_datos.html\',\'modulos/visualizar_datos.js\')">Visualizar datos</button>';
  nav.innerHTML += '<button onclick="loadModule(\'modulos/generar_graficos.html\',\'modulos/generar_graficos.js\')">Generar gráficos</button>';
  nav.innerHTML += '<button onclick="loadModule(\'modulos/editar_tabla.html\',\'modulos/editar_tabla.js\')">Editar tabla</button>';
  nav.innerHTML += '<button onclick="loadModule(\'modulos/gestionar_relaciones.html\',\'modulos/gestionar_relaciones.js\')">Gestionar relaciones</button>';
  window.loadModule('modulos/crear_tabla.html','modulos/crear_tabla.js');
  document.getElementById("loginBox").style.display = "none";
}
