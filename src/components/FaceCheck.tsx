import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, CameraOff, Check, Loader2, ScanFace, ShieldAlert, X } from "lucide-react";
import {
  FACE_CHALLENGES,
  MOTION_CHALLENGES,
  NO_FACE,
  challengeSatisfied,
  faceCheckSupport,
  frameStats,
  motionInFrame,
  motionMoved,
  readFaces,
  type FaceChallenge,
  type FaceReading,
  type FrameStats,
  type MotionChallenge,
} from "@/lib/faceLiveness";

/** The instruction shown for each movement, in the student's language. */
const CHALLENGE_TEXT: Record<FaceChallenge, { title: string; hint: string }> = {
  centred: { title: "Weka uso wako katikati", hint: "Angalia moja kwa moja kwenye kamera" },
  closer: { title: "Sogeza uso karibu", hint: "Sogeza simu karibu na uso wako" },
  turn: { title: "Geuza uso kando", hint: "Geuza kichwa kushoto au kulia, kisha rudisha" },
};

const MOTION_TEXT: Record<MotionChallenge, { title: string; hint: string }> = {
  in_frame: { title: "Weka uso wako mbele ya kamera", hint: "Hakikisha kamera inaona uso wako" },
  moved: { title: "Sogeza kichwa kidogo", hint: "Geuza kichwa kushoto na kulia" },
};

/** How long a single movement may take before the student is told to retry. */
const STEP_TIMEOUT_MS = 25000;
/** Readings per second from the detector path. */
const SAMPLE_INTERVAL_MS = 250;
/** How many readings must agree before a movement counts, so a blur cannot. */
const AGREEMENTS_NEEDED = 3;

type DetectorCtor = new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect(source: CanvasImageSource): Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

/**
 * The face step: the student proves a live face is in front of the camera.
 *
 * Two paths, chosen by what the browser has. With `FaceDetector` (Chromium) the
 * three movements are judged on the face's own geometry — where it is, how big,
 * how far it moved. Without it (Firefox, Safari) the check falls back to frame
 * statistics: an uncovered lens with something in front of it, and motion. The
 * badge says which one is running, because a check that quietly checks less than
 * it appears to would be worse than no check.
 *
 * `onVerified` fires once, after the last movement. It carries the method so the
 * record can say how the student was checked.
 */
export function FaceCheck({
  onVerified,
}: {
  onVerified: (method: "face_detector" | "motion") => void;
}) {
  const support = faceCheckSupport();
  const detectorMode = support === "face_detector";

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const detectorRef = useRef<InstanceType<DetectorCtor> | null>(null);
  const baselineRef = useRef<FaceReading | null>(null);
  const motionSamplesRef = useRef<FrameStats[]>([]);
  const previousFrameRef = useRef<FrameStats | null>(null);
  const hitsRef = useRef(0);
  const deadlineRef = useRef(0);
  const finishedRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [step, setStep] = useState(0);
  const [reading, setReading] = useState<FaceReading>(NO_FACE);
  const [moved, setMoved] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const challenges = detectorMode ? FACE_CHALLENGES : MOTION_CHALLENGES;

  const stopCamera = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    detectorRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  /** Advances to the next movement, or finishes. */
  const advance = useCallback(() => {
    hitsRef.current = 0;
    motionSamplesRef.current = [];
    previousFrameRef.current = null;
    deadlineRef.current = Date.now() + STEP_TIMEOUT_MS;
    setStalled(false);
    setStep((s) => {
      if (s + 1 < challenges.length) return s + 1;
      // Last movement done. Guard so a late frame cannot verify twice.
      if (!finishedRef.current) {
        finishedRef.current = true;
        stopCamera();
        onVerified(detectorMode ? "face_detector" : "motion");
      }
      return s;
    });
  }, [challenges.length, detectorMode, onVerified, stopCamera]);

  /** One pass over the current video frame. */
  const sample = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    const challenge = challenges[step];
    if (!challenge) return;

    if (detectorMode) {
      const detector = detectorRef.current;
      if (!detector) return;
      let faces: Array<{ boundingBox: DOMRectReadOnly }> = [];
      try {
        faces = await detector.detect(video);
      } catch {
        // A frame the detector could not read; the next tick tries again.
        return;
      }
      const frame = { width: video.videoWidth, height: video.videoHeight };
      const current = readFaces(
        faces as Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>,
        frame,
      );
      setReading(current);

      const ok = challengeSatisfied(challenge as FaceChallenge, current, baselineRef.current);
      if (ok) {
        // Remember where the face was, so "closer" and "turn" have something to
        // measure against — and it is taken from a *passing* centred step, not
        // from whatever the first frame happened to show.
        if (challenge === "centred") baselineRef.current = current;
        hitsRef.current += 1;
        if (hitsRef.current >= AGREEMENTS_NEEDED) advance();
      } else {
        hitsRef.current = 0;
      }
    } else {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      // Small frames are enough for brightness and motion, and cheap enough to
      // run several times a second on a phone.
      const w = 64;
      const h = 48;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);
      const stats = frameStats(image.data, previousFrameRef.current);
      previousFrameRef.current = stats;

      let ok: boolean;
      if (challenge === "in_frame") {
        ok = motionInFrame(stats);
      } else {
        // Collect first, then judge, so the current frame is part of the
        // evidence rather than always one reading behind.
        motionSamplesRef.current = [...motionSamplesRef.current, stats].slice(-6);
        ok = motionMoved(motionSamplesRef.current);
      }
      setMoved(ok);

      if (ok) {
        hitsRef.current += 1;
        if (hitsRef.current >= AGREEMENTS_NEEDED) advance();
      } else {
        hitsRef.current = 0;
      }
    }

    if (Date.now() > deadlineRef.current) setStalled(true);
  }, [advance, challenges, detectorMode, step]);

  const start = useCallback(async () => {
    if (support === "none") {
      setCameraError(
        "Kivinjari hiki hakina kamera inayopatikana. Uthibitisho wa sura unahitaji kamera.",
      );
      return;
    }
    setStarting(true);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (detectorMode) {
        const Ctor = (window as unknown as { FaceDetector: DetectorCtor }).FaceDetector;
        detectorRef.current = new Ctor({ fastMode: true, maxDetectedFaces: 4 });
      }

      setRunning(true);
      setStep(0);
      hitsRef.current = 0;
      baselineRef.current = null;
      motionSamplesRef.current = [];
      previousFrameRef.current = null;
      finishedRef.current = false;
      deadlineRef.current = Date.now() + STEP_TIMEOUT_MS;
      timerRef.current = window.setInterval(() => void sample(), SAMPLE_INTERVAL_MS);
    } catch {
      setCameraError("Imeshindikana kufungua kamera. Ruhusu ruhusa ya kamera kisha ujaribe tena.");
    } finally {
      setStarting(false);
    }
  }, [detectorMode, sample, support]);

  const currentChallenge = challenges[step];
  const instruction = detectorMode
    ? CHALLENGE_TEXT[currentChallenge as FaceChallenge]
    : MOTION_TEXT[currentChallenge as MotionChallenge];
  const passed = detectorMode ? null : moved;

  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ScanFace className="h-4 w-4 text-primary" /> Uthibitisho wa sura
        </div>
        <Badge
          variant={detectorMode ? "default" : "secondary"}
          className="shrink-0 text-[10px] uppercase"
        >
          {detectorMode ? "Uso kamili" : "Mwendo"}
        </Badge>
      </div>

      {support === "motion_only" && (
        <p className="flex gap-1.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          Kivinjari hiki hakina kipimo cha uso. Tutathibitisha kwa mwendo wa kamera — hii ni dhaifu
          kidogo, lakini inathibitisha kuna mtu hai mbele ya kamera.
        </p>
      )}

      {cameraError && (
        <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <X className="h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-destructive">{cameraError}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Uthibitisho wa sura ni lazima ili kuhudhuria. Fungua ruhusa ya kamera kwenye
              mipangilio ya kivinjari chako, kisha ujaribu tena. Kama tatizo linaendelea, mwambie
              mwalimu au msimamizi.
            </p>
          </div>
        </div>
      )}

      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border-2 border-primary/30 bg-foreground/90">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full object-cover ${running ? "" : "hidden"}`}
        />
        <canvas ref={canvasRef} className="hidden" />
        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-primary-foreground/80">
            <ScanFace className="h-10 w-10" />
            <p className="px-4 text-center text-xs">
              Bonyeza kitufe hapa chini, kisha fuata maelekezo.
            </p>
          </div>
        )}
        {running && (
          <div className="pointer-events-none absolute inset-x-10 inset-y-6 rounded-[40%] border-2 border-dashed border-primary-foreground/70" />
        )}
        {running && (
          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-center text-primary-foreground">
            <p className="text-sm font-bold">
              Hatua {step + 1}/{challenges.length}: {instruction.title}
            </p>
            <p className="text-[11px] text-primary-foreground/80">{instruction.hint}</p>
          </div>
        )}
      </div>

      {running && (
        <div className="flex items-center justify-center gap-1.5">
          {challenges.map((c, i) => (
            <span
              key={c}
              className={`h-1.5 flex-1 rounded-full ${
                i < step ? "bg-emerald-500" : i === step ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>
      )}

      {running && stalled && (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="font-medium">Hatua hii haijakamilika.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Hakikisha uso wako unaonekana vizuri na mwanga unatosha, kisha fuata maelekezo.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                hitsRef.current = 0;
                deadlineRef.current = Date.now() + STEP_TIMEOUT_MS;
                setStalled(false);
              }}
            >
              Jaribu hatua hii tena
            </Button>
          </div>
        </div>
      )}

      {running && detectorMode && (
        <p className="text-center text-[11px] text-muted-foreground">
          {reading.count === 0
            ? "Hakuna uso unaonekana"
            : reading.count > 1
              ? "Watu zaidi ya mmoja kwenye kamera"
              : passed === false
                ? "Sogeza ili uso uonekane vizuri"
                : "Uso unaonekana"}
        </p>
      )}

      {!running && (
        <Button
          onClick={start}
          disabled={starting || support === "none"}
          className="w-full gap-1.5"
        >
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Fungua kamera kuthibitisha sura
        </Button>
      )}

      {support === "none" && (
        <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-medium text-destructive">
              Kivinjari hiki hakina kamera inayopatikana
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Uthibitisho wa sura ni lazima ili kuhudhuria. Fungua ukurasa huu kwenye simu yenye
              kamera, kisha ujaribu tena. Kama huna kamera, mwambie mwalimu au msimamizi.
            </p>
          </div>
        </div>
      )}

      {running && (
        <Button variant="outline" onClick={stopCamera} className="w-full gap-1.5">
          <CameraOff className="h-4 w-4" /> Funga kamera
        </Button>
      )}

      {!running && finishedRef.current && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-600">
          <Check className="h-4 w-4" /> Uso umethibitishwa
        </p>
      )}
    </div>
  );
}
