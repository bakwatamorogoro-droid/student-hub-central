import { useEffect, useRef } from "react";
import QRCode from "qrcode";

/** Renders a QR code for the given payload. The payload is a short-lived token, never student data. */
export function QrCodeDisplay({ value, size = 260 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).catch(() => {});
  }, [value, size]);

  return <canvas ref={ref} className="rounded-xl bg-white p-2 shadow-md" aria-label="QR ya mahudhurio" />;
}
