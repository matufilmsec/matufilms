/* ============================================================
   MatuFilms — plan-registro.mjs       POST /api/plan-registro
   Formulario de los enlaces universales (/planes = tarifa A,
   /propuesta = tarifa B). La persona deja su nombre y WhatsApp y
   se le crea al instante su ficha y su enlace personal /p/CODIGO,
   igual que si Matu lo hubiera creado a mano.
   ============================================================= */

import { abrirStore, crearProspecto, guardarProspecto, listarProspectos } from "./lib/store.mjs";

const ROBOTS = /bot|crawl|spider|preview|facebookexternalhit|whatsapp\/|slackbot|curl|wget|headless|python-requests/i;
const MAX_POR_HORA = 40; // freno ante abuso del formulario

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (ROBOTS.test(req.headers.get("user-agent") || "")) return json({ error: "No disponible" }, 403);

  let d;
  try {
    d = JSON.parse(await req.text());
  } catch (e) {
    return json({ error: "Datos inválidos" }, 400);
  }
  if (!d || typeof d !== "object") return json({ error: "Datos inválidos" }, 400);

  // Trampa para robots: campo oculto que una persona nunca llena, y
  // formularios enviados en menos de 1.5 s desde que se mostró la página.
  const demasiadoRapido = Number(d.ms) < 1500;
  if (d.web || demasiadoRapido) return json({ error: "No se pudo enviar. Intenta de nuevo." }, 400);

  const nombre = String(d.nombre || "").trim().replace(/\s+/g, " ");
  const contacto = String(d.contacto || "").trim();
  if (nombre.length < 2 || nombre.length > 80) return json({ error: "Escribe los nombres de la pareja." }, 400);
  const digitos = contacto.replace(/\D/g, "");
  const esCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contacto);
  if (!esCorreo && (digitos.length < 7 || digitos.length > 15)) {
    return json({ error: "Escribe un WhatsApp válido, con el código de tu país si estás fuera de Ecuador." }, 400);
  }
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha_boda || "") ? d.fecha_boda : null;
  const tarifa = d.tarifa === "B" ? "B" : "A";

  try {
    const store = abrirStore();
    const hace1h = Date.now() - 3600 * 1000;
    const recientes = (await listarProspectos(store)).filter(
      (p) => p.origen === "formulario" && new Date(p.creado).getTime() > hace1h
    );
    if (recientes.length >= MAX_POR_HORA) return json({ error: "Demasiadas solicitudes. Escríbenos por WhatsApp." }, 429);

    const p = crearProspecto({
      nombre, tarifa, fecha_boda: fecha, contacto, origen: "formulario",
      notas: "Se registró solo desde " + (tarifa === "B" ? "/propuesta" : "/planes") + "."
    });
    p.eventos.push({ t: p.creado, tipo: "registro" });
    await guardarProspecto(store, p);
    return json({ code: p.code });
  } catch (e) {
    console.error("plan-registro:", e);
    return json({ error: "No se pudo crear tu enlace. Escríbenos por WhatsApp." }, 500);
  }
};

export const config = { path: "/api/plan-registro" };
