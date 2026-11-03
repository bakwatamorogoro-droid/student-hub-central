import { forwardRef, useImperativeHandle, useRef, useState } from "react";
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
 * Red is the default because the owner asked for it: the admin marks and signs a
 * group's work in red, the way a teacher writes on paper. The other swatches are
 * offered because a red tick can be lost against red text in an answer.
 */
export const PEN_COLOURS = [
  { name: "Nyekundu", value: "#dc2626" },
  { name: "Nyeusi", value: "#0f172a" },
  { name: "Bluu", value: "#1d4ed8" },
  { name: "Kijani", value: "#15803d" },
] as const;

export const DEFAULT_PEN_COLOUR = PEN_COLOURS[0].value;

/**
 * The "system pen" the admin signs an answer with.
 *
 * `react-signature-canvas` is already a dependency and already used for the exam
 * signature, so this wraps it rather than adding a drawing surface by hand. The
 * pad reports `null` when nothing was drawn, so a blank pad never stores an
 * empty white rectangle as if it were a signature.
 */
export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { height?: number; label?: string; penColor?: string }
>(function SignaturePad({ height = 160, label = "Sahihi ya mfumo", penColor }, ref) {
  const padRef = useRef<SignatureCanvas>(null);
  const [colour, setColour] = useState(penColor ?? DEFAULT_PEN_COLOUR);

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
      <div className="flex items-center gap-1.5">
        {PEN_COLOURS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.name}
            aria-label={`Rangi ${c.name}`}
            aria-pressed={colour === c.value}
            onClick={() => setColour(c.value)}
            className={`h-6 w-6 rounded-full border-2 transition-transform ${
              colour === c.value
                ? "scale-110 border-foreground"
                : "border-transparent hover:scale-105"
            }`}
            style={{ backgroundColor: c.value }}
          />
        ))}
        <span className="ml-1 text-[11px] text-muted-foreground">
          {PEN_COLOURS.find((c) => c.value === colour)?.name ?? ""}
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border-2 border-dashed border-primary/30 bg-white">
        <SignatureCanvas
          ref={padRef}
          penColor={colour}
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
});
