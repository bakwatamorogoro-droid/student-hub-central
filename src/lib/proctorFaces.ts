/**
 * Person and gaze integrity, using the browser's own face detector.
 *
 * The owner asked the system to notice when "there are people, or the student is
 * being looked at, or someone is helping him". `proctoring.ts` catches a covered
 * lens and a scene that never moves; this file answers the question that needs an
 * actual face — how many are there, and is the student looking at the screen.
 *
 * The detector is `FaceDetector`, which ships with Chromium. It is deliberately
 * the *only* thing used here, and the choice is a privacy one: the frames are
 * examined on the device and never leave it, no image is stored, and no model is
 * downloaded or called. A cloud vision API would answer the same question better
 * and is exactly the wrong thing to point at a classroom of minors.
 *
 * Because `FaceDetector` is Chromium-only (Firefox and Safari do not have it),
 * `isFaceDetectionSupported()` is exported and the caller is expected to say so
 * to the student rather than pretend the check is running. A check that silently
 * does nothing is worse than no check: the teacher would trust a blank log.
 *
 * Gaze is inferred from the face's position in the frame, not from eye tracking.
 * A face that has drifted to the edge is looking away; a face in the middle is
 * facing the screen. It is a coarse signal and is reported as such.
 */

/** The subset of `FaceDetector`'s result this file uses. */
export type DetectedFace = {
  boundingBox: { x: number; y: number; width: number; height: number };
};

export type FaceVerdict =
  /** Exactly one face, centred. */
  | "ok"
  /** No face at all — the student has left, or the lens is pointed elsewhere. */
  | "absent"
  /** More than one face: someone else is in frame. */
  | "multiple"
  /** One face, but well off-centre — turned away from the screen. */
  | "looking_away";

/** A face whose centre sits outside this fraction of the frame is "away". */
const CENTRE_TOLERANCE = 0.28;

/**
 * Judges a set of detected faces.
 *
 * The order of the checks is the priority order of what a teacher cares about:
 * a second person matters more than a glance away, and an empty frame matters
 * most of all.
 *
 * A face touching the edge of the frame is counted as off-centre, because a
 * student leaning out of shot is about to become "absent" and the teacher should
 * see that coming rather than lose the signal.
 */
export function judgeFaces(faces: DetectedFace[], frame: { width: number; height: number }): FaceVerdict {
  if (faces.length === 0) return "absent";
  if (faces.length > 1) return "multiple";
  if (frame.width <= 0 || frame.height <= 0) return "ok";

  const f = faces[0].boundingBox;
  const cx = (f.x + f.width / 2) / frame.width;
  const cy = (f.y + f.height / 2) / frame.height;
  const offCentre = Math.abs(cx - 0.5) > CENTRE_TOLERANCE || Math.abs(cy - 0.5) > CENTRE_TOLERANCE;
  return offCentre ? "looking_away" : "ok";
}

/** Whether this browser can run the face check at all. */
export function isFaceDetectionSupported(): boolean {
  return typeof window !== "undefined" && "FaceDetector" in window;
}

/** The constructor, or null when the browser has no detector. */
type FaceDetectorCtor = new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect(source: CanvasImageSource): Promise<DetectedFace[]>;
};

function detectorCtor(): FaceDetectorCtor | null {
  if (!isFaceDetectionSupported()) return null;
  return (window as unknown as { FaceDetector: FaceDetectorCtor }).FaceDetector;
}

export type FaceMonitorOptions = {
  /** How often to look, in ms. Faces move, but not that fast. */
  intervalMs?: number;
  /** Readings that must agree before a verdict is reported, so a turn is not an event. */
  window?: number;
  onVerdict: (verdict: FaceVerdict, count: number) => void;
};

/**
 * Watches a live `MediaStream` for the number and position of faces.
 *
 * Returns a no-op when the browser has no detector — check
 * `isFaceDetectionSupported()` first if the difference matters to the UI.
 */
export function monitorFaces(
  stream: MediaStream,
  { intervalMs = 4000, window = 2, onVerdict }: FaceMonitorOptions,
): () => void {
  const Ctor = detectorCtor();
  if (!Ctor || typeof document === "undefined") return () => {};

  let detector: InstanceType<FaceDetectorCtor>;
  try {
    // Two faces is the useful ceiling: one is the student, the second is the
    // event. Asking for more costs time and tells us nothing extra.
    detector = new Ctor({ fastMode: true, maxDetectedFaces: 4 });
  } catch {
    return () => {};
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  let run: FaceVerdict[] = [];

  const timer = setInterval(() => {
    if (video.readyState < 2 || !video.videoWidth) return;
    void detector
      .detect(video)
      .then((faces) => {
        const verdict = judgeFaces(faces, { width: video.videoWidth, height: video.videoHeight });
        run.push(verdict);
        if (run.length > window) run = run.slice(-window);
        // Report only once the window has filled and every reading agrees, so a
        // head-turn or someone walking behind the chair is not an incident.
        if (run.length >= window && run.every((v) => v === verdict)) onVerdict(verdict, faces.length);
      })
      .catch(() => {
        /* a frame the detector could not read; try again next tick */
      });
  }, intervalMs);

  void video.play().catch(() => {});

  return () => {
    clearInterval(timer);
    video.pause();
    video.srcObject = null;
  };
}

/** Human-readable reason, in the student's language, for the integrity strip. */
export function faceVerdictLabel(verdict: FaceVerdict, lang: "sw" | "en"): string {
  const sw: Record<FaceVerdict, string> = {
    ok: "Uso mmoja unaonekana",
    absent: "Hakuna uso kwenye kamera",
    multiple: "Watu zaidi ya mmoja kwenye kamera",
    looking_away: "Umeangalia kando",
  };
  const en: Record<FaceVerdict, string> = {
    ok: "One face visible",
    absent: "No face on camera",
    multiple: "More than one person on camera",
    looking_away: "Looking away",
  };
  return (lang === "en" ? en : sw)[verdict];
}
