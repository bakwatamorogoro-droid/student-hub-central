import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";
import { invalidateRosterCache, useRoster } from "@/lib/useRoster";
import {
  INVITE_REJECTION_TEXT,
  checkInvite,
  answerToast,
  describeGroup,
  inviteErrorKey,
  joinableGroups,
  phoneOrDash,
  verifyStudent,
  type GroupInvite,
} from "@/lib/groupHub";
import { answerInvite, cancelInvite, loadInvitesFor, sendInvite } from "@/lib/groupHubApi";
import { GROUP_SIZE, type RosterEntry } from "@/lib/groupAssignment";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MailCheck,
  Phone,
  ShieldCheck,
  Users,
  UserCheck,
  X,
} from "lucide-react";

export const Route = createFileRoute("/group")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Group Yangu — Islamic Studies Test Online" },
      {
        name: "description",
        content:
          "Thibitisha kwa Reg Namba na namba ya simu, kisha uone group lako, wanafunzi wenzako na namba zao. Verify with your Reg number and phone to see your group and classmates.",
      },
      { property: "og:title", content: "Group Yangu — Islamic Studies Test Online" },
      {
        property: "og:description",
        content: "Group lako, wanafunzi wenzako na namba zao — baada ya kuthibitisha.",
      },
    ],
  }),
});

function Page() {
  const { t } = useI18n();
  const { roster, loading: rosterLoading, reload: reloadRoster } = useRoster();

  // The verified student lives in memory only. A phone number is a credential
  // here, so it is never written to storage and never survives a reload.
  const [verified, setVerified] = useState<RosterEntry | null>(null);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [invitesReady, setInvitesReady] = useState(true);

  const refreshInvites = useCallback(async (studentId: string) => {
    const rows = await loadInvitesFor(studentId);
    if (rows === null) {
      setInvitesReady(false);
      setInvites([]);
      return;
    }
    setInvites(rows);
  }, []);

  useEffect(() => {
    if (!verified) return;
    void refreshInvites(verified.id);
  }, [verified, refreshInvites]);

  // A roster refresh must not keep showing a seat the student just left, and
  // the verified row itself has to be re-read from the fresh roster.
  const me = useMemo(
    () => (verified ? (roster.find((s) => s.id === verified.id) ?? verified) : null),
    [roster, verified],
  );

  const mine = useMemo(
    () => (me ? describeGroup(roster, me, invites) : null),
    [roster, me, invites],
  );

  return (
    <div className="page-shell min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <Users className="h-6 w-6 text-primary" /> {t("gh_title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("gh_sub")}</p>
        </header>

        {!me ? (
          <VerifyCard
            loading={rosterLoading}
            onVerified={(s) => {
              setVerified(s);
              setInvitesReady(true);
            }}
          />
        ) : (
          <>
            <VerifiedBar student={me} onSignOut={() => setVerified(null)} />
            {!invitesReady && <MigrationNotice />}
            <GroupCard mine={mine!} />
            {mine!.receivedInvite && (
              <ReceivedInviteCard
                invite={mine!.receivedInvite}
                student={me}
                onAnswered={async () => {
                  await refreshInvites(me.id);
                  // The accepted move rewrites both rows, so the cached roster is
                  // stale: reload it rather than only dropping the cache.
                  invalidateRosterCache();
                  reloadRoster();
                }}
              />
            )}
            <InviteCard
              roster={roster}
              me={me}
              mine={mine!}
              invites={invites}
              onSent={() => void refreshInvites(me.id)}
            />
          </>
        )}
      </main>
    </div>
  );
}

function VerifyCard({
  loading,
  onVerified,
}: {
  loading: boolean;
  onVerified: (s: RosterEntry) => void;
}) {
  const { t } = useI18n();
  const { roster } = useRoster();
  const [reg, setReg] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    const result = verifyStudent(roster, reg, phone);
    if (!result.ok) {
      const key =
        result.reason === "no_reg"
          ? "gh_err_no_reg"
          : result.reason === "no_phone"
            ? "gh_err_no_phone"
            : result.reason === "no_phone_on_file"
              ? "gh_err_no_phone_on_file"
              : "gh_err_no_match";
      setError(t(key));
      return;
    }

    setBusy(true);
    try {
      onVerified(result.student);
      setPhone("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-2 border-primary/25 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" /> {t("gh_verify_title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("gh_verify_help")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="gh-reg" className="text-xs font-bold uppercase tracking-wide">
            {t("gh_reg_label")}
          </Label>
          <Input
            id="gh-reg"
            value={reg}
            onChange={(e) => setReg(e.target.value.toUpperCase())}
            placeholder="MUM2025-04-14106"
            className="font-mono"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gh-phone" className="text-xs font-bold uppercase tracking-wide">
            {t("gh_phone_label")}
          </Label>
          <Input
            id="gh-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0699105527"
            className="font-mono"
            inputMode="tel"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            {error}
          </p>
        )}

        <Button
          onClick={() => void submit()}
          disabled={busy || loading}
          className="w-full font-bold"
        >
          {busy || loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {busy ? t("gh_verifying") : t("gh_verify_button")}
        </Button>

        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" /> {t("gh_privacy_note")}
        </p>
      </CardContent>
    </Card>
  );
}

function VerifiedBar({ student, onSignOut }: { student: RosterEntry; onSignOut: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <UserCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{student.full_name || "—"}</div>
          <div className="font-mono text-xs text-muted-foreground">{student.reg_no}</div>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onSignOut} className="gap-1 font-bold">
        <LogOut className="h-3.5 w-3.5" /> {t("gh_sign_out")}
      </Button>
    </div>
  );
}

function MigrationNotice() {
  const { t } = useI18n();
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      {t("gh_needs_migration")}
    </p>
  );
}

function GroupCard({ mine }: { mine: ReturnType<typeof describeGroup> }) {
  const { t } = useI18n();
  const status = mine.full
    ? { key: "gh_status_full", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" }
    : mine.underFilled
      ? { key: "gh_status_under", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" }
      : { key: "gh_status_open", cls: "bg-primary/15 text-primary" };

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> {t("gh_group_label")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: t("gh_seminar_label"), value: mine.semina || "—" },
            { label: t("gh_group_label"), value: mine.group || "—" },
            { label: t("gh_size_label"), value: `${mine.size}/${GROUP_SIZE}` },
          ].map((f) => (
            <div key={f.label} className="rounded-xl border border-primary/15 bg-primary/5 p-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {f.label}
              </div>
              <div className="truncate text-sm font-semibold">{f.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge className={`${status.cls} border-0 font-bold`}>{t(status.key)}</Badge>
          <Badge variant="outline" className="font-mono text-xs">
            {mine.free} {t("gh_group_free")}
          </Badge>
        </div>

        {mine.group ? (
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("gh_members_title")} ({mine.size})
            </div>
            <p className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Phone className="h-3 w-3" /> {t("gh_members_help")}
            </p>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {mine.members.map((m) => {
                const isMe = m.id === mine.student.id;
                return (
                  <li
                    key={m.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                      isMe ? "bg-primary/10" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {m.full_name || "—"}
                        {isMe && (
                          <span className="ml-1 text-xs font-bold text-primary">
                            ({t("gh_you")})
                          </span>
                        )}
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {m.reg_no}
                      </span>
                    </span>
                    <a
                      href={m.phone ? `tel:${m.phone}` : undefined}
                      className={`shrink-0 font-mono text-xs ${
                        m.phone
                          ? "text-primary underline-offset-2 hover:underline"
                          : "text-muted-foreground"
                      }`}
                    >
                      {m.phone ? phoneOrDash(m.phone) : t("gh_no_phone")}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            {t("gh_invite_locked_nogroup")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ReceivedInviteCard({
  invite,
  student,
  onAnswered,
}: {
  invite: GroupInvite;
  student: RosterEntry;
  onAnswered: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  const answer = async (accept: boolean) => {
    setBusy(accept ? "accept" : "decline");
    const { error, needsMigration, outcome } = await answerInvite(invite.id, student.id, accept);
    setBusy(null);
    if (needsMigration) {
      toast.error(t("gh_needs_migration"));
      return;
    }
    if (error) {
      toast.error(t(inviteErrorKey(error) ?? "gh_invite_error"));
      // The database may have moved the ground under this card — the group filled,
      // the invitation was answered elsewhere, the mover left — so re-read rather
      // than leave a button that cannot work.
      await onAnswered();
      return;
    }
    const notice = answerToast(outcome, accept);
    toast[notice.kind](t(notice.key));
    await onAnswered();
  };

  return (
    <Card className="border-2 border-primary/40 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MailCheck className="h-4 w-4 text-primary" /> {t("gh_received_title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          {t("gh_received_body", {
            name: invite.from_name || "—",
            reg: invite.from_reg_no,
            group: invite.from_group,
          })}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => void answer(true)}
            disabled={busy !== null}
            className="flex-1 font-bold"
          >
            {busy === "accept" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {busy === "accept" ? t("gh_accepting") : t("gh_accept")}
          </Button>
          <Button
            variant="outline"
            onClick={() => void answer(false)}
            disabled={busy !== null}
            className="flex-1 font-bold"
          >
            {busy === "decline" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            {t("gh_decline")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InviteCard({
  roster,
  me,
  mine,
  invites,
  onSent,
}: {
  roster: RosterEntry[];
  me: RosterEntry;
  mine: ReturnType<typeof describeGroup>;
  invites: GroupInvite[];
  onSent: () => void;
}) {
  const { t } = useI18n();
  const [targetGroup, setTargetGroup] = useState<string | null>(null);
  const [targetMember, setTargetMember] = useState<RosterEntry | null>(null);
  const [sending, setSending] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const groups = useMemo(() => joinableGroups(roster, me), [roster, me]);

  // Invitable = in the chosen group, already updated, and passing every rule.
  // `checkInvite` is the single source of truth, so the list cannot drift from
  // what the button will actually allow.
  const candidates = useMemo(() => {
    if (!targetGroup) return [];
    return roster.filter((s) => {
      if (s.id === me.id) return false;
      if (String(s.student_group ?? "").trim() !== targetGroup) return false;
      return checkInvite(roster, me, s.id, invites) === null;
    });
  }, [roster, me, targetGroup, invites]);

  if (mine.sentInvite) {
    return <SentInviteCard invite={mine.sentInvite} onCancelled={onSent} />;
  }

  if (!mine.group) return null;

  if (!mine.underFilled) {
    return (
      <Card className="shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-muted-foreground" /> {t("gh_invite_title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            {t("gh_invite_locked_full")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const send = async () => {
    if (!targetMember) return;
    const rejection = checkInvite(roster, me, targetMember.id, invites);
    if (rejection) {
      setReason(INVITE_REJECTION_TEXT[rejection]);
      return;
    }
    setReason(null);
    setSending(true);
    const error = await sendInvite({ from: me, to: targetMember });
    setSending(false);
    if (error) {
      toast.error(t(inviteErrorKey(error) ?? "gh_invite_error"));
      return;
    }
    toast.success(t("gh_invite_sent_toast"));
    setTargetMember(null);
    onSent();
  };

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-primary" /> {t("gh_invite_title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("gh_invite_help")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[11px] text-muted-foreground">{t("gh_search_help")}</p>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide">{t("gh_pick_group")}</Label>
          {groups.length === 0 ? (
            <p className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
              {t("gh_no_joinable")}
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {groups.map((g) => {
                const active = targetGroup === g.group;
                return (
                  <button
                    key={g.group}
                    type="button"
                    onClick={() => {
                      setTargetGroup(g.group);
                      setTargetMember(null);
                      setReason(null);
                    }}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-left text-sm transition ${
                      active
                        ? "border-primary bg-primary/10 font-bold"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <span className="font-bold">{g.group}</span>
                    <span className="text-xs text-muted-foreground">
                      {g.size} {t("gh_group_row")} · {g.free} {t("gh_group_free")}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {targetGroup && (
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wide">
              {t("gh_pick_member")}
            </Label>
            {candidates.length === 0 ? (
              <p className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                {t("gh_no_joinable")}
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {candidates.map((s) => {
                  const active = targetMember?.id === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setTargetMember(s)}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                          active ? "bg-primary/10 font-bold" : "hover:bg-muted/60"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{s.full_name || "—"}</span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {s.reg_no}
                          </span>
                        </span>
                        {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {reason && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            {reason}
          </p>
        )}

        <Button
          onClick={() => void send()}
          disabled={!targetMember || sending}
          className="w-full font-bold"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {sending ? t("gh_sending") : t("gh_send_invite")}
        </Button>
      </CardContent>
    </Card>
  );
}

function SentInviteCard({ invite, onCancelled }: { invite: GroupInvite; onCancelled: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  return (
    <Card className="border-2 border-primary/30 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-primary" /> {t("gh_sent_title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{t("gh_sent_body", { name: invite.to_name || invite.to_reg_no })}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {invite.to_group} · {invite.to_reg_no}
        </p>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const error = await cancelInvite(invite.id);
            setBusy(false);
            if (error) {
              toast.error(t(inviteErrorKey(error) ?? "gh_invite_error"));
              return;
            }
            onCancelled();
          }}
          className="w-full font-bold"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          {t("gh_cancel_invite")}
        </Button>
      </CardContent>
    </Card>
  );
}
