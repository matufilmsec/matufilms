/* ============================================================
   MatuFilms — lib/planes.mjs
   Única fuente de verdad de los planes que se muestran en los
   enlaces personalizados (/p/...). Los precios viven aquí, en el
   servidor, y no en el HTML: cada prospecto recibe solo los de su
   tarifa.

   TARIFAS
     A -> tarifa base
     B -> un nivel por encima de la base
   Los planes se llaman igual en ambas; solo cambia el precio.
   ============================================================= */

export const CAL_URL = "https://cal.com/matufilms/reunion";
export const WHATSAPP = "593987638921";

export const PLANES = [
  {
    id: "amore",
    nombre: "Amore",
    horas: 12,
    destacado: true,
    incluye: [
      "Cobertura de hasta 12 horas continuas",
      "Película cinemática extensa + teaser para redes",
      "Tomas aéreas y sesión pre-boda incluidas",
      "Book impreso con las fotos que ustedes elijan"
    ]
  },
  {
    id: "ulala",
    nombre: "Ulalá",
    horas: 9,
    destacado: false,
    incluye: [
      "Cobertura de hasta 9 horas",
      "Película con enfoque editorial",
      "Teaser cinemático para redes",
      "Book impreso incluido"
    ]
  },
  {
    id: "cielito",
    nombre: "Cielito",
    horas: 8,
    destacado: false,
    incluye: [
      "Cobertura de hasta 8 horas",
      "Galería digital con cientos de fotos",
      "Teaser cinemático para redes"
    ]
  }
];

export const TARIFAS = {
  A: { amore: 1590, ulala: 1390, cielito: 1190 },
  B: { amore: 1890, ulala: 1590, cielito: 1390 }
};

export function planesParaTarifa(tarifa) {
  const precios = TARIFAS[tarifa] || TARIFAS.A;
  return PLANES.map((p) => ({ ...p, precio: precios[p.id] }));
}
