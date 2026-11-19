/**
 * Cloudflare Pages Function - POST /api/booking
 *
 * Verifies the Cloudflare Turnstile token server-side, then forwards the
 * enquiry to BOOKING_WEBHOOK_URL (Formspree, Zapier, Make, Slack webhook, or
 * any endpoint that accepts JSON) when that variable is configured.
 *
 * Environment variables (Cloudflare Pages -> Settings -> Environment variables):
 *   TURNSTILE_SECRET_KEY  required - from the Turnstile dashboard
 *   BOOKING_WEBHOOK_URL   optional - where to deliver the enquiry
 *   TURNSTILE_HOSTNAMES   optional - comma-separated extra allowed hostnames
 */

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_LENGTH = 1200;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

const clean = (value, max = MAX_LENGTH) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function onRequestPost({ request, env }) {
  // Only same-site JSON submissions are accepted.
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "Unsupported content type." }, 415);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  const name = clean(payload.name, 120);
  const phone = clean(payload.phone, 40);
  const vehicle = clean(payload.vehicle, 120);
  const issue = clean(payload.issue, MAX_LENGTH);
  const token = clean(payload.turnstileToken, 3000);

  if (!name || !phone || !vehicle || !issue) {
    return json({ ok: false, error: "Please complete every field." }, 422);
  }

  if (!/^[0-9+()\s.-]{7,40}$/.test(phone)) {
    return json({ ok: false, error: "That phone number doesn't look right." }, 422);
  }

  if (!token) {
    return json({ ok: false, error: "Security check missing." }, 400);
  }

  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not configured");
    return json({ ok: false, error: "Booking form is not configured yet." }, 503);
  }

  // --- Verify Turnstile ---
  const verifyBody = new URLSearchParams({
    secret,
    response: token,
    remoteip: request.headers.get("CF-Connecting-IP") || "",
  });

  let verifyResult;
  try {
    const verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: verifyBody,
    });
    verifyResult = await verifyResponse.json();
  } catch (error) {
    console.error("Turnstile verification failed", error);
    return json({ ok: false, error: "Could not verify the security check." }, 502);
  }

  if (!verifyResult.success) {
    return json({ ok: false, error: "Security check failed. Please try again." }, 403);
  }

  // Optional hostname allowlist, in addition to the Turnstile dashboard settings.
  const extraHosts = (env.TURNSTILE_HOSTNAMES || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  if (extraHosts.length && verifyResult.hostname && !extraHosts.includes(verifyResult.hostname)) {
    return json({ ok: false, error: "Security check failed." }, 403);
  }

  const enquiry = {
    name,
    phone,
    vehicle,
    issue,
    source: "autodoctormanchester.com",
    submittedAt: new Date().toISOString(),
    page: clean(payload.page, 300),
  };

  const webhook = env.BOOKING_WEBHOOK_URL;
  if (webhook) {
    try {
      const forwarded = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(enquiry),
      });
      if (!forwarded.ok) {
        console.error("Booking webhook responded", forwarded.status);
        return json({ ok: false, error: "Could not deliver the enquiry." }, 502);
      }
    } catch (error) {
      console.error("Booking webhook error", error);
      return json({ ok: false, error: "Could not deliver the enquiry." }, 502);
    }
  } else {
    // No webhook configured: the enquiry is only logged. Set BOOKING_WEBHOOK_URL
    // before going live so no leads are lost.
    console.log("Booking enquiry (no webhook configured)", JSON.stringify(enquiry));
  }

  return json({ ok: true });
}

export async function onRequestGet() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}
