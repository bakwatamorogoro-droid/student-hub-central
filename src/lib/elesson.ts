/**
 * Turning a pasted video link into something the app can play.
 *
 * The admin pastes whatever the share button gave them — a `youtu.be` short
 * link, a `m.youtube.com` link with a playlist attached, a TikTok link with the
 * tracking query still on it, a Facebook `watch/?v=` or a `/videos/<id>` path.
 * This module reduces all of that to one shape: which provider it is, the
 * provider's own id, the URL to put in an `<iframe>`, and a thumbnail to draw
 * before the player loads.
 *
 * Kept free of imports so `node --test` covers it directly, and so the admin
 * form and the public page derive the same answer from the same link.
 */

export type LessonProvider = "youtube" | "tiktok" | "facebook";

export const LESSON_PROVIDERS: LessonProvider[] = ["youtube", "tiktok", "facebook"];

export type ParsedLessonLink = {
  provider: LessonProvider;
  /** The provider's own id, or null when the link could not be reduced to one. */
  videoId: string | null;
  /** The link as given, trimmed. */
  url: string;
  /** Ready to drop into an `<iframe src>`. */
  embedUrl: string;
  /** A still to show before the player loads, when the provider offers one. */
  thumbnailUrl: string | null;
};

/**
 * The providers we accept, matched on the hostname only.
 *
 * Matching the hostname rather than the whole string is what stops
 * `evil.example/?u=youtube.com` from being treated as a YouTube link.
 */
function hostOf(raw: string): string | null {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isYouTubeHost(host: string): boolean {
  return (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtu.be" ||
    host === "youtube-nocookie.com"
  );
}

function isTikTokHost(host: string): boolean {
  return (
    host === "tiktok.com" ||
    host === "m.tiktok.com" ||
    host === "vm.tiktok.com" ||
    host === "vt.tiktok.com"
  );
}

function isFacebookHost(host: string): boolean {
  return (
    host === "facebook.com" ||
    host === "m.facebook.com" ||
    host === "web.facebook.com" ||
    host === "fb.watch" ||
    host === "fb.com"
  );
}

/** The first path segment after the prefix, e.g. `/@user/video/123` -> `123`. */
function segmentAfter(path: string, marker: string): string | null {
  const parts = path.split("/").filter(Boolean);
  const i = parts.indexOf(marker);
  if (i === -1 || i + 1 >= parts.length) return null;
  return parts[i + 1] || null;
}

/** A YouTube id is 11 URL-safe characters; anything else is not one. */
function looksLikeYouTubeId(v: string | null | undefined): v is string {
  return Boolean(v && /^[A-Za-z0-9_-]{11}$/.test(v));
}

/** A TikTok video id is all digits. */
function looksLikeTikTokId(v: string | null | undefined): v is string {
  return Boolean(v && /^\d{6,25}$/.test(v));
}

function youtubeIdFrom(u: URL): string | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    return looksLikeYouTubeId(id) ? id : null;
  }

  // /watch?v=<id> is the canonical form and the one the share button produces.
  const v = u.searchParams.get("v");
  if (looksLikeYouTubeId(v)) return v;

  // /shorts/<id>, /embed/<id>, /live/<id>, /v/<id> all carry the id in the path.
  for (const marker of ["shorts", "embed", "live", "v"]) {
    const id = segmentAfter(u.pathname, marker);
    if (looksLikeYouTubeId(id)) return id;
  }

  return null;
}

function tiktokIdFrom(u: URL): string | null {
  const fromPath = segmentAfter(u.pathname, "video");
  if (looksLikeTikTokId(fromPath)) return fromPath;
  // Some share links put it in the path with no marker: /t/<id>.
  const parts = u.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return looksLikeTikTokId(last) ? last : null;
}

function facebookIdFrom(u: URL): string | null {
  // /watch/?v=<id>, and the newer /videos/<id> and /reel/<id> paths.
  const v = u.searchParams.get("v");
  if (v && /^\d{6,25}$/.test(v)) return v;

  for (const marker of ["videos", "reel", "video"]) {
    const id = segmentAfter(u.pathname, marker);
    if (id && /^\d{6,25}$/.test(id)) return id;
  }

  // fb.watch/<code> is an opaque short code, not a numeric id. It cannot be
  // turned into an embed URL without following the redirect, so it is kept as
  // the id and played through the plugins player with the original link.
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "fb.watch") {
    const code = u.pathname.split("/").filter(Boolean)[0];
    if (code) return code;
  }
  return null;
}

/**
 * YouTube's poster frame.
 *
 * `hqdefault.jpg` exists for every video — `maxresdefault.jpg` does not, and a
 * missing one renders as a grey box — so the reliable one is used.
 */
export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/**
 * Read a pasted link. Returns null when it is not a link we can play, so the
 * admin form can say so rather than saving something that will never open.
 */
export function parseLessonLink(raw: string): ParsedLessonLink | null {
  const url = String(raw || "").trim();
  if (!url) return null;
  const host = hostOf(url);
  if (!host) return null;

  if (isYouTubeHost(host)) {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const id = youtubeIdFrom(u);
    if (!id) return null;
    return {
      provider: "youtube",
      videoId: id,
      url,
      // nocookie keeps YouTube from dropping ad-tracking cookies on a page a
      // student opened for a lecture. `rel=0` keeps the end screen to this
      // channel rather than an arbitrary recommendation.
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`,
      thumbnailUrl: youtubeThumbnail(id),
    };
  }

  if (isTikTokHost(host)) {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const id = tiktokIdFrom(u);
    if (!id) return null;
    return {
      provider: "tiktok",
      videoId: id,
      url,
      embedUrl: `https://www.tiktok.com/player/v1/${id}?autoplay=0&loop=0&rel=0`,
      // TikTok's poster comes from its oEmbed endpoint, which is fetched
      // separately (see `fetchLessonPreview`); there is no URL we can build.
      thumbnailUrl: null,
    };
  }

  if (isFacebookHost(host)) {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const id = facebookIdFrom(u);
    if (!id) return null;
    // The plugin reads the original href, so the id is only used for identity
    // and for the thumbnail's cache key.
    const href = encodeURIComponent(url);
    return {
      provider: "facebook",
      videoId: id,
      url,
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false&width=734&height=413`,
      // Facebook's graph thumbnail needs a token, so the card falls back to the
      // provider mark rather than a broken image.
      thumbnailUrl: null,
    };
  }

  return null;
}

/** True when a pasted string is a link this app can play. */
export function isPlayableLessonLink(raw: string): boolean {
  return parseLessonLink(raw) !== null;
}

/**
 * True when the link is a provider *share* short link that carries no video id
 * and has to be followed to its real address before it can play.
 *
 * Facebook's share button gives `facebook.com/share/v/<code>` and
 * `fb.watch/<code>`; TikTok's gives `vm.tiktok.com/<code>`. The player cannot
 * play any of them — it answers "Video Unavailable" — so the app follows the
 * redirect first (see `resolveLessonShareLink` in `elessonsApi.ts`).
 *
 * This is deliberately about the *shape* of the link, not a parse failure: a
 * broken `youtube.com/watch` link should still be refused outright rather than
 * sent off to be resolved.
 */
export function needsLinkResolution(raw: string): boolean {
  const host = hostOf(raw);
  if (!host) return false;

  const path = (() => {
    try {
      return new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`)
        .pathname;
    } catch {
      return "";
    }
  })();

  // Facebook: /share/v/<code>, /share/r/<code>, or the fb.watch short host.
  if (host === "fb.watch") return path.split("/").filter(Boolean).length > 0;
  if (isFacebookHost(host) && /^\/share\//i.test(path)) return true;

  // TikTok: the vm./vt. short hosts. The id is opaque and only the redirect
  // knows the real /@user/video/<id> address.
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    return path.split("/").filter(Boolean).length > 0;
  }

  return false;
}

/** "YouTube", "TikTok", "Facebook" — for a badge. */
export const PROVIDER_LABELS: Record<LessonProvider, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
};

/**
 * A name for a link that could not be parsed, so the admin sees which one is
 * wrong rather than a generic refusal.
 */
export function lessonLinkHint(raw: string): string {
  const url = String(raw || "").trim();
  if (!url) return "";
  const host = hostOf(url);
  if (!host) return "Si kiungo sahihi. Bandika link kamili.";
  if (isYouTubeHost(host)) return "Link ya YouTube haijakamilika — hakikisha ina ID ya video.";
  if (isTikTokHost(host))
    return "Link ya TikTok haijakamilika — fungua video kisha bandika link yake kamili.";
  if (isFacebookHost(host))
    return "Link ya Facebook haijakamilika — tumia link ya video au /watch/?v=.";
  return "Mfumo unakubali YouTube, TikTok na Facebook pekee.";
}
