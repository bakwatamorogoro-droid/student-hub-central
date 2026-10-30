import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Loader2 } from "lucide-react";

/**
 * Reads a QR code from the phone camera. Only the decoded text is returned; the
 * caller decides what to do with it. Scanning stops as soon as a code is read so
 * a student cannot submit the same frame repeatedly.
 */
export function QrScanner({
  onResult,
  onError,
}: {
  onResult: (text: string) => void;
  onError?: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const found = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
    if (found?.data) {
      stop();
      onResult(found.data);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onResult, stop]);

  const start = async () => {
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRunning(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      onError?.("Imeshindikana kufungua kamera. Ruhusu ruhusa ya kamera kisha ujaribu tena.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-foreground/90 aspect-square">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full object-cover ${running ? "" : "hidden"}`}
        />
        <canvas ref={canvasRef} className="hidden" />
        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-primary-foreground/80">
            <Camera className="h-10 w-10" />
            <p className="text-xs">Elekeza kamera kwenye QR Code</p>
          </div>
        )}
        {running && (
          <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-primary-foreground/70" />
        )}
      </div>
      <Button onClick={running ? stop : start} disabled={starting} className="w-full" variant={running ? "outline" : "default"}>
        {starting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Inafungua kamera…</>
        ) : running ? (
          <><CameraOff className="h-4 w-4" /> Funga kamera</>
        ) : (
          <><Camera className="h-4 w-4" /> Fungua kamera kuscan</>
        )}
      </Button>
    </div>
  );
}
