# Auto Doctor Manchester — website

A single-page marketing site for **Auto Doctor Manchester**, a 5.0-star car repair and
maintenance garage at 124 Longley Ln, Sharston, Wythenshawe, Manchester M22 4SY.

Plain static HTML, CSS and JavaScript — no build step, no framework, no dependencies.

```
index.html                  the whole page
assets/css/styles.css       loads base.css + sections.css
assets/css/base.css         design tokens, buttons, header, hero
assets/css/sections.css     services, reviews, booking, location, footer, motion, responsive
assets/js/main.js           header, mobile menu, scroll reveal, form submit
assets/img/icons.svg        shared icon sprite
assets/img/favicon.svg      favicon
_headers                    Cloudflare Pages security + cache headers
functions/api/booking.js    Pages Function: verifies Turnstile, forwards the enquiry
```

## Deploy to Cloudflare Pages (via GitHub)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**, pick this repo.
2. Framework preset: **None**. Build command: *(leave empty)*. Build output directory: `/`.
3. Deploy. `_headers` and `functions/` are picked up automatically.

Security headers are set in `_headers`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin` and a restrictive `Permissions-Policy`.

## Before going live

**1. Turnstile keys.** The form uses Cloudflare's *test* site key, which always passes.
Create a real widget at **Cloudflare dashboard → Turnstile → Add widget** for your domain
(including the `*.pages.dev` preview domain), then:

- In `index.html`, replace `data-sitekey="1x00000000000000000000AA"` with your site key.
- In Pages → **Settings → Environment variables**, add `TURNSTILE_SECRET_KEY` with your secret key.

**2. Where enquiries go.** Set `BOOKING_WEBHOOK_URL` to any endpoint that accepts a JSON POST —
Formspree, Zapier, Make, a Slack/Discord webhook, or your own API. If it is not set, enquiries are
only written to the Pages Function logs and no lead is delivered.

Optional: `TURNSTILE_HOSTNAMES` — comma-separated extra allowed hostnames.

Server-side safety nets: Turnstile verification, JSON-only same-site requests, field length limits
and phone format validation. No secrets are present in client code.

**3. Adding photos.** There is no photography in the repo yet. Add real workshop photos under
`assets/img/` and use them in the hero panel or a gallery — the layout deliberately works without
images, so nothing breaks in the meantime.

## Content notes

- The three customer quotes are **sample copy** written to show the layout. Swap them for real
  reviews before launch.
- Opening hours, address, phone and the 5.0★ / 158 review figures are exactly as supplied.
- Contact details appear in several places — search for `7446 906192` and `autodoctormcr`.

## Local preview

```bash
python3 -m http.server 4321
# open http://localhost:4321
```

To exercise the booking endpoint locally you need the Pages runtime:

```bash
npx wrangler pages dev . --port 4321
```
