// crear_llave.js
// Lógica para crear el archivo .easySQL comprimido y cifrado

import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import CryptoJS from "https://cdn.jsdelivr.net/npm/crypto-js@4.1.1/+esm";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, addDoc, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Configuración de Firebase
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

// Validar fortaleza de la clave
function checkPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

document.getElementById("claveCifrado").addEventListener("input", e => {
  const pw = e.target.value;
  const strength = checkPasswordStrength(pw);
  const msg = ["Muy débil", "Débil", "Media", "Fuerte", "Muy fuerte", "Excelente"];
  const color = ["#c00", "#e67e22", "#f1c40f", "#27ae60", "#2ecc71", "#00b894"];
  const el = document.getElementById("passwordStrength");
  el.textContent = msg[strength];
  el.style.color = color[strength];
});

// Manejar el submit del formulario

document.getElementById("crearLlaveForm").onsubmit = async function(e) {
  e.preventDefault();
  const progreso = document.getElementById("progresoLlave");
  progreso.textContent = "Comprobando datos en servidor...";

  // Recoger datos
  const nombreBD = document.getElementById("nombreBD").value.trim();
  const descripcionBD = document.getElementById("descripcionBD").value.trim();
  const supabaseUrl = document.getElementById("supabaseUrl").value.trim();
  const supabaseKey = document.getElementById("supabaseKey").value.trim();
  const apiGemini = document.getElementById("apiGemini").value.trim();
  const claveCifrado = document.getElementById("claveCifrado").value;

  // Validar clave fuerte
  if (checkPasswordStrength(claveCifrado) < 5) {
    progreso.textContent = "La clave de cifrado no es lo suficientemente fuerte.";
    return;
  }

  // Comprobar si ya existe la API Key (anon) como ID en Firestore
  try {
    const licenciaRef = doc(db, "licencias", supabaseKey);
    const licenciaSnap = await getDoc(licenciaRef);
    if (licenciaSnap.exists()) {
      progreso.textContent = "Ya existe una licencia registrada con esta API Key (anon).";
      return;
    }
  } catch (err) {
    progreso.textContent = "Error al comprobar la API Key en el servidor.";
    return;
  }

  // Crear documento público en Firestore con supabaseKey como ID
  try {
    await setDoc(doc(db, "licencias", supabaseKey), {
      anon: supabaseKey,
      activo: true
    });
    // Crear documento privado en subcolección
    await setDoc(doc(db, `licencias/${supabaseKey}/privado`, "datos"), {
      nombre: nombreBD,
      descripcion: descripcionBD,
      url: supabaseUrl,
      clave: claveCifrado,
      fecha: new Date().toISOString(),
      apiGemini: apiGemini
    });
  } catch (err) {
    progreso.textContent = "Error al registrar la licencia en el servidor.";
    return;
  }

  progreso.textContent = "Generando archivo...";

  // Generar los .json
  const informacion = { nombre: nombreBD, descripcion: descripcionBD };
  const credenciales = { url: supabaseUrl, key: supabaseKey };
  const apiAI = { gemini: apiGemini };
  const licencia = { codigo: supabaseKey };

  // Comprimir con JSZip
  const zip = new JSZip();
  zip.file("informacion.json", JSON.stringify(informacion, null, 2));
  zip.file("credenciales.json", JSON.stringify(credenciales, null, 2));
  zip.file("apiAI.json", JSON.stringify(apiAI, null, 2));
  zip.file("licencia.json", JSON.stringify(licencia, null, 2));

  const zipBlob = await zip.generateAsync({ type: "uint8array" });

  // Cifrar con CryptoJS AES
  const wordArray = CryptoJS.lib.WordArray.create(zipBlob);
  const encrypted = CryptoJS.AES.encrypt(wordArray, claveCifrado).toString();

  // Descargar
  const blob = new Blob([encrypted], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombreBD + ".easySQL";
  a.click();
  progreso.textContent = "Archivo generado y descargado con éxito.";
};
