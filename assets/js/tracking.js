/* ============================================================
   MatuFilms — tracking.js
   Librería única de tracking, cargada en TODAS las páginas.

   QUÉ HACE:
   - Define los eventos de TU embudo (y solo esos — nada de eventos
     genéricos de plantilla tipo "SuscribedButton" que no aplican
     a tu negocio y solo inflan tus reportes con ruido).
   - Envía cada evento a Meta Pixel (navegador) y a la Conversions
     API /CAPI (servidor, vía la función de Netlify capi.js) con el
     MISMO event_id, para que Meta deduplique automáticamente el
     mismo evento visto por dos canales.
   - Evita disparos duplicados: un clic doble no cuenta dos veces,
     y recargar una Thank You Page no vuelve a contar una "Compra".
   - También envía a GA4 (gtag) y TikTok (ttq) cuando esos scripts
     están presentes, usando el mismo nombre de evento cuando aplica.

   CÓMO SE USA EN EL HTML (forma recomendada, sin tocar JS):
     <a class="btn" data-mf-event="interesado_reunion" href="...">Agendar reunión</a>
     <a class="btn" data-mf-event="contacto" data-mf-source="whatsapp" href="https://wa.me/...">WhatsApp</a>
     <a data-mf-event="vio_portafolio" href="#portafolio">Ver portafolio</a>

   Para eventos que no dependen de un clic (Thank You Pages, blog),
   se usan las funciones públicas MF.track...() — ver ejemplos en
   gracias-reunion/index.html, gracias-sesion/index.html, pago/index.html
   y blog/*.html.
   ============================================================= */

(function (window, document) {
  "use strict";

  // ============================================================
  // 0. CONFIGURACIÓN — reemplaza estos valores por los tuyos.
  //    Si dejas un ID vacío, ese canal simplemente no se dispara
  //    (no rompe nada). Ver /mnt/skills .../pixels-guide para dónde
  //    conseguir cada uno.
  // ============================================================
  var CONFIG = {
    META_PIXEL_ID: "", // ej: "1234567890123456" — Meta Events Manager
    GA4_ID: "", // ej: "G-XXXXXXXXXX"
    TIKTOK_PIXEL_ID: "", // ej: "CXXXXXXXXXXXXXXXXXXX"
    CAPI_ENDPOINT: "/.netlify/functions/capi", // función Netlify — ver netlify/functions/capi.js
    CURRENCY_DEFAULT: "USD",
    DEBUG: false // ponlo en true para ver los eventos en la consola mientras pruebas
  };

  // ============================================================
  // 1. MAPA DE EVENTOS DEL EMBUDO
  //    Este es el ÚNICO catálogo de eventos permitido. Si un botón
  //    no está mapeado aquí, no dispara nada — así se evita que
  //    aparezcan eventos sueltos tipo "SuscribedButton" que no
  //    corresponden a ninguna etapa real de tu funnel.
  //
  //    meta.type: "standard" -> fbq('track', metaName, ...)
  //               "custom"   -> fbq('trackCustom', metaName, ...)
  //
  //    persistent: true  -> el dedup sobrevive recargas de página
  //                          (localStorage) — usado en conversiones
  //                          que NO deben contarse dos veces jamás
  //                          (Cliente potencial, Programar, Compra,
  //                          Contacto en Thank You Page).
  //                false -> dedup solo dentro de la sesión/click
  //                          (sessionStorage / guardas en memoria).
  // ============================================================
  var EVENTS = {
    page_view: {
      label: "Page View",
      meta: { name: "PageView", type: "standard" },
      ga4: "page_view",
      ttq: "ViewContent",
      persistent: false
    },
    interesado_reunion: {
      label: "Interesado en reunion",
      // No usamos "Lead" estándar aquí a propósito: un clic es solo
      // INTENCIÓN, todavía no hay una reunión agendada. Reservamos
      // "Lead" para "Cliente potencial" (la reunión ya agendada en
      // Cal), que es la conversión real. Así no se infla el Lead.
      meta: { name: "InteresadoReunion", type: "custom" },
      ga4: "interesado_reunion",
      ttq: "ClickButton",
      persistent: false
    },
    cliente_potencial: {
      label: "Cliente potencial",
      meta: { name: "Lead", type: "standard" },
      ga4: "generate_lead",
      ttq: "SubmitForm",
      persistent: true // no se debe duplicar aunque recarguen la Thank You Page
    },
    contacto: {
      label: "Contacto",
      meta: { name: "Contact", type: "standard" },
      ga4: "contacto",
      ttq: "Contact",
      persistent: true
    },
    programar: {
      label: "Programar",
      meta: { name: "Schedule", type: "standard" },
      ga4: "programar_sesion",
      ttq: "Schedule",
      persistent: true
    },
    inicio_compra: {
      label: "Inicio compra",
      meta: { name: "InitiateCheckout", type: "standard" },
      ga4: "begin_checkout",
      ttq: "InitiateCheckout",
      persistent: true
    },
    compra: {
      label: "Compra",
      meta: { name: "Purchase", type: "standard" },
      ga4: "purchase",
      ttq: "CompletePayment",
      persistent: true,
      requiresValue: true // CAPI necesita value + currency para que sirva de algo
    },
    vio_portafolio: {
      label: "Vio portafolio",
      meta: { name: "VioPortafolio", type: "custom" },
      ga4: "vio_portafolio",
      ttq: "ViewContent",
      persistent: false
    },
    ver_blog: {
      label: "Ver blog",
      meta: { name: "VerBlog", type: "custom" },
      ga4: "ver_blog",
      ttq: "ViewContent",
      persistent: false
    },
    inicio_blog: {
      label: "Inició en blog",
      meta: { name: "InicioEnBlog", type: "custom" },
      ga4: "inicio_en_blog",
      ttq: "ViewContent",
      persistent: false
    }
  };

  // ============================================================
  // 2. UTILIDADES
  // ============================================================
  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0,
        v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getCookie(name) {
    var match = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
    return match ? decodeURIComponent(match.pop()) : "";
  }

  function log() {
    if (CONFIG.DEBUG && window.console) {
      console.log.apply(console, ["[MF tracking]"].concat(Array.prototype.slice.call(arguments)));
    }
  }

  // Dedup: ¿ya se disparó esta acción antes?
  // key incluye el nombre del evento + un identificador de referencia
  // opcional (uid de reserva en Cal, order_id de pago, etc.) para que
  // dos conversiones DISTINTAS del mismo tipo (dos bodas distintas)
  // sí cuenten, pero la MISMA conversión nunca cuente dos veces.
  var memoryGuard = {}; // bloquea doble-disparo dentro del mismo ciclo de ejecución
  function alreadyFired(storageKey, persistent) {
    if (memoryGuard[storageKey]) return true;
    var store = persistent ? window.localStorage : window.sessionStorage;
    try {
      return !!(store && store.getItem(storageKey));
    } catch (e) {
      return false;
    }
  }
  function markFired(storageKey, persistent) {
    memoryGuard[storageKey] = true;
    var store = persistent ? window.localStorage : window.sessionStorage;
    try {
      if (store) store.setItem(storageKey, "1");
    } catch (e) {
      /* modo incógnito sin storage: seguimos igual, solo pierde persistencia entre recargas */
    }
  }

  // ============================================================
  // 3. DISPATCH A CADA PLATAFORMA
  // ============================================================
  function sendMetaPixel(def, eventId, customData) {
    if (!CONFIG.META_PIXEL_ID || typeof window.fbq !== "function") return;
    var method = def.meta.type === "standard" ? "track" : "trackCustom";
    window.fbq(method, def.meta.name, customData || {}, { eventID: eventId });
  }

  function sendGA4(def, customData) {
    if (!CONFIG.GA4_ID || typeof window.gtag !== "function") return;
    window.gtag("event", def.ga4, customData || {});
  }

  function sendTikTok(def, customData) {
    if (!CONFIG.TIKTOK_PIXEL_ID || typeof window.ttq === "undefined") return;
    window.ttq.track(def.ttq, customData || {});
  }

  function sendCAPI(def, eventId, customData) {
    if (!CONFIG.CAPI_ENDPOINT) return;
    var payload = {
      event_id: eventId,
      event_name: def.meta.name,
      event_type: def.meta.type, // "standard" | "custom"
      event_source_url: window.location.href,
      referrer: document.referrer || "",
      fbp: getCookie("_fbp"),
      fbc: getCookie("_fbc"),
      custom_data: customData || {}
    };
    // sendBeacon para que el evento salga aunque el usuario ya esté
    // navegando a WhatsApp/Cal (no bloquea, no se pierde al salir de la página)
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        navigator.sendBeacon(CONFIG.CAPI_ENDPOINT, blob);
        return;
      }
    } catch (e) {}
    fetch(CONFIG.CAPI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function () {});
  }

  // ============================================================
  // 4. FUNCIÓN CENTRAL — MF.track(eventKey, options)
  //    options: { refId, value, currency, contentName, contentCategory, source }
  // ============================================================
  function track(eventKey, options) {
    var def = EVENTS[eventKey];
    if (!def) {
      log("Evento no reconocido, ignorado (no está en el embudo):", eventKey);
      return;
    }
    options = options || {};

    var dedupKey = "mf_evt_" + eventKey + (options.refId ? "_" + options.refId : "");
    if (alreadyFired(dedupKey, def.persistent)) {
      log("Bloqueado por dedup (ya se había disparado):", def.label, dedupKey);
      return;
    }

    if (def.requiresValue && (options.value === undefined || options.value === null)) {
      log("AVISO: " + def.label + " se disparó sin 'value'. Meta necesita value+currency para optimizar por precio.");
    }

    var eventId = options.eventId || uuid(); // mismo eventId va al Pixel y a la CAPI -> dedup en Meta
    var customData = {
      value: options.value,
      currency: options.value !== undefined ? options.currency || CONFIG.CURRENCY_DEFAULT : undefined,
      content_name: options.contentName,
      content_category: options.contentCategory,
      source: options.source
    };

    markFired(dedupKey, def.persistent);

    sendMetaPixel(def, eventId, customData);
    sendGA4(def, customData);
    sendTikTok(def, customData);
    sendCAPI(def, eventId, customData);

    log("Disparado:", def.label, "(" + def.meta.name + ")", customData);
  }

  // ============================================================
  // 5. AUTO-BINDING declarativo: data-mf-event="clave" en cualquier elemento
  // ============================================================
  function bindDeclarativeElements() {
    var els = document.querySelectorAll("[data-mf-event]");
    els.forEach(function (el) {
      if (el.__mfBound) return; // evita doble-bind si tracking.js se re-ejecuta
      el.__mfBound = true;
      el.addEventListener("click", function () {
        var key = el.getAttribute("data-mf-event");
        var value = el.getAttribute("data-mf-value");
        track(key, {
          value: value !== null ? parseFloat(value) : undefined,
          currency: el.getAttribute("data-mf-currency") || undefined,
          contentName: el.getAttribute("data-mf-content") || undefined,
          contentCategory: el.getAttribute("data-mf-category") || undefined,
          source: el.getAttribute("data-mf-source") || undefined
        });
      });
    });
  }

  // ============================================================
  // 6. INIT AUTOMÁTICO
  // ============================================================
  function init() {
    // Page View — una vez por carga real de página (no deduped entre
    // sesiones a propósito: cada visita SÍ debe contar como PageView)
    track("page_view");

    bindDeclarativeElements();

    // Atribución de blog: si alguien llega a la landing viniendo de un
    // artículo del blog, se dispara "Inició en blog" (una vez por sesión)
    var cameFromBlog = /\/blog\//.test(document.referrer) || /[?&]src=blog\b/.test(window.location.search);
    if (cameFromBlog && document.body && document.body.getAttribute("data-mf-page") === "landing") {
      track("inicio_blog");
    }

    // Página de artículo de blog: dispara "Ver blog" automáticamente si
    // el <body> trae data-mf-blog-slug="nombre-del-articulo"
    if (document.body && document.body.hasAttribute("data-mf-blog-slug")) {
      track("ver_blog", { contentName: document.body.getAttribute("data-mf-blog-slug") });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Re-bindear si se inyecta contenido dinámico más tarde (por si acaso)
  window.MF = window.MF || {};
  window.MF.track = track;
  window.MF.rebind = bindDeclarativeElements;
  window.MF.EVENTS = EVENTS;
})(window, document);
