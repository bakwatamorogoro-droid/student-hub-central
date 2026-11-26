import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Crosshair, ExternalLink, MapPin, AlertTriangle } from "lucide-react";
import { getPosition } from "@/lib/geo";
import {
  areaModeOf,
  googleMapsEmbedUrl,
  googleMapsLink,
  parseGoogleMapsCoords,
  type ExamAreaValue,
} from "@/lib/examFence";

/**
 * Where a paper may be sat.
 *
 * The teacher's mental model is three sentences, not four coordinates, so the
 * control is a three-way choice and the numbers follow it:
 *
 *   - "Follow the school setting" is what every existing paper already does.
 *   - "Classroom only" asks for a centre; the map and the paste box are two ways
 *     to give one, because nobody knows their classroom's latitude by heart.
 *   - "Anywhere" is the deliberate exception, and it says on screen that the
 *     GPS is then off, so nobody picks it expecting a fence.
 *
 * The map is a keyless Google Maps embed on purpose: a Maps API key would have
 * to be stored in the bundle and paid for, and this only needs to show a pin.
 */
export function ExamAreaPicker({
  value,
  schoolCentre,
  onChange,
}: {
  value: ExamAreaValue;
  /** The school's own centre, shown so "follow the school" is not a mystery. */
  schoolCentre?: { lat: number | null; lng: number | null; radiusM: number } | null;
  onChange: (next: ExamAreaValue) => void;
}) {
  const mode = areaModeOf(value) ?? "inherit";
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const lat = Number(value.area_lat);
  const lng = Number(value.area_lng);
  const hasCentre = Number.isFinite(lat) && Number.isFinite(lng) && value.area_lat != null;

  const setMode = (next: string) => {
    if (next === "inherit") {
      onChange({ area_mode: null, area_lat: null, area_lng: null, area_radius_m: null });
      return;
    }
    if (next === "off") {
      // Keep the centre when switching to "anywhere": a teacher who tries the
      // off switch and changes their mind should not have to paste the point
      // again. It is simply not enforced while the mode is off.
      onChange({ ...value, area_mode: "off" });
      return;
    }
    const fallback = schoolCentre?.lat != null && schoolCentre?.lng != null ? schoolCentre : null;
    onChange({
      area_mode: "classroom",
      area_lat: hasCentre ? value.area_lat : (fallback?.lat ?? null),
      area_lng: hasCentre ? value.area_lng : (fallback?.lng ?? null),
      area_radius_m: value.area_radius_m ?? schoolCentre?.radiusM ?? 300,
    });
  };

  const applyPaste = () => {
    const coords = parseGoogleMapsCoords(paste);
    if (!coords) {
      setPasteError(
        "Sijaona namba za eneo kwenye kiungo hiki. Fungua Google Maps, bofya eneo, kisha nakili kiungo cha address bar.",
      );
      return;
    }
    setPasteError(null);
    setPaste("");
    onChange({
      area_mode: "classroom",
      area_lat: coords.lat,
      area_lng: coords.lng,
      area_radius_m: value.area_radius_m ?? schoolCentre?.radiusM ?? 300,
    });
  };

  const useMyLocation = async () => {
    setLocating(true);
    const fix = await getPosition();
    setLocating(false);
    if (!fix) {
      setPasteError("Imeshindwa kupata mahali pako. Ruhusu location, kisha ujaribu tena.");
      return;
    }
    setPasteError(null);
    onChange({
      area_mode: "classroom",
      area_lat: fix.lat,
      area_lng: fix.lng,
      area_radius_m: value.area_radius_m ?? schoolCentre?.radiusM ?? 300,
    });
  };

  const embed = useMemo(
    () => (hasCentre ? googleMapsEmbedUrl(lat, lng) : null),
    [hasCentre, lat, lng],
  );

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Eneo la mtihani (GPS)</span>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Mwanafunzi anaweza kufanya wapi?</Label>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inherit">Fuata mpangilio wa chuo</SelectItem>
            <SelectItem value="classroom">Darasani tu (GPS inafunga)</SelectItem>
            <SelectItem value="off">Popote (GPS imezimwa)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {mode === "classroom"
            ? "Mwanafunzi lazima awe ndani ya eneo hili. Akitoka, kifaa chake kinafungwa papo hapo na mwalimu anaona."
            : mode === "off"
              ? "GPS haifungwi. Mwanafunzi anaweza kufanya popote — tumia hii kwa kazi za nyumbani au mtihani wa mtandaoni."
              : schoolCentre?.lat != null && schoolCentre?.lng != null
                ? `Fuata kituo cha chuo na umbali wa ${schoolCentre.radiusM} m.`
                : "Hakuna kituo cha chuo kilichowekwa, kwa hiyo GPS haifungwi."}
        </p>
      </div>

      {mode === "classroom" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Latitude</Label>
              <Input
                type="number"
                step="any"
                value={value.area_lat ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    area_lat: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="-6.8161"
              />
            </div>
            <div>
              <Label className="text-xs">Longitude</Label>
              <Input
                type="number"
                step="any"
                value={value.area_lng ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    area_lng: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="39.2803"
              />
            </div>
          </div>

          <div className="max-w-xs">
            <Label className="text-xs">Umbali unaoruhusiwa (mita)</Label>
            <Input
              type="number"
              value={value.area_radius_m ?? schoolCentre?.radiusM ?? 300}
              onChange={(e) =>
                onChange({
                  ...value,
                  area_radius_m: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Au bandika kiungo cha Google Maps</Label>
            <div className="flex gap-2">
              <Input
                value={paste}
                onChange={(e) => {
                  setPaste(e.target.value);
                  setPasteError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyPaste();
                  }
                }}
                placeholder="https://maps.google.com/... au -6.8161, 39.2803"
              />
              <Button type="button" variant="outline" onClick={applyPaste} disabled={!paste.trim()}>
                Tumia
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={useMyLocation}
              disabled={locating}
            >
              <Crosshair className="mr-1 h-3.5 w-3.5" />
              {locating ? "Inatafuta…" : "Tumia eneo langu sasa"}
            </Button>
            {pasteError && (
              <p className="flex items-start gap-1.5 text-[11px] text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {pasteError}
              </p>
            )}
          </div>

          {embed ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <iframe
                title="Ramani ya eneo la mtihani"
                src={embed}
                className="h-56 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-3 text-[11px] text-muted-foreground">
              Weka kituo ili ramani ionekane.
            </p>
          )}

          {hasCentre && (
            <a
              className="inline-flex items-center gap-1 text-[11px] text-primary underline"
              href={googleMapsLink(lat, lng)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Fungua kwenye Google Maps
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </>
      )}
    </div>
  );
}
