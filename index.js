const OWNER = "brandstack-in";
const REPO  = "Preminum-NFC-private";
const BRANCH = "main";

async function fetchPrivateFile(path, env) {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;

  return fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "cloudflare-worker"
    }
  });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;

    if (pathname === "/style.css") {
      const res = await fetchPrivateFile("style.css", env);
      return new Response(await res.text(), {
        headers: { "Content-Type": "text/css" }
      });
    }

    if (pathname === "/profile.jpg") {
      const res = await fetchPrivateFile("profile.jpg", env);
      return new Response(await res.arrayBuffer(), {
        headers: { "Content-Type": "image/jpeg" }
      });
    }

    const res = await fetchPrivateFile("index.html", env);
    return new Response(await res.text(), {
      headers: { "Content-Type": "text/html" }
    });
  }
};

