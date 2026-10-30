import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, Printer, QrCode } from "lucide-react";
import { toast } from "@/lib/toast";
import { encodeJoinQr } from "@/lib/attendance-qr";

export type PosterSession = {
  title: string;
  semina: string | null;
  studentGroup: string | null;
  radiusM: number;
};

/**
 * A wall poster the teacher can print.
 *
 * It encodes the session's join code, not a rotating token: a token dies in 30 s
 * so a printed one would never survive the walk to the wall. The code is valid
 * for as long as the session is open, and the geofence is what keeps a student
 * at home from using a photographed copy.
 */
export function AttendanceQrPoster({
  session,
  joinCode,
}: {
  session: PosterSession;
  joinCode: string;
}) {
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const built = useRef(false);

  useEffect(() => {
    if (!joinCode || built.current) return;
    built.current = true;
    QRCode.toDataURL(encodeJoinQr(joinCode), {
      width: 900,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(setPng)
      .catch(() => setPng(null));
  }, [joinCode]);

  const fileName = `QR-mahudhurio-${joinCode || "kipindi"}.png`;

  const download = () => {
    if (!png) return;
    const a = document.createElement("a");
    a.href = png;
    a.download = fileName;
    a.click();
  };

  const print = () => {
    if (!png) return;
    setBusy(true);
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) {
      setBusy(false);
      toast.error("Ruhusu pop-up kisha ujaribu tena");
      return;
    }
    // The poster is written as a standalone document so the browser prints the
    // sheet and nothing else — no app chrome, no dark theme, no clipped table.
    w.document.write(`<!doctype html><html lang="sw"><head><meta charset="utf-8">
<title>QR ya Mahudhurio — ${escapeHtml(joinCode)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; }
  .sheet { text-align: center; }
  .school { font-size: 13px; letter-spacing: .22em; text-transform: uppercase; color: #64748b; }
  h1 { font-size: 30px; margin: 8px 0 2px; }
  .meta { font-size: 14px; color: #475569; margin-bottom: 18px; }
  img { width: 78mm; height: 78mm; }
  .code-label { margin-top: 14px; font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: #64748b; }
  .code { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 42px; font-weight: 800; letter-spacing: .3em; margin: 2px 0 16px; }
  ol { text-align: left; max-width: 150mm; margin: 0 auto; font-size: 13px; line-height: 1.65; color: #334155; }
  .foot { margin-top: 18px; font-size: 11px; color: #94a3b8; }
</style></head><body><div class="sheet">
  <div class="school">Islamic Studies Test Online</div>
  <h1>${escapeHtml(session.title)}</h1>
  <div class="meta">${escapeHtml(session.semina || "Semina yoyote")} • ${escapeHtml(
    session.studentGroup || "Wote",
  )} • umbali ${session.radiusM}m</div>
  <img src="${png}" alt="QR ya mahudhurio">
  <div class="code-label">Msimbo wa kujiunga</div>
  <div class="code">${escapeHtml(joinCode)}</div>
  <ol>
    <li>Ingia kwenye akaunti yako kwa Reg Namba na PIN.</li>
    <li>Fungua kamera, kisha skani QR hii — au andika msimbo ulio juu.</li>
    <li>Ruhusu GPS. Unatakiwa uwe darasani (ndani ya mita ${session.radiusM}).</li>
  </ol>
  <div class="foot">Mahudhurio yanarekodiwa mara moja kwa kipindi.</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script>
</body></html>`);
    w.document.close();
    setBusy(false);
  };

  return (
    <Card className="border-2 border-dashed border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="h-4 w-4" /> QR ya Kupachika Ukutani
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Pakua au chapisha. QR hii ni ya kudumu kwa kipindi hiki — wanafunzi wanaiskana wakiwa
          darasani.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-3">
          {png ? (
            <img src={png} alt="QR ya mahudhurio ya kuchapisha" className="h-44 w-44" />
          ) : (
            <div className="h-44 w-44 animate-pulse rounded-lg bg-muted" />
          )}
          <p className="font-mono text-xl font-extrabold tracking-[0.3em] text-foreground">
            {joinCode || "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={download} disabled={!png}>
            <Download className="h-4 w-4" /> Pakua PNG
          </Button>
          <Button size="sm" variant="outline" onClick={print} disabled={!png || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Chapisha
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
