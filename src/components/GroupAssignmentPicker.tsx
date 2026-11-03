import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/lib/i18n";
import {
  GROUPS_PER_SEMINAR,
  GROUP_NAMES,
  SEMINAR_COUNT,
  normalizeGender,
  normalizeGroupName,
  normalizeSeminar,
} from "@/lib/groupAssignment";
import {
  membersOfGroup,
  personName,
  personReg,
  presentersSummary,
  type GroupKey,
  type RosterPerson,
} from "@/lib/groupAssignmentSubmission";
import { Loader2, Users, CheckCircle2, Mars, Venus, GraduationCap } from "lucide-react";

const norm = { semina: normalizeSeminar, gender: normalizeGender, group: normalizeGroupName };

/** Every seminar the roster really holds, plus the full 1…15 target. */
export function seminarOptions(roster: RosterPerson[]): string[] {
  const found = new Set<string>();
  for (const s of roster) {
    const n = normalizeSeminar(s.semina);
    if (n) found.add(n);
  }
  for (let i = 1; i <= SEMINAR_COUNT; i++) found.add(`SEMINA ${i}`);
  return [...found].sort((a, b) => num(a) - num(b));
}

/** Every group the roster really holds, plus the full GROUP 1…11 target. */
export function groupOptions(roster: RosterPerson[]): string[] {
  const found = new Set<string>(GROUP_NAMES);
  for (const s of roster) {
    const g = normalizeGroupName(s.student_group);
    if (g) found.add(g);
  }
  for (let i = 1; i <= GROUPS_PER_SEMINAR; i++) found.add(`GROUP ${i}`);
  return [...found].sort((a, b) => num(a) - num(b));
}

function num(value: string): number {
  const n = Number(String(value).replace(/\D+/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function GenderIcon({ gender }: { gender: string }) {
  const g = normalizeGender(gender);
  if (g === "female") return <Venus className="h-3.5 w-3.5 text-pink-600" />;
  if (g === "male") return <Mars className="h-3.5 w-3.5 text-sky-600" />;
  return <Users className="h-3.5 w-3.5 text-muted-foreground" />;
}

/**
 * Step 1 and step 2: pick the group, confirm it, then name who presented.
 *
 * The gender is part of the choice because the same "GROUP 5" exists for men and
 * for women inside one seminar; without it the members list would mix the two.
 * It is a dropdown rather than a free choice so a group cannot be invented.
 */
export function GroupPicker({
  roster,
  loadingRoster,
  semina,
  group,
  gender,
  onSemina,
  onGroup,
  onGender,
  confirmed,
  onConfirm,
  members,
  selected,
  onToggle,
  readOnly,
}: {
  roster: RosterPerson[];
  loadingRoster: boolean;
  semina: string;
  group: string;
  gender: string;
  onSemina: (v: string) => void;
  onGroup: (v: string) => void;
  onGender: (v: string) => void;
  confirmed: boolean;
  onConfirm: () => void;
  members: RosterPerson[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  readOnly: boolean;
}) {
  const { t } = useI18n();
  const seminars = useMemo(() => seminarOptions(roster), [roster]);
  const groups = useMemo(() => groupOptions(roster), [roster]);
  const ready = !!semina && !!group && !!gender;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-2 border-primary/25 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-primary/10 via-card to-secondary/10 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4 text-primary" /> {t("ga_pick_title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("ga_sub")}</p>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("ga_semina")}
              </Label>
              <Select value={semina} onValueChange={onSemina} disabled={confirmed || readOnly}>
                <SelectTrigger className="font-semibold">
                  <SelectValue placeholder={t("ga_choose_placeholder")} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {seminars.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("ga_group")}
              </Label>
              <Select value={group} onValueChange={onGroup} disabled={confirmed || readOnly}>
                <SelectTrigger className="font-semibold">
                  <SelectValue placeholder={t("ga_choose_placeholder")} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {groups.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Jinsia
              </Label>
              <Select value={gender} onValueChange={onGender} disabled={confirmed || readOnly}>
                <SelectTrigger className="font-semibold">
                  <SelectValue placeholder={t("ga_choose_placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mwanaume">Wanaume</SelectItem>
                  <SelectItem value="Mwanamke">Wanawake</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!confirmed && (
            <Button
              className="w-full font-bold"
              disabled={!ready || loadingRoster}
              onClick={onConfirm}
            >
              {loadingRoster ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {t("ga_confirm")}
            </Button>
          )}

          {confirmed && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="font-bold">
                {semina} · {group} · {normalizeGender(gender) === "female" ? "Wanawake" : "Wanaume"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmed && (
        <Card className="border-primary/25">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> {t("ga_members")}
              </span>
              <Badge variant="secondary">{members.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {members.length === 0 ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
                {t("ga_no_members")}
              </p>
            ) : (
              <>
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                  <span className="font-bold uppercase tracking-wide text-muted-foreground">
                    {t("ga_step2_title")}
                  </span>
                  <p className="mt-0.5 text-muted-foreground">{t("ga_step2_sub")}</p>
                </div>
                <ul className="space-y-1.5">
                  {members.map((m) => {
                    const id = m.id;
                    const on = selected.has(id);
                    return (
                      <li key={id}>
                        <label
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                            on
                              ? "border-primary/50 bg-primary/10"
                              : "border-border hover:bg-muted/50"
                          } ${readOnly ? "cursor-default opacity-80" : ""}`}
                        >
                          <Checkbox
                            checked={on}
                            disabled={readOnly}
                            onCheckedChange={() => onToggle(id)}
                            aria-label={personName(m) || personReg(m)}
                          />
                          <GenderIcon gender={String(m.gender ?? "")} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {personName(m) || "—"}
                            </span>
                            <span className="block truncate font-mono text-[11px] text-muted-foreground">
                              {personReg(m) || "—"}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted-foreground">
                  {t("ga_presenters_summary")}:{" "}
                  <b>{presentersSummary(memberNames(members, selected))}</b>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** The names behind the selected ids, in roster order. */
export function memberNames(members: RosterPerson[], selected: Set<string>): string[] {
  return members
    .filter((m) => selected.has(m.id))
    .map((m) => personName(m) || personReg(m))
    .filter(Boolean);
}

/** The members of the confirmed group, for the caller that owns the selection. */
export function useGroupMembers(roster: RosterPerson[], key: GroupKey | null): RosterPerson[] {
  return useMemo(() => (key ? membersOfGroup(roster, key, norm) : []), [roster, key]);
}
