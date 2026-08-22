/* ============================================================
   MatuFilms — netlify/functions/cal-webhook.js
   Recibe el webhook que Cal.com dispara cuando alguien agenda de
   verdad (no cuando hace clic en el botón — eso es "Interesado en
   reunion", que se dispara en el navegador).

   Configuración en Cal.com:
   1. cal.com → Settings → Developer → Webhooks → "Add webhook"
   2. Subscriber URL: https://matufilms.com/.netlify/functions/cal-webhook
   3. Event: "Booking created"
   4. Secret: pega el mismo valor que vas a guardar en Netlify como
      CAL_WEBHOOK_SECRET (Cal.com lo manda en el header
      "X-Cal-Signature-256", firmado con HMAC-SHA256)

   Cómo distingue "reunión" (llamada de venta) de "sesión" (la boda
   ya contratada): por el SLUG del tipo de evento en Cal.com. Crea
   tus tipos de evento con slugs que contengan "reunion" o "sesion"
   (ej: "reunion-30min", "sesion-fotografica"), o ajusta la función
   detectarTipo() de abajo si prefieres nombrarlos distinto.

   VARIABLES DE ENTORNO NECESARIAS:
     META_PIXEL_ID, META_ACCESS_TOKEN, META_TEST_EVENT_CODE (igual que capi.js)
     CAL_WEBHOOK_SECRET -> el secreto que configuraste en Cal.com
   ============================================================= */

const crypto = require("crypto");
const { sendMetaCapiEvent } = require("./lib/meta");

function detectarTipo(slug) {
  slug = (slug || "").toLowerCase();
  if (slug.indexOf("sesion") !== -1 || slug.indexOf("session") !== -1) return "sesion";
  if (slug.indexOf("reunion") !== -1 || slug.indexOf("llamada") !== -1 || slug.indexOf("call") !== -1) return "reunion";
  return null; // tipo de evento no reconocido -> no se dispara nada, por seguridad
}

function verificarFirma(rawBody, signatureHeader, secret) {
  if (!secret) return true; // si no configuraste secret todavía, no bloquea (pero AVISA en logs)
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch (e) {
    return false;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const secret = process.env.CAL_WEBHOOK_SECRET;
  const signature = event.headers["x-cal-signature-256"];
  const rawBody = event.body || "";

  if (!verificarFirma(rawBody, signature, secret)) {
    return { statusCode: 401, body: "Firma inválida" };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return { statusCode: 400, body: "JSON inválido" };
  }

  // Solo nos interesan las reservas confirmadas/creadas.
  if (payload.triggerEvent !== "BOOKING_CREATED") {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: payload.triggerEvent || "sin trigger" }) };
  }

  const booking = payload.payload || {};
  const slug = (booking.eventType && booking.eventType.slug) || booking.eventTypeSlug || "";
  const tipo = detectarTipo(slug);

  if (!tipo) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "Tipo de evento de Cal no reconocido: " + slug }) };
  }

  const bookingUid = booking.uid || booking.uuid;
  // event_id determinístico (no aleatorio) para que, si el Thank You
  // Page del navegador dispara el mismo evento con este mismo uid,
  // Meta los deduplique como el mismo evento.
  const eventId = "cal_" + tipo + "_" + bookingUid;

  const metaEventName = tipo === "sesion" ? "Schedule" : "Lead"; // Programar / Cliente potencial

  const metaEvent = {
    event_name: metaEventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    event_source_url: "https://matufilms.com/",
    action_source: "system_generated", // el envío lo origina Cal.com, no un clic en el navegador
    user_data: {
      em: undefined, // si más adelante quieres mejorar el match, aquí se puede mandar el email/teléfono hasheado (SHA256) del asistente
    },
    custom_data: {
      content_name: booking.title || slug,
      content_category: tipo
    }
  };

  try {
    const result = await sendMetaCapiEvent({
      pixelId: process.env.META_PIXEL_ID,
      accessToken: process.env.META_ACCESS_TOKEN,
      testEventCode: process.env.META_TEST_EVENT_CODE,
      event: metaEvent
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ tipo: tipo, metaEventName: metaEventName, bookingUid: bookingUid, result: result })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
