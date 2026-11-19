/* Auto Doctor Manchester - interactive hero centerpiece
   - spring-damped cursor tracking (rotateX / rotateY + layered parallax)
   - pointer-following spotlight behind the car
   - touch / reduced-motion fallbacks (CSS idle float, no JS transform)
*/
(() => {
  "use strict";

  const stage = document.getElementById("heroStage");
  if (!stage) return;

  const hero = stage.closest(".hero");
  const spot = stage.querySelector(".stage-spot");
  const word = stage.querySelector(".stage-wordmark");
  const inner = stage.querySelector(".stage-3d");
  const carLayer = stage.querySelector(".layer-car");
  const hudLayer = stage.querySelector(".layer-hud");
  const chipLayer = stage.querySelector(".layer-chips");
  if (!hero || !inner) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasPointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (reduceMotion) return;

  const clamp = (v) => Math.max(-1, Math.min(1, v));

  let targetX = 0;
  let targetY = 0;
  let curX = 0;
  let curY = 0;
  let velX = 0;
  let velY = 0;
  let raf = null;
  let onScreen = true;

  /* ---------- pointer tracking ---------- */

  if (hasPointer) {
    const move = (event) => {
      const rect = hero.getBoundingClientRect();
      targetX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1);
      targetY = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1);

      if (spot) {
        const box = stage.getBoundingClientRect();
        const px = ((event.clientX - box.left) / box.width - 0.5) * 2;
        const py = ((event.clientY - box.top) / box.height - 0.5) * 2;
        spot.style.left = `${50 + clamp(px) * 32}%`;
        spot.style.top = `${50 + clamp(py) * 30}%`;
        spot.style.opacity = "1";
      }
    };

    const reset = () => {
      targetX = 0;
      targetY = 0;
    };

    hero.addEventListener("pointermove", move, { passive: true });
    hero.addEventListener("pointerleave", reset, { passive: true });
    window.addEventListener("blur", reset);
  }

  /* ---------- spring loop ---------- */

  const K = 0.075; // stiffness
  const D = 0.8; // damping

  const render = () => {
    velX = (velX + (targetX - curX) * K) * D;
    velY = (velY + (targetY - curY) * K) * D;
    curX += velX;
    curY += velY;

    inner.style.transform = `rotateX(${(-curY * 5).toFixed(2)}deg) rotateY(${(curX * 9).toFixed(2)}deg)`;

    if (carLayer) {
      carLayer.style.transform = `translate3d(${(curX * 16).toFixed(1)}px, ${(curY * 10).toFixed(1)}px, 40px)`;
    }
    if (hudLayer) {
      hudLayer.style.transform = `translate3d(${(curX * -20).toFixed(1)}px, ${(curY * -13).toFixed(1)}px, -20px)`;
    }
    if (chipLayer) {
      chipLayer.style.transform = `translate3d(${(curX * 32).toFixed(1)}px, ${(curY * 20).toFixed(1)}px, 70px)`;
    }
    if (word) {
      word.style.transform = `translate(-50%, -50%) translate3d(${(curX * -14).toFixed(1)}px, ${(curY * -8).toFixed(1)}px, -60px)`;
    }

    raf = onScreen && !document.hidden ? requestAnimationFrame(render) : null;
  };

  const start = () => {
    if (!raf) raf = requestAnimationFrame(render);
  };

  /* ---------- pause when off screen / tab hidden ---------- */

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          onScreen = entry.isIntersecting;
          if (onScreen) start();
        });
      },
      { threshold: 0 }
    ).observe(stage);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) start();
  });

  start();
})();
