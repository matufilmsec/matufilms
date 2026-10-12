/* ============================================================
   MatuFilms — plan-track.mjs       POST /api/plan-track
   Recibe lo que hace el prospecto en su página /p/CODIGO y lo
   guarda en su ficha. Eventos: vista, plan_visto, reservar,
   whatsapp, tiempo.

   Los previsualizadores de enlaces (WhatsApp, Gmail, Slack...) no
   ejecutan JavaScript y además se filtran por user-agent, así que
   una "vista" es una persona que de verdad abrió la página.
   ============================================================= */

import { abrirStore, registrarEvento } from "./lib/store.mjs";

const TIPOS = new Set(["vista", "plan_visto", "reservar", "whatsapp", "tiempo"]);
const PLANES = new Set(["amore", "ulala", "cielito"]);
const ROBOTS = /bot|crawl|spider|preview|facebookexternalhit|whatsapp\/|slackbot|curl|wget|headless|python-requests/i;

export default async (req) => {
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
  if (ROBOTS.test(req.headers.get("user-agent") || "")) return new Response(null, { status: 204 });

  let data;
  try {
    data = JSON.parse(await req.text());
  } catch (e) {
    return new Response("JSON inválido", { status: 400 });
  }
  if (!data || !TIPOS.has(data.tipo)) return new Response("Evento no válido", { status: 400 });

  const plan = PLANES.has(data.plan) ? data.plan : undefined;
  try {
    await registrarEvento(abrirStore(), data.c, { tipo: data.tipo, plan, seg: data.seg });
  } catch (e) {
    console.error("plan-track:", e);
  }
  return new Response(null, { status: 204 });
};

export const config = { path: "/api/plan-track" };
