/**
 * Resolve a provider share link to the canonical video URL.
 *
 * Facebook's share button hands out `facebook.com/share/v/<code>` and
 * `fb.watch/<code>`; TikTok's hands out `vm.tiktok.com/<code>`. None of those
 * carry the video id, and no embed player can play them — the page has to be
 * followed to its real address first.
 *
 * A browser cannot follow that redirect. The request is cross-origin, Facebook
 * sends no CORS header, and `fetch` throws before the `Location` header can be
 * read. Here it is plain HTTP, so the redirect is just a response header.
 *
 * Only the providers' own hosts are ever fetched, and only a few hops, so a
 * crafted `?url=` cannot turn this into an open proxy.
 */

export const config = { runtime: "edge" };

const ALLOWED_HOSTS = new Set([
  "facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "fb.watch",
  "fb.com",
  "tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
  "youtube.com",
  "m.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
]);

/**
 * Facebook answers an unrecognised `fb.watch` code — or a request it does not
 * like — with a login page, and sometimes with a chain that ends there. That is
 * a dead end, not a video, so it is reported as a failure rather than followed
 * until the hop budget runs out.
 */
const LOGIN_PATH = /^\/(login|checkpoint|cookie\/policy)/i;

const MAX_HOPS = 5;

function isLoginPage(raw: string): boolean {
  try {
    return LOGIN_PATH.test(new URL(raw).pathname);
  } catch {
    return false;
  }
}

/**
 * Whether a resolved address actually points at a video.
 *
 * A share link that has expired, or a code the provider does not recognise,
 * often redirects to a bare host — `tiktok.com/` — or to a login page. Handing
 * that back would look like success and then fail in the player, so it is
 * reported as a failure here instead.
 */
function isVideoAddress(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.searchParams.get("v")) return true;
    return /\/(video|videos|reel|reels|watch|shorts|live|embed)\b/i.test(u.pathname);
  } catch {
    return false;
  }
}

function hostOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isAllowed(raw: string): boolean {
  const host = hostOf(raw);
  return host !== null && ALLOWED_HOSTS.has(host);
}

/** Drop tracking query params, keeping the one that carries the id. */
function canonicalize(finalUrl: string): string {
  const u = new URL(finalUrl);
  const v = u.searchParams.get("v");
  u.search = v ? `?v=${encodeURIComponent(v)}` : "";
  u.hash = "";
  return u.toString();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

export default async function handler(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return json({ error: "missing url" }, 400);
  if (!isAllowed(target)) return json({ error: "unsupported host" }, 400);

  // The hops are followed by hand rather than with `redirect: "follow"`, so the
  // answer does not depend on the runtime populating `res.url` after a
  // redirect. `Location` is guaranteed by the fetch spec for `redirect:
  // "manual"`, in every runtime.
  let current = target;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: {
          // A client that is not a browser is handed the redirect. A browser
          // user-agent gets a login wall or a 400 instead.
          "User-Agent":
            "IslamicStudiesTest-LinkResolver/1.0 (+https://www.islamicstudiestest.online)",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch {
      return json({ error: "could not reach the link" }, 502);
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, current).toString();
      if (!isAllowed(next)) return json({ error: "redirect left the providers" }, 400);
      if (isLoginPage(next)) return json({ error: "link requires a login" }, 400);
      current = next;
      continue;
    }

    // Not a redirect: this is where the link really lives, or the provider gave
    // up. Either way there is nothing further to follow.
    if (isLoginPage(current) || !isVideoAddress(current)) {
      return json({ error: "no video at that link" }, 400);
    }
    return json({ url: canonicalize(current) });
  }

  return json({ error: "too many redirects" }, 400);
}
