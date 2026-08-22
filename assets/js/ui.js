/* ============================================================
   MatuFilms — ui.js
   Comportamiento visual compartido (NO tracking): año en footer,
   animaciones de "reveal" al hacer scroll, y el dial de la sección
   de proceso. Se carga en todas las páginas; cada bloque revisa si
   el elemento existe antes de tocarlo, así que no rompe nada en
   páginas que no lo usan (blog, recursos, thank you pages).
   ============================================================= */

document.addEventListener("DOMContentLoaded", function () {
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  var els = document.querySelectorAll(".reveal");
  if (els.length) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 }
      );
      els.forEach(function (el) {
        io.observe(el);
      });
    } else {
      els.forEach(function (el) {
        el.classList.add("is-visible");
      });
    }
  }

  var dial = document.getElementById("dialBlock");
  if (dial) {
    if ("IntersectionObserver" in window) {
      var dialIo = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              dial.classList.add("in-view");
              dialIo.unobserve(dial);
            }
          });
        },
        { threshold: 0.4 }
      );
      dialIo.observe(dial);
    } else {
      dial.classList.add("in-view");
    }
  }
});
