/* Helper compartido: arma y envía un evento a Meta Conversions API.
   Usado por capi.js (eventos de navegador) y cal-webhook.js (eventos
   de servidor cuando Cal.com confirma una reserva). */

const GRAPH_VERSION = "v21.0";

async function sendMetaCapiEvent({ pixelId, accessToken, testEventCode, event }) {
  if (!pixelId || !accessToken) {
    return { skipped: true, reason: "META_PIXEL_ID / META_ACCESS_TOKEN no configurados" };
  }
  const body = { data: [event] };
  if (testEventCode) body.test_event_code = testEventCode;

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

module.exports = { sendMetaCapiEvent };
