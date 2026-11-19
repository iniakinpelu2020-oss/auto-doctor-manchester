/* Auto Doctor Manchester - interactive hero centerpiece
   - spring-damped cursor tracking (rotateX / rotateY + layered parallax)
   - scroll-linked parallax tilt (window.scrollY)
   - touch-drag with increased sensitivity on coarse pointers
   - pointer-following spotlight behind the car
   - reduced-motion: no JS transforms
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
  if (reduceMotion) return;

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

  const clamp = (v, min = -1, max = 1) => Math.max(min, Math.min(max, v));

  let targetX = 0;
  let targetY = 0;
  let curX = 0;
  let curY = 0;
  let velX = 0;
  let velY = 0;
  let raf = null;
  let onScreen = true;

  let scrollX = 0;
  let scrollYTarget = 0;
  let dragging = false;
  let dragPointerId = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragBaseX = 0;
  let dragBaseY = 0;

  /* ---------- scroll-linked tilt ---------- */

  const updateScrollTarget = () => {
    const y = window.scrollY || window.pageYOffset || 0;
    const h = Math.max(hero.offsetHeight || 1, 1);
    // progress as the hero scrolls out of view
    const p = clamp(y / (h * 0.85), 0, 1.4);
    // tilt forward and add a gentle yaw as you scroll down
    scrollYTarget = p * 0.55;
    scrollX = p * -0.18;
    if (!dragging && !finePointer) {
      targetX = scrollX;
      targetY = scrollYTarget;
    } else if (!dragging && finePointer) {
      // on desktop, blend scroll in lightly so mouse still dominates feel
      // (mouse move will overwrite; on leave we return to scroll baseline)
    }
  };

  window.addEventListener("scroll", updateScrollTarget, { passive: true });
  updateScrollTarget();

  /* ---------- spotlight helper ---------- */

  const moveSpotToClient = (clientX, clientY) => {
    if (!spot) return;
    const box = stage.getBoundingClientRect();
    const px = ((clientX - box.left) / box.width - 0.5) * 2;
    const py = ((clientY - box.top) / box.height - 0.5) * 2;
    spot.style.left = `${50 + clamp(px) * 32}%`;
    spot.style.top = `${50 + clamp(py) * 30}%`;
    spot.style.opacity = "1";
  };

  /* ---------- fine pointer (desktop hover) ---------- */

  if (finePointer) {
    const move = (event) => {
      const rect = hero.getBoundingClientRect();
      targetX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1 + scrollX * 0.35);
      targetY = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1 + scrollYTarget);
      moveSpotToClient(event.clientX, event.clientY);
    };

    const reset = () => {
      targetX = scrollX * 0.35;
      targetY = scrollYTarget;
    };

    hero.addEventListener("pointermove", move, { passive: true });
    hero.addEventListener("pointerleave", reset, { passive: true });
    window.addEventListener("blur", reset);
  }

  /* ---------- touch / coarse drag (high sensitivity) ---------- */

  if (coarsePointer) {
    // JS will drive transforms; disable CSS idle animations to avoid fighting
    inner.style.animation = "none";
    if (spot) spot.style.animation = "none";
    stage.classList.add("js-active");

    const onDown = (event) => {
      if (event.pointerType === "mouse") return;
      dragging = true;
      dragPointerId = event.pointerId;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragBaseX = targetX;
      dragBaseY = targetY;
      moveSpotToClient(event.clientX, event.clientY);
      if (stage.setPointerCapture) {
        try { stage.setPointerCapture(event.pointerId); } catch (_) {}
      }
    };

    const onMove = (event) => {
      if (!dragging || event.pointerId !== dragPointerId) return;
      const rect = stage.getBoundingClientRect();
      const w = Math.max(rect.width, 1);
      const h = Math.max(rect.height, 1);
      const dx = (event.clientX - dragStartX) / w;
      const dy = (event.clientY - dragStartY) / h;
      // high sensitivity so even a slight swipe visibly rotates the car
      const sensitivity = 3.2;
      targetX = clamp(dragBaseX + dx * sensitivity, -1.3, 1.3);
      targetY = clamp(dragBaseY + dy * sensitivity * 1.6, -1.1, 1.3);
      moveSpotToClient(event.clientX, event.clientY);
    };

    const onUp = (event) => {
      if (event.pointerId !== dragPointerId) return;
      dragging = false;
      dragPointerId = null;
      // ease back toward the current scroll baseline
      targetX = scrollX;
      targetY = scrollYTarget;
      if (stage.releasePointerCapture) {
        try { stage.releasePointerCapture(event.pointerId); } catch (_) {}
      }
    };

    stage.addEventListener("pointerdown", onDown, { passive: true });
    stage.addEventListener("pointermove", onMove, { passive: true });
    stage.addEventListener("pointerup", onUp, { passive: true });
    stage.addEventListener("pointercancel", onUp, { passive: true });

    // when not dragging, keep targets following scroll
    const syncScroll = () => {
      if (!dragging) {
        targetX = scrollX;
        targetY = scrollYTarget;
      }
    };
    window.addEventListener("scroll", syncScroll, { passive: true });
  }

  /* ---------- spring loop ---------- */

  const K = 0.075; // stiffness
  const D = 0.8; // damping

  const render = () => {
    velX = (velX + (targetX - curX) * K) * D;
    velY = (velY + (targetY - curY) * K) * D;
    curX += velX;
    curY += velY;

    inner.style.transform = `rotateX(${(-curY * 6).toFixed(2)}deg) rotateY(${(curX * 10).toFixed(2)}deg)`;

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

  // ensure initial scroll state is applied
  updateScrollTarget();
  start();
})();
