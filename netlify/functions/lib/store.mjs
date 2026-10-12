/* ============================================================
   MatuFilms — lib/store.mjs
   Almacén de prospectos y de su actividad (Netlify Blobs: viene
   incluido con Netlify, sin base de datos aparte ni costo extra).

   Estructura de cada prospecto (clave: su código, ej. "liz-y-joel-k7x2"):
   {
     code, nombre, tarifa ("A" | "B"), fecha_boda, contacto, notas,
     estado_manual (null | "contactado" | "ganado" | "perdido"),
     seguimiento_fecha, archivado, creado,
     stats: { vistas, primera_vista, ultima_vista, planes_vistos{},
              reservar_clics, ultimo_reservar, whatsapp_clics,
              reservo, reservo_fecha, segundos_total },
     eventos: [ { t, tipo, plan, seg } ]   (últimos 150)
   }

   MF_LOCAL_STORE=/ruta/archivo.json  -> usa un archivo local en lugar
   de Netlify Blobs (solo para pruebas en tu computador).
   ============================================================= */

import { getStore, connectLambda } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import fs from "node:fs";

const MAX_EVENTOS = 150;
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789"; // sin letras ni números que se confunden

function localStore(file) {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return {}; }
  };
  const write = (d) => fs.writeFileSync(file, JSON.stringify(d));
  return {
    async get(key) { const d = read(); return d[key] === undefined ? null : d[key]; },
    async setJSON(key, value) { const d = read(); d[key] = value; write(d); },
    async list({ prefix = "" } = {}) {
      return { blobs: Object.keys(read()).filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

export function abrirStore(legacyEvent) {
  if (process.env.MF_LOCAL_STORE) return localStore(process.env.MF_LOCAL_STORE);
  if (legacyEvent && typeof connectLambda === "function") connectLambda(legacyEvent);
  return getStore({ name: "prospectos", consistency: "strong" });
}

export function slugDe(nombre) {
  const base = String(nombre || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 28).replace(/-+$/g, "");
  return base || "prospecto";
}

export function nuevoCodigo(nombre) {
  const bytes = randomBytes(5);
  let sufijo = "";
  for (let i = 0; i < 5; i++) sufijo += ALFABETO[bytes[i] % ALFABETO.length];
  return slugDe(nombre) + "-" + sufijo;
}

export function codigoValido(code) {
  return typeof code === "string" && /^[a-z0-9-]{3,48}$/.test(code);
}

export async function leerProspecto(store, code) {
  if (!codigoValido(code)) return null;
  return (await store.get("p/" + code, { type: "json" })) || null;
}

export async function guardarProspecto(store, p) {
  await store.setJSON("p/" + p.code, p);
}

export async function listarProspectos(store) {
  const { blobs } = await store.list({ prefix: "p/" });
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean);
}

export function crearProspecto({ nombre, tarifa, fecha_boda, contacto, notas }) {
  return {
    code: nuevoCodigo(nombre),
    nombre: String(nombre).trim().slice(0, 80),
    tarifa: tarifa === "B" ? "B" : "A",
    fecha_boda: fecha_boda || null,
    contacto: contacto ? String(contacto).trim().slice(0, 120) : "",
    notas: notas ? String(notas).trim().slice(0, 1000) : "",
    estado_manual: null,
    seguimiento_fecha: null,
    archivado: false,
    creado: new Date().toISOString(),
    stats: {
      vistas: 0, primera_vista: null, ultima_vista: null, planes_vistos: {},
      reservar_clics: 0, ultimo_reservar: null, whatsapp_clics: 0,
      reservo: false, reservo_fecha: null, segundos_total: 0
    },
    eventos: []
  };
}

// Aplica un evento al resumen del prospecto y lo agrega al historial.
export function aplicarEvento(p, { tipo, plan, seg }) {
  const ahora = new Date().toISOString();
  const s = p.stats;
  if (tipo === "vista") {
    s.vistas += 1;
    s.primera_vista = s.primera_vista || ahora;
    s.ultima_vista = ahora;
  } else if (tipo === "plan_visto" && plan) {
    s.planes_vistos[plan] = (s.planes_vistos[plan] || 0) + 1;
    s.ultima_vista = ahora;
  } else if (tipo === "reservar") {
    s.reservar_clics += 1;
    s.ultimo_reservar = ahora;
    s.ultima_vista = ahora;
  } else if (tipo === "whatsapp") {
    s.whatsapp_clics += 1;
    s.ultima_vista = ahora;
  } else if (tipo === "tiempo") {
    s.segundos_total += Math.max(0, Math.min(Number(seg) || 0, 1800));
    return p; // el tiempo se suma al total, no ensucia el historial
  } else if (tipo === "reservo") {
    s.reservo = true;
    s.reservo_fecha = ahora;
  } else {
    return p;
  }
  p.eventos.push({ t: ahora, tipo, plan: plan || undefined });
  if (p.eventos.length > MAX_EVENTOS) p.eventos = p.eventos.slice(-MAX_EVENTOS);
  return p;
}

// Registro seguro: ignora códigos desconocidos y nunca lanza errores hacia afuera.
export async function registrarEvento(store, code, evento) {
  const p = await leerProspecto(store, code);
  if (!p) return false;
  aplicarEvento(p, evento);
  await guardarProspecto(store, p);
  return true;
}
