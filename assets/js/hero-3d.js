/* Auto Doctor Manchester - interactive hero centerpiece
   - spring-damped cursor tracking on desktop (rotateX / rotateY + layered parallax)
   - touch drag/swipe directly on the model: pointer events (touchmove fallback for
     older Safari) with touch-action: pan-y, so vertical swipes still scroll the page
     while horizontal drags rotate and tilt the car in real time
   - subtle DeviceOrientation (gyroscope) tilt on phones: shifts the perspective and
     the spotlight/light reflection; asks for permission on iOS from a real gesture
   - momentum spring return on release plus a gentle idle float when untouched
   - pauses off screen / in a hidden tab; no JS transforms at all under reduced motion
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
  const carImg = stage.querySelector(".layer-car img");
  if (!hero || !inner) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const touchDevice = window.matchMedia("(hover: none), (pointer: coarse)").matches;

  // JS owns the transforms from here. Inline styles beat the stylesheet, so this
  // stops the CSS-only idle float on touch devices (which would override them).
  inner.style.animation = "none";
  if (spot) {
    spot.style.animation = "none";
    spot.style.transition = "none";
  }
  if (carImg) {
    carImg.style.userSelect = "none";
    carImg.style.webkitUserSelect = "none";
    carImg.style.webkitTouchCallout = "none";
  }

  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const SPRING_K = 0.08; // stiffness of the return spring
  const SPRING_D = 0.82; // damping - keeps a hint of momentum, no bouncing
  const MAX_YAW = touchDevice ? 13 : 9; // rotateY in degrees at full tilt
  const MAX_PITCH = touchDevice ? 8 : 5; // rotateX in degrees at full tilt

  let curX = 0;
  let curY = 0;
  let velX = 0;
  let velY = 0;
  let dragX = 0;
  let dragY = 0;
  let hoverX = 0;
  let hoverY = 0;
  let hoverSpotX = 0;
  let hoverSpotY = 0;
  let hovering = false;
  let activeDrag = null;
  let idleWeight = 1;
  let raf = null;
  let onScreen = true;

  let stageW = 1;
  let stageH = 1;

  let spotX = 0;
  let spotY = 0;
  let spotGlow = 0.75;

  /* ---------- gyroscope ---------- */

  let gyroX = 0;
  let gyroY = 0;
  let gyroTargetX = 0;
  let gyroTargetY = 0;
  let gyroBaseline = null;
  let gyroListening = false;
  let gyroSeen = false;
  let lastGyroAt = 0;

  const onOrientation = (event) => {
    if (event.beta == null && event.gamma == null) return;
    const beta = Number.isFinite(event.beta) ? event.beta : 0;
    const gamma = Number.isFinite(event.gamma) ? event.gamma : 0;
    // Calibrate against the phone's resting hold so the effect is a gentle lean,
    // never a sudden jump when the first reading arrives.
    if (!gyroBaseline) gyroBaseline = { beta, gamma };
    gyroSeen = true;
    lastGyroAt = performance.now();
    gyroTargetX = clamp((gamma - gyroBaseline.gamma) / 24);
    gyroTargetY = clamp((beta - gyroBaseline.beta) / 28);
    start();
  };

  const attachGyro = () => {
    if (gyroListening) return;
    gyroListening = true;
    window.addEventListener("deviceorientation", onOrientation, { passive: true });
  };

  const startGyro = () => {
    if (!touchDevice || gyroListening) return;
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) return;

    // iOS 13+ needs an explicit permission prompt from a user gesture.
    if (typeof DOE.requestPermission === "function") {
      try {
        DOE.requestPermission().then((state) => {
          if (state === "granted") attachGyro();
        }).catch(() => {});
      } catch (err) {
        /* not in a gesture yet - retried on the next touch */
      }
      return;
    }

    attachGyro();
  };

  // Android and other browsers need no prompt, so start straight away.
  if (touchDevice && window.DeviceOrientationEvent &&
      typeof window.DeviceOrientationEvent.requestPermission !== "function") {
    startGyro();
  }

  window.addEventListener("orientationchange", () => {
    gyroBaseline = null;
  });

  /* ---------- measurements ---------- */

  const measure = () => {
    const box = stage.getBoundingClientRect();
    stageW = box.width || 1;
    stageH = box.height || 1;
  };

  measure();
  window.addEventListener("resize", measure, { passive: true });
  window.addEventListener("orientationchange", measure, { passive: true });

  /* ---------- drag (touch, pen, mouse) ---------- */

  const applyDrag = (dx, dy) => {
    if (!dx && !dy) return;
    dragX = clamp(dragX + dx / Math.max(140, stageW * 0.5));
    dragY = clamp(dragY + dy / Math.max(90, stageH * 0.62));
    start();
  };

  const beginDrag = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (activeDrag) return;
    activeDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    stage.classList.add("is-dragging");
    idleWeight = 0;
    startGyro(); // must be called from a real gesture (iOS permission prompt)
    start();
  };

  const moveDrag = (event) => {
    if (!activeDrag || event.pointerId !== activeDrag.id) return;
    const dx = event.clientX - activeDrag.x;
    const dy = event.clientY - activeDrag.y;
    if (!dx && !dy) return;
    activeDrag.x = event.clientX;
    activeDrag.y = event.clientY;
    applyDrag(dx, dy);
  };

  const endDrag = () => {
    if (!activeDrag) return;
    activeDrag = null;
    stage.classList.remove("is-dragging");
    // Let the spring carry the rotation home (with the drag's momentum).
    dragX = 0;
    dragY = 0;
    start();
  };

  if (window.PointerEvent) {
    stage.addEventListener("pointerdown", beginDrag, { passive: true });
    window.addEventListener("pointermove", moveDrag, { passive: true });
    window.addEventListener("pointerup", endDrag, { passive: true });
    window.addEventListener("pointercancel", endDrag, { passive: true });
  } else {
    // Fallback for browsers without Pointer Events (older iOS Safari).
    stage.addEventListener("touchstart", (event) => {
      if (activeDrag || !event.touches.length) return;
      const touch = event.touches[0];
      activeDrag = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
      stage.classList.add("is-dragging");
      idleWeight = 0;
      start();
    }, { passive: true });

    stage.addEventListener("touchmove", (event) => {
      if (!activeDrag) return;
      let touch = null;
      for (let i = 0; i < event.touches.length; i += 1) {
        if (event.touches[i].identifier === activeDrag.id) touch = event.touches[i];
      }
      if (!touch) return;
      const dx = touch.clientX - activeDrag.x;
      const dy = touch.clientY - activeDrag.y;
      if (!dx && !dy) return;
      activeDrag.x = touch.clientX;
      activeDrag.y = touch.clientY;
      applyDrag(dx, dy);
    }, { passive: true });

    const endTouch = (event) => {
      if (!activeDrag) return;
      for (let i = 0; i < event.changedTouches.length; i += 1) {
        if (event.changedTouches[i].identifier !== activeDrag.id) continue;
        endDrag();
      }
    };
    stage.addEventListener("touchend", endTouch, { passive: true });
    stage.addEventListener("touchcancel", endTouch, { passive: true });
  }

  if (carImg) {
    carImg.setAttribute("draggable", "false");
    carImg.addEventListener("dragstart", (event) => event.preventDefault());
  }

  /* ---------- desktop hover tracking ---------- */

  const trackHover = (event) => {
    if (!finePointer || activeDrag) return;
    const rect = hero.getBoundingClientRect();
    hoverX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1);
    hoverY = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1);

    if (spot) {
      const box = stage.getBoundingClientRect();
      hoverSpotX = clamp(((event.clientX - box.left) / box.width - 0.5) * 2);
      hoverSpotY = clamp(((event.clientY - box.top) / box.height - 0.5) * 2);
    }
    hovering = true;
  };

  const resetHover = () => {
    hovering = false;
    hoverX = 0;
    hoverY = 0;
    hoverSpotX = 0;
    hoverSpotY = 0;
  };

  if (finePointer) {
    hero.addEventListener("pointermove", trackHover, { passive: true });
    hero.addEventListener("pointerleave", resetHover, { passive: true });
  }

  window.addEventListener("blur", () => {
    endDrag();
    resetHover();
  });

  /* ---------- spring + idle float render loop ---------- */

  const render = (now) => {
    const t = now * 0.001;

    // Gyroscope: ease towards the latest tilt, drift home if the sensor stops.
    if (gyroSeen && now - lastGyroAt > 1200) {
      gyroTargetX = 0;
      gyroTargetY = 0;
      gyroSeen = false;
    }
    gyroX = lerp(gyroX, gyroTargetX, 0.06);
    gyroY = lerp(gyroY, gyroTargetY, 0.06);
    const gyroMag = Math.min(1, Math.hypot(gyroX, gyroY));

    if (activeDrag) {
      // Real-time tracking under the finger, with the frame delta kept as momentum.
      const prevX = curX;
      const prevY = curY;
      curX = lerp(curX, dragX, 0.42);
      curY = lerp(curY, dragY, 0.42);
      velX = curX - prevX;
      velY = curY - prevY;
    } else {
      // Spring back to centre (or to the desktop cursor) when released.
      const targetX = hovering && finePointer ? hoverX * 0.85 : 0;
      const targetY = hovering && finePointer ? hoverY * 0.85 : 0;
      velX = (velX + (targetX - curX) * SPRING_K) * SPRING_D;
      velY = (velY + (targetY - curY) * SPRING_K) * SPRING_D;
      curX += velX;
      curY += velY;
    }

    // Idle float: always drifting gently, damped while the phone is being tilted.
    const idleTarget = activeDrag ? 0 : 1 - gyroMag * 0.55;
    idleWeight = lerp(idleWeight, idleTarget, activeDrag ? 0.25 : 0.03);

    const floatYaw = Math.sin(t * 0.42 + 1.1) * 3.2 * idleWeight;
    const floatPitch = Math.sin(t * 0.55) * 1.4 * idleWeight;
    const floatLift = Math.sin(t * 0.8 + 0.4) * 5 * idleWeight;

    // Combined drag / hover / gyro state drives the scene.
    const tx = clamp(curX + gyroX * 0.55);
    const ty = clamp(curY + gyroY * 0.55);

    inner.style.transform =
      `translate3d(0, ${floatLift.toFixed(1)}px, 0) ` +
      `rotateX(${(-ty * MAX_PITCH + floatPitch).toFixed(2)}deg) ` +
      `rotateY(${(tx * MAX_YAW + floatYaw).toFixed(2)}deg)`;

    if (carLayer) {
      carLayer.style.transform = `translate3d(${(tx * 16).toFixed(1)}px, ${(ty * 10).toFixed(1)}px, 40px)`;
    }
    if (hudLayer) {
      hudLayer.style.transform = `translate3d(${(tx * -20).toFixed(1)}px, ${(ty * -13).toFixed(1)}px, -20px)`;
    }
    if (chipLayer) {
      chipLayer.style.transform = `translate3d(${(tx * 32).toFixed(1)}px, ${(ty * 20).toFixed(1)}px, 70px)`;
    }
    if (word) {
      word.style.transform = `translate(-50%, -50%) translate3d(${(tx * -14).toFixed(1)}px, ${(ty * -8).toFixed(1)}px, -60px)`;
    }

    // Spotlight doubles as the light reflection: it follows the cursor, the drag
    // and the physical phone tilt, and glows a little brighter while in use.
    if (spot) {
      const lightX = hovering ? hoverSpotX : tx * 0.9;
      const lightY = hovering ? hoverSpotY : ty * 0.8;
      spotX = lerp(spotX, lightX, 0.1);
      spotY = lerp(spotY, lightY, 0.1);

      const pulse = 0.5 + 0.5 * Math.sin(t * 0.8);
      const active = activeDrag || hovering || gyroMag > 0.12;
      spotGlow = lerp(spotGlow, active ? 0.95 : 0.62 + pulse * 0.22, 0.06);

      const ox = spotX * stageW * 0.17;
      const oy = spotY * stageH * 0.2;
      spot.style.transform =
        `translate(-50%, -50%) translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0) ` +
        `scale(${(1 + pulse * 0.06 * idleWeight).toFixed(3)})`;
      spot.style.opacity = spotGlow.toFixed(3);
    }

    raf = onScreen && !document.hidden ? requestAnimationFrame(frame) : null;
  };

  function frame(now) {
    render(now);
  }

  function start() {
    if (raf) return;
    raf = requestAnimationFrame(frame);
  }

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
