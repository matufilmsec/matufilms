/* ============================================================
   MatuFilms — plan-data.mjs        GET /api/plan?c=CODIGO
   Devuelve a la página /p/CODIGO lo que necesita para mostrarse:
   nombre del prospecto y los planes con los precios de SU tarifa.
   No registra nada (el registro lo hace plan-track.mjs).
   ============================================================= */

import { abrirStore, leerProspecto } from "./lib/store.mjs";
import { planesParaTarifa, CAL_URL, WHATSAPP } from "./lib/planes.mjs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Método no permitido" }, 405);
  const code = new URL(req.url).searchParams.get("c");
  const p = await leerProspecto(abrirStore(), code);
  if (!p || p.archivado) return json({ error: "Enlace no disponible" }, 404);
  return json({
    nombre: p.nombre,
    fecha_boda: p.fecha_boda,
    planes: planesParaTarifa(p.tarifa),
    cal_url: CAL_URL,
    whatsapp: WHATSAPP
  });
};

export const config = { path: "/api/plan" };
