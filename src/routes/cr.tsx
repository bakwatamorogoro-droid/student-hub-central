import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrUnlockPanel } from "@/components/CrUnlockPanel";
import { crLogin, crLogout, isCr } from "@/lib/cr-session";
import { CR_USERNAME } from "@/lib/crAccess";
import { toast } from "@/lib/toast";
import { Loader2, LogIn, LogOut, ShieldCheck, UserCog, Unlock } from "lucide-react";

export const Route = createFileRoute("/cr")({
  component: Page,
  head: () => ({
    meta: [
      { title: "CR — Kufungua Akaunti — Islamic Studies Test" },
      {
        name: "description",
        content: "CR anafungua akaunti za wanafunzi waliokosea ili kurekebisha taarifa zao.",
      },
    ],
  }),
});

/**
 * The CR's screen, and only that.
 *
 * A CR's job is narrow — open the account of a classmate who is stuck, so they can
 * sign in, correct their details and set their own PIN. That is `CrUnlockPanel`,
 * and nothing else lives here. Marks, exams and settings stay behind the admin's
 * door, because a CR who needs those is an admin and should sign in as one.
 *
 * The page is reachable directly at `/cr`; it is not linked from `/admin`, whose
 * nav belongs to the admin.
 */
function Page() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAuthed(isCr());
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!authed) return <CrLogin onLogin={() => setAuthed(true)} />;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold">
            <UserCog className="h-5 w-5 text-primary" /> Mwenyekiti wa Darasa (CR)
          </h1>
          <p className="text-sm text-muted-foreground">
            Kazi yako ni moja: kumfungulia mwanafunzi aliyekosea ili kuingia na kurekebisha taarifa
            zake.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-1 font-bold"
          onClick={() => {
            crLogout();
            setAuthed(false);
          }}
        >
          <LogOut className="h-4 w-4" /> Toka
        </Button>
      </div>

      <Card className="border-primary/25 bg-gradient-to-br from-primary/10 to-transparent">
        <CardContent className="flex items-start gap-3 py-4">
          <Unlock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Unapomfungulia, mwanafunzi anaweza kuingia na kurekebisha taarifa zake. Ruhusa ya
            marekebisho inaisha mara tu anapohifadhi, na yeye mwenyewe hubadilisha PIN yake.
          </p>
        </CardContent>
      </Card>

      <CrUnlockPanel />
    </div>
  );
}

function CrLogin({ onLogin }: { onLogin: () => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = crLogin(u, p);
    setBusy(false);
    if (ok) {
      toast.success("Karibu CR!");
      onLogin();
      return;
    }
    toast.error("Username au password si sahihi");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-primary/25">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" /> CR Login
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Ingia kufungulia wanafunzi waliokosea ili kurekebisha taarifa zao.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input
                value={u}
                onChange={(e) => setU(e.target.value)}
                placeholder={CR_USERNAME}
                className="font-mono"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input
                type="password"
                value={p}
                onChange={(e) => setP(e.target.value)}
                className="font-mono"
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full gap-1 font-bold" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Ingia
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
