const GIT_BASE =
  "https://raw.githubusercontent.com/brandstack-in/NFC-public/main/templates";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Health check
      if (path === "/") {
        return new Response("NFC Worker is running");
      }

      // CSS
      if (path === "/style.css") {
        const css = await fetchFromGit("style.css");
        return new Response(css, {
          headers: {
            "Content-Type": "text/css; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }

      // Profile page → /u/suresh
      if (path.startsWith("/u/")) {
        const cardId = path.split("/")[2];
        return serveHTML(cardId, env);
      }

      // API → /api/user/suresh
      if (path.startsWith("/api/user/")) {
        const cardId = path.split("/")[3];
        return serveUserJSON(cardId, env);
      }

      // VCF → /vcf/suresh
      if (path.startsWith("/vcf/")) {
        const cardId = path.split("/")[2];
        return serveVCF(cardId, env);
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      return new Response("Worker Error: " + e.message, { status: 500 });
    }
  },
};

/* ---------------- HELPERS ---------------- */

async function fetchFromGit(file) {
  const res = await fetch(`${GIT_BASE}/${file}`);
  if (!res.ok) throw new Error("Git fetch failed: " + file);
  return res.text();
}

/* ---------------- HTML ---------------- */

async function serveHTML(cardId, env) {
  const raw = await env.NFC_USERS.get(`user:${cardId}`);
  if (!raw) return new Response("User not found", { status: 404 });

  const u = JSON.parse(raw);
  let html = await fetchFromGit("index.html");

  html = html
    // TEXT
    .replaceAll("{{NAME}}", u.name || "")
    .replaceAll("{{TITLE}}", u.title || "")
    .replaceAll("{{COMPANY}}", u.company || "")
    .replaceAll("{{PHOTO}}", u.photo || "")

    // BUTTONS
    .replace(
      '<a id="call" class="action-btn">',
      `<a id="call" class="action-btn" href="tel:${u.phone}">`
    )
    .replace(
      '<a id="email" class="action-btn">',
      `<a id="email" class="action-btn" href="mailto:${u.email}">`
    )
    .replace(
      '<a id="whatsapp" class="action-btn">',
      `<a id="whatsapp" class="action-btn" href="https://wa.me/${u.phone.replace(/\D/g, "")}">`
    )
    .replace(
      '<a id="save" class="action-btn primary">',
      `<a id="save" class="action-btn primary" href="/vcf/${cardId}">`
    )

    // SOCIAL ICONS (REGEX SAFE)
    .replace(
      /<a([^>]+)id="instagram"/,
      u.instagram
        ? `<a$1id="instagram" href="${u.instagram}"`
        : `<a$1id="instagram" style="display:none"`
    )
    .replace(
      /<a([^>]+)id="facebook"/,
      u.facebook
        ? `<a$1id="facebook" href="${u.facebook}"`
        : `<a$1id="facebook" style="display:none"`
    )
    .replace(
      /<a([^>]+)id="youtube"/,
      u.youtube
        ? `<a$1id="youtube" href="${u.youtube}"`
        : `<a$1id="youtube" style="display:none"`
    )
    .replace(
      /<a([^>]+)id="location"/,
      u.location
        ? `<a$1id="location" href="${u.location}"`
        : `<a$1id="location" style="display:none"`
    )

    // WEBSITE
    .replace(
      '<a id="website"',
      u.website
        ? `<a id="website" href="${u.website}"`
        : `<a id="website" style="display:none"`
    );

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/* ---------------- API ---------------- */

async function serveUserJSON(cardId, env) {
  const raw = await env.NFC_USERS.get(`user:${cardId}`);
  if (!raw) return new Response("User not found", { status: 404 });

  return new Response(raw, {
    headers: { "Content-Type": "application/json" },
  });
}

/* ---------------- VCF ---------------- */

async function serveVCF(cardId, env) {
  const raw = await env.NFC_USERS.get(`user:${cardId}`);
  if (!raw) return new Response("User not found", { status: 404 });

  const u = JSON.parse(raw);

  // ---- PHOTO BASE64 ----
  let photoBlock = "";
  if (u.photo) {
    try {
      const imgRes = await fetch(u.photo);
      const arrayBuffer = await imgRes.arrayBuffer();
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

      photoBlock = `
PHOTO;ENCODING=b;TYPE=JPEG:${base64}
`.trim();
    } catch (e) {
      console.error("Photo fetch failed", e);
    }
  }

  // ---- LOCATION ----
  let geoBlock = "";
  let adrBlock = "";

  if (u.location) {
    // If Google Maps URL with lat,lng
    const match = u.location.match(/q=([-0-9.]+),([-0-9.]+)/);
    if (match) {
      geoBlock = `GEO:${match[1]};${match[2]}`;
    }

    adrBlock = `ADR;TYPE=WORK:;;;;${u.location}`;
  }

  const vcf = `
BEGIN:VCARD
VERSION:3.0
FN:${u.name}
ORG:${u.company || ""}
TITLE:${u.title || ""}
TEL;TYPE=CELL:${u.phone}
EMAIL:${u.email || ""}
URL:${u.website || ""}
${adrBlock}
${geoBlock}
${photoBlock}
END:VCARD
`.trim();

  return new Response(vcf, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${cardId}.vcf"`,
    },
  });
}
