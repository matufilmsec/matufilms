/* ============================================================
   MatuFilms — admin-prospectos.mjs     /api/admin/prospectos
   API privada del panel /seguimiento/. Requiere el header
     Authorization: Bearer <ADMIN_TOKEN>
   (ADMIN_TOKEN = variable de entorno en Netlify).

     GET                 -> lista de prospectos con su resumen
     POST                -> crea un prospecto y devuelve su enlace
     PATCH ?c=CODIGO     -> edita estado, notas, seguimiento, etc.
   No hay borrado: un prospecto se archiva (archivado: true) y su
   historial se conserva.
   ============================================================= */

import { timingSafeEqual } from "node:crypto";
import {
  abrirStore, crearProspecto, guardarProspecto, leerProspecto, listarProspectos
} from "./lib/store.mjs";

const SITIO = "https://matufilms.com";
const ESTADOS = new Set(["contactado", "ganado", "perdido"]);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

function autorizado(req) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return null; // sin configurar
  const recibido = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(recibido);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const conEnlace = (p) => ({ ...p, enlace: `${SITIO}/p/${p.code}` });

export default async (req) => {
  const auth = autorizado(req);
  if (auth === null) return json({ error: "Falta configurar ADMIN_TOKEN en Netlify" }, 503);
  if (!auth) return json({ error: "No autorizado" }, 401);

  const store = abrirStore();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const lista = await listarProspectos(store);
    lista.sort((a, b) => (b.creado || "").localeCompare(a.creado || ""));
    return json({ prospectos: lista.map(conEnlace) });
  }

  let body = {};
  try {
    body = JSON.parse((await req.text()) || "{}");
  } catch (e) {
    return json({ error: "JSON inválido" }, 400);
  }

  if (req.method === "POST") {
    if (!body.nombre || !String(body.nombre).trim()) return json({ error: "Falta el nombre" }, 400);
    const p = crearProspecto(body);
    await guardarProspecto(store, p);
    return json({ prospecto: conEnlace(p) }, 201);
  }

  if (req.method === "PATCH") {
    const p = await leerProspecto(store, url.searchParams.get("c"));
    if (!p) return json({ error: "Prospecto no encontrado" }, 404);
    if ("estado_manual" in body) p.estado_manual = ESTADOS.has(body.estado_manual) ? body.estado_manual : null;
    if ("notas" in body) p.notas = String(body.notas || "").slice(0, 1000);
    if ("contacto" in body) p.contacto = String(body.contacto || "").slice(0, 120);
    if ("seguimiento_fecha" in body) p.seguimiento_fecha = body.seguimiento_fecha || null;
    if ("fecha_boda" in body) p.fecha_boda = body.fecha_boda || null;
    if ("tarifa" in body) p.tarifa = body.tarifa === "B" ? "B" : "A";
    if ("archivado" in body) p.archivado = !!body.archivado;
    await guardarProspecto(store, p);
    return json({ prospecto: conEnlace(p) });
  }

  return json({ error: "Método no permitido" }, 405);
};

export const config = { path: "/api/admin/prospectos" };
