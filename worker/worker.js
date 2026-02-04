const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const GIT_BASE =
  "https://raw.githubusercontent.com/brandstack-in/NFC-public/main/templates";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    /* ================= CORS PREFLIGHT ================= */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    /* ================= API: UPDATE ================= */
    if (path === "/api/update") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: CORS_HEADERS,
        });
      }
      return handleUpdate(request, env);
    }

    /* ================= HEALTH ================= */
    if (path === "/") {
      return new Response("NFC Worker is running ✅", {
        headers: CORS_HEADERS,
      });
    }

    /* ================= CSS ================= */
    if (path === "/style.css") {
      const css = await fetchFromGit("style.css");
      return new Response(css, {
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    /* ================= PROFILE ================= */
    if (path.startsWith("/u/")) {
      const cardId = path.split("/")[2];
      return serveHTML(cardId, env);
    }

    /* ================= API READ ================= */
    if (path.startsWith("/api/user/")) {
      const cardId = path.split("/")[3];
      return serveUserJSON(cardId, env);
    }

    /* ================= VCF ================= */
    if (path.startsWith("/vcf/")) {
      const cardId = path.split("/")[2];
      return serveVCF(cardId, env);
    }

    return new Response("Not Found", {
      status: 404,
      headers: CORS_HEADERS,
    });
  },
};

/* ================= HELPERS ================= */

async function fetchFromGit(file) {
  const res = await fetch(`${GIT_BASE}/${file}`);
  if (!res.ok) throw new Error("Git fetch failed: " + file);
  return res.text();
}

/* ================= API UPDATE ================= */

async function handleUpdate(request, env) {
  const auth = request.headers.get("Authorization");

  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return new Response("Unauthorized", {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  const data = await request.json();

  if (!data.cardId || !data.name) {
    return new Response("cardId and name are required", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  await env.NFC_USERS.put(
    `user:${data.cardId}`,
    JSON.stringify({
      ...data,
      updatedAt: new Date().toISOString(),
    })
  );

  return new Response(
    JSON.stringify({ success: true }),
    {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    }
  );
}

/* ================= HTML ================= */

async function serveHTML(cardId, env) {
  const raw = await env.NFC_USERS.get(`user:${cardId}`);
  if (!raw) return new Response("User not found", { status: 404 });

  const u = JSON.parse(raw);
  let html = await fetchFromGit("index.html");

  html = html
    /* ---------- TEXT ---------- */
    .replaceAll("{{NAME}}", u.name || "")
    .replaceAll("{{TITLE}}", u.title || "")
    .replaceAll("{{COMPANY}}", u.company || "")

    /* ---------- PHOTO ---------- */
    .replace(
      '<img id="avatar"',
      u.photo
        ? `<img id="avatar" src="${u.photo}"`
        : `<img id="avatar" style="display:none"`
    )

    /* ---------- ACTION BUTTONS ---------- */
    .replace(
      '<a id="call" class="action-btn">',
      u.phone
        ? `<a id="call" class="action-btn" href="tel:${u.phone}">`
        : `<a id="call" class="action-btn" style="display:none">`
    )
    .replace(
      '<a id="email" class="action-btn">',
      u.email
        ? `<a id="email" class="action-btn" href="mailto:${u.email}">`
        : `<a id="email" class="action-btn" style="display:none">`
    )
    .replace(
      '<a id="whatsapp" class="action-btn">',
      u.whatsapp
        ? `<a id="whatsapp" class="action-btn" href="https://wa.me/${u.whatsapp.replace(/\D/g, "")}">`
        : `<a id="whatsapp" class="action-btn" style="display:none">`
    )
    .replace(
      '<a id="save" class="action-btn primary">',
      `<a id="save" class="action-btn primary" href="/vcf/${cardId}">`
    )

    /* ---------- SOCIAL ICONS ---------- */
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

    /* ---------- WEBSITE ---------- */
    .replace(
      '<a id="website"',
      u.website
        ? `<a id="website" href="${u.website.startsWith("http") ? u.website : "https://" + u.website}"`
        : `<a id="website" style="display:none"`
    );

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
/* ================= API READ ================= */

async function serveUserJSON(cardId, env) {
  const raw = await env.NFC_USERS.get(`user:${cardId}`);
  if (!raw) return new Response("User not found", { status: 404 });

  return new Response(raw, {
    headers: { "Content-Type": "application/json" },
  });
}

/* ================= VCF ================= */

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
   let geoBlock = "";
   let adrBlock = "";
   if (u.location) {
     const match = u.location.match(/q=([-0-9.]+),([-0-9.]+)/);
     if (match) {
       geoBlock = `GEO:${match[1]};${match[2]}`;
     }
     adrBlock = `ADR;TYPE=WORK:;;;;${u.location}`;
   }

  const vcf = `
BEGIN:VCARD
VERSION:3.0
N:${""};${u.name || ""};;;
FN:${u.name}
ORG:${u.company || ""}
TITLE:${u.title || ""}
TEL;TYPE=CELL:${u.phone}
EMAIL:${u.email || ""}
URL:${u.website || ""}
${adrBlock}
${geoBlock}
${photoBlock || ""}
END:VCARD
`.trim();

  return new Response(vcf, {
    headers: {
      "Content-Type": "text/vcard",
      "Content-Disposition": `attachment; filename="${cardId}.vcf"`,
    },
  });
}
