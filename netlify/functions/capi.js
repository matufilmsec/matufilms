/* ============================================================
   MatuFilms — netlify/functions/capi.js
   Recibe los eventos que dispara assets/js/tracking.js en el
   navegador y los reenvía a Meta Conversions API (server-side).

   Por qué existe: el Meta Pixel normal se pierde con adblockers,
   Safari ITP, Brave, etc. La CAPI manda el mismo evento desde el
   servidor de Netlify, con el MISMO event_id que ya se envió por
   Pixel, para que Meta deduplique y no cuente el evento dos veces.

   VARIABLES DE ENTORNO NECESARIAS (Netlify → Site settings →
   Environment variables — NUNCA las pongas en el HTML/JS del front):
     META_PIXEL_ID       -> mismo ID que en assets/js/tracking.js
     META_ACCESS_TOKEN   -> token del sistema CAPI (Events Manager
                             → Conversions API → Generar token de acceso)
     META_TEST_EVENT_CODE (opcional) -> para probar en "Test events"
                             del Events Manager sin ensuciar tus datos reales

   Ver /mnt/skills .../pixels-guide.md para dónde conseguir cada cosa.
   ============================================================= */

const { sendMetaCapiEvent } = require("./lib/meta");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: "JSON inválido" };
  }

  if (!data.event_id || !data.event_name) {
    return { statusCode: 400, body: "Falta event_id o event_name" };
  }

  const clientIp =
    event.headers["x-nf-client-connection-ip"] ||
    (event.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    undefined;
  const userAgent = event.headers["user-agent"];
  const customData = data.custom_data || {};

  const metaEvent = {
    event_name: data.event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id: data.event_id,
    event_source_url: data.event_source_url,
    action_source: "website",
    user_data: {
      client_ip_address: clientIp,
      client_user_agent: userAgent,
      fbp: data.fbp || undefined,
      fbc: data.fbc || undefined
    },
    custom_data: {
      value: customData.value !== undefined && customData.value !== null ? Number(customData.value) : undefined,
      currency: customData.currency || undefined,
      content_name: customData.content_name || undefined,
      content_category: customData.content_category || undefined
    }
  };

  try {
    const result = await sendMetaCapiEvent({
      pixelId: process.env.META_PIXEL_ID,
      accessToken: process.env.META_ACCESS_TOKEN,
      testEventCode: process.env.META_TEST_EVENT_CODE,
      event: metaEvent
    });
    return { statusCode: result.skipped ? 200 : result.ok ? 200 : 502, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
