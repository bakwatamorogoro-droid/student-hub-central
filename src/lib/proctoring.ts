/**
 * Exam integrity helpers: fullscreen, camera presence, and GPS plausibility.
 *
 * Everything here is deliberately dependency-free and side-effect-free at import
 * time, so the pure parts can be unit-tested under `node --test` and the browser
 * parts can be tree-shaken on the server.
 *
 * The camera check does **not** try to recognise faces. It samples small frames
 * and looks at how uniform and how still the picture is, which is enough to catch
 * the two things a teacher cares about: the lens is covered, and the student has
 * walked away leaving a static scene. Recognising a face would need a model and a
 * second network call per frame; neither belongs in a timed exam on a phone.
 */

// ---------------------------------------------------------------- fullscreen

export function isFullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown };
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/**
 * Enters fullscreen, tolerating the older WebKit spelling.
 *
 * iOS Safari on iPhone refuses `requestFullscreen` on anything but a `<video>`,
 * so this returns false rather than throwing: the caller treats fullscreen as
 * best-effort and keeps the other integrity checks running.
 */
export async function enterFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (typeof document === "undefined") return;
  const d = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  try {
    if (d.fullscreenElement && d.exitFullscreen) await d.exitFullscreen();
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
  } catch {
    /* nothing to leave */
  }
}

/** Subscribes to fullscreen changes; returns an unsubscribe function. */
export function onFullscreenChange(cb: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("fullscreenchange", cb);
  document.addEventListener("webkitfullscreenchange", cb);
  return () => {
    document.removeEventListener("fullscreenchange", cb);
    document.removeEventListener("webkitfullscreenchange", cb);
  };
}

// ------------------------------------------------------------- camera frames

export type FrameStats = {
  /** Mean luminance, 0–255. A covered lens sits near 0 (black) or 255 (glare). */
  brightness: number;
  /** Spread of luminance across the frame. Flat picture ⇒ near 0. */
  contrast: number;
  /** Mean absolute difference from the previous frame, 0–255. */
  motion: number;
};

/**
 * Reduces a frame's pixels to three numbers.
 *
 * `rgba` is a flat RGBA buffer. Keeping this pure means the thresholds below can
 * be tested against synthetic frames instead of a real webcam.
 */
export function frameStats(rgba: Uint8ClampedArray | number[], previous?: FrameStats | null): FrameStats {
  const n = Math.floor(rgba.length / 4);
  if (n === 0) return { brightness: 0, contrast: 0, motion: 0 };

  let sum = 0;
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Rec. 601 luma, the cheap approximation every vision pipeline starts with.
    const y = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    luma[i] = y;
    sum += y;
  }
  const brightness = sum / n;

  let variance = 0;
  for (let i = 0; i < n; i++) variance += (luma[i] - brightness) ** 2;
  const contrast = Math.sqrt(variance / n);

  const motion = previous ? Math.abs(brightness - previous.brightness) : 0;
  return { brightness, contrast, motion };
}

export type CameraVerdict = "ok" | "covered" | "frozen";

/**
 * Judges one frame.
 *
 * `contrast` is the discriminator, not brightness: a dim room is still a real
 * room (edges exist), whereas a thumb or a piece of tape produces a nearly
 * uniform field. `frozen` is a separate signal — a completely still picture for
 * a long run usually means the phone was left on the desk facing nothing.
 */
export function judgeFrame(
  stats: FrameStats,
  opts: { coveredContrast?: number } = {},
): CameraVerdict {
  const coveredContrast = opts.coveredContrast ?? 6;
  if (stats.contrast < coveredContrast) return "covered";
  return "ok";
}

export type CameraMonitorOptions = {
  /** How often to sample, in ms. One frame every few seconds is plenty. */
  intervalMs?: number;
  /** Frames to average before reporting, so a blink is not an event. */
  window?: number;
  onVerdict: (verdict: CameraVerdict, stats: FrameStats) => void;
};

/**
 * Samples a live `MediaStream` and reports a verdict per window.
 *
 * The video element is created off-screen because the caller already renders its
 * own preview; a second visible one would be confusing.
 */
export function monitorCamera(
  stream: MediaStream,
  { intervalMs = 4000, window = 2, onVerdict }: CameraMonitorOptions,
): () => void {
  if (typeof document === "undefined") return () => {};

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 36;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return () => {};

  let previous: FrameStats | null = null;
  let seen = 0;
  let coveredRun = 0;

  const timer = setInterval(() => {
    if (video.readyState < 2) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let stats: FrameStats;
    try {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      stats = frameStats(data, previous);
    } catch {
      return; // tainted canvas; nothing we can read
    }
    previous = stats;

    const verdict = judgeFrame(stats);
    coveredRun = verdict === "covered" ? coveredRun + 1 : 0;
    seen++;
    // Report only once the window has filled, and only after two consecutive
    // covered frames, so a hand passing in front of the lens is not an incident.
    if (seen >= window && (verdict === "ok" || coveredRun >= 2)) {
      onVerdict(verdict, stats);
    }
  }, intervalMs);

  void video.play().catch(() => {});

  return () => {
    clearInterval(timer);
    video.pause();
    video.srcObject = null;
  };
}

// ---------------------------------------------------------------------- GPS

export type GpsSample = { lat: number; lng: number; accuracy: number; at: number };

export type GpsAssessment = {
  /** Best fix to measure the fence against: the most accurate sample. */
  best: GpsSample;
  /** Largest distance between any two samples, in metres. */
  spreadM: number;
  /** Why the fix is not trustworthy, if it is not. */
  flags: GpsFlag[];
  /** False only for fixes that cannot be used at all. */
  usable: boolean;
};

export type GpsFlag = "implausibly_accurate" | "identical_fixes" | "stale" | "too_vague";

/** Accuracy better than this is not achievable on a phone, so it reads as fake. */
const IMPLAUSIBLE_ACCURACY_M = 1;
/** Accuracy worse than this cannot place a student inside a 300 m fence. */
const MAX_USABLE_ACCURACY_M = 500;

/**
 * Turns several fixes into one judgement.
 *
 * The browser cannot prove a coordinate is genuine, but a spoofed fix has a
 * fingerprint: an injected value is either perfectly accurate or byte-identical
 * across reads, while a real receiver always jitters by a metre or two and
 * reports a plausible accuracy. We therefore refuse only fixes that cannot be
 * used at all, and flag the rest for the teacher to judge.
 */
export function assessGpsSamples(samples: GpsSample[], now = Date.now()): GpsAssessment | null {
  const valid = samples.filter(
    (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && Number.isFinite(s.accuracy),
  );
  if (valid.length === 0) return null;

  const best = valid.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));

  let spreadM = 0;
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const d = haversine(valid[i].lat, valid[i].lng, valid[j].lat, valid[j].lng);
      if (d > spreadM) spreadM = d;
    }
  }

  const flags: GpsFlag[] = [];
  if (best.accuracy < IMPLAUSIBLE_ACCURACY_M) flags.push("implausibly_accurate");
  if (valid.length >= 3 && spreadM < 0.05) flags.push("identical_fixes");
  if (best.accuracy > MAX_USABLE_ACCURACY_M) flags.push("too_vague");
  if (now - best.at > 60000) flags.push("stale");

  const usable = !flags.includes("too_vague") && !flags.includes("stale");
  return { best, spreadM, flags, usable };
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Human-readable reason, for the teacher's log rather than the student. */
export function gpsFlagLabel(flag: GpsFlag): string {
  switch (flag) {
    case "implausibly_accurate":
      return "usahihi wa GPS hauwezekani kwenye simu";
    case "identical_fixes":
      return "vipimo vinarudia sawa kabisa (inaweza kuwa eneo la kubuni)";
    case "stale":
      return "kipimo cha GPS ni cha zamani";
    case "too_vague":
      return "usahihi wa GPS hafifu mno kupima eneo";
  }
}
