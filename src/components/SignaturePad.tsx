import { forwardRef, useImperativeHandle, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Eraser, PenLine } from "lucide-react";

export type SignaturePadHandle = {
  /** PNG data URL of what was drawn, or null when the pad is empty. */
  toDataUrl: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
};

/**
 * The "system pen" the admin signs an answer with.
 *
 * `react-signature-canvas` is already a dependency and already used for the exam
 * signature, so this wraps it rather than adding a drawing surface by hand. The
 * pad reports `null` when nothing was drawn, so a blank pad never stores an
 * empty white rectangle as if it were a signature.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number; label?: string }>(
  function SignaturePad({ height = 160, label = "Sahihi ya mfumo" }, ref) {
    const padRef = useRef<SignatureCanvas>(null);

    useImperativeHandle(ref, () => ({
      toDataUrl: () => {
        const pad = padRef.current;
        if (!pad || pad.isEmpty()) return null;
        // `trim` drops the empty margin, so the stored PNG is only the ink.
        return pad.getTrimmedCanvas().toDataURL("image/png");
      },
      clear: () => padRef.current?.clear(),
      isEmpty: () => padRef.current?.isEmpty() ?? true,
    }));

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <PenLine className="h-3.5 w-3.5" /> {label}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => padRef.current?.clear()}
          >
            <Eraser className="h-3 w-3" /> Futa
          </Button>
        </div>
        <div className="overflow-hidden rounded-xl border-2 border-dashed border-primary/30 bg-white">
          <SignatureCanvas
            ref={padRef}
            penColor="#0f172a"
            canvasProps={{
              width: 600,
              height,
              className: "w-full touch-none",
              "aria-label": label,
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Tumia kidole au mouse kuweka sahihi ya mfumo juu ya jibu lako.
        </p>
      </div>
    );
  },
);
