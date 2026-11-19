/* Auto Doctor Manchester - interactions
   - sticky header state
   - accessible mobile menu
   - scroll-reveal (IntersectionObserver, respects reduced motion)
   - booking form submit with Cloudflare Turnstile token
*/
(() => {
  "use strict";

  /* ---------- Header scroll state ---------- */
  const header = document.getElementById("siteHeader");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Mobile menu ---------- */
  const navToggle = document.getElementById("navToggle");
  const nav = document.getElementById("primaryNav");

  if (navToggle && nav) {
    const closeNav = () => {
      nav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "Open menu");
    };

    navToggle.addEventListener("click", () => {
      const open = navToggle.getAttribute("aria-expanded") === "true";
      if (open) {
        closeNav();
      } else {
        nav.classList.add("is-open");
        navToggle.setAttribute("aria-expanded", "true");
        navToggle.setAttribute("aria-label", "Close menu");
      }
    });

    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) closeNav();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeNav();
    });

    document.addEventListener("click", (e) => {
      if (!nav.contains(e.target) && !navToggle.contains(e.target)) closeNav();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 880) closeNav();
    });
  }

  /* ---------- Scroll reveal ---------- */
  const revealItems = document.querySelectorAll(".reveal");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (revealItems.length) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealItems.forEach((el) => el.classList.add("is-visible"));
    } else {
      document.documentElement.classList.add("reveal-ready");
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
      );
      revealItems.forEach((el) => observer.observe(el));
    }
  }

  /* ---------- Footer year ---------- */
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Booking form ---------- */
  const form = document.getElementById("bookingForm");
  if (!form) return;

  const statusEl = document.getElementById("formStatus");
  const successEl = document.getElementById("formSuccess");
  const submitBtn = document.getElementById("submitBtn");

  const setStatus = (message, ok = false) => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle("ok", ok);
  };

  const markInvalid = (field, invalid) => {
    field.setAttribute("aria-invalid", invalid ? "true" : "false");
  };

  form.querySelectorAll("input, textarea").forEach((field) => {
    field.addEventListener("input", () => {
      if (field.getAttribute("aria-invalid") === "true") markInvalid(field, false);
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("");

    const data = new FormData(form);
    const fields = ["name", "phone", "vehicle", "issue"];
    let firstInvalid = null;

    fields.forEach((name) => {
      const field = form.elements[name];
      const valid = field && field.value.trim().length >= 2;
      if (field) markInvalid(field, !valid);
      if (!valid && !firstInvalid) firstInvalid = field;
    });

    if (firstInvalid) {
      setStatus("Please fill in every field so we can call you back.");
      firstInvalid.focus();
      return;
    }

    const token = data.get("cf-turnstile-response");
    if (window.turnstile && !token) {
      setStatus("Please tick the quick security check just above the button.");
      return;
    }

    submitBtn.classList.add("is-loading");
    submitBtn.setAttribute("aria-busy", "true");

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") || "").trim(),
          phone: String(data.get("phone") || "").trim(),
          vehicle: String(data.get("vehicle") || "").trim(),
          issue: String(data.get("issue") || "").trim(),
          turnstileToken: token || "",
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Request failed");
      }

      form.hidden = true;
      if (successEl) {
        successEl.hidden = false;
        successEl.focus?.();
      }
      form.reset();
      if (window.turnstile) window.turnstile.reset();
    } catch (error) {
      setStatus(
        "We couldn't send that just now. Please call us on +44 7446 906192 and we'll sort it straight away."
      );
      if (window.turnstile) window.turnstile.reset();
    } finally {
      submitBtn.classList.remove("is-loading");
      submitBtn.removeAttribute("aria-busy");
    }
  });
})();
