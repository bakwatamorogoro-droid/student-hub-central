import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { registerStudentAccount, regNoToEmail, getMyStudentProfile } from "@/lib/studentAccount.functions";
import { GraduationCap, Loader2, LogIn, LogOut, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/account")({ component: Page });

type Profile = Awaited<ReturnType<typeof getMyStudentProfile>>;

function Page() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [regNo, setRegNo] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<Profile>(null);

  const loadProfile = async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.access_token) return null;
    const p = await getMyStudentProfile({ data: { accessToken: sess.session.access_token } });
    setProfile(p);
    return p;
  };

  const signIn = async () => {
    if (!regNo.trim() || !password) return toast.error("Weka Reg Namba na nenosiri");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: regNoToEmail(regNo),
        password,
      });
      if (error) {
        toast.error(
          error.message.toLowerCase().includes("invalid")
            ? "Reg Namba au nenosiri si sahihi"
            : "Imeshindikana kuingia: " + error.message,
        );
        return;
      }
      const p = await loadProfile();
      toast.success(p?.student.full_name ? `Karibu ${p.student.full_name}` : "Umeingia");
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    if (!regNo.trim()) return toast.error("Weka Reg Namba yako");
    if (password.length < 6) return toast.error("Nenosiri lihitaji herufi 6 au zaidi");
    setBusy(true);
    try {
      const res = await registerStudentAccount({ data: { regNo: regNo.trim(), password } });
      if (!res.ok) {
        const msg: Record<string, string> = {
          not_ready: "Mfumo wa akaunti haujawashwa. Mwambie msimamizi aendeshe supabase/APPLY_ATTENDANCE_QR.sql.",
          not_registered: "Reg Namba hii haipo kwenye orodha ya wanafunzi walioidhinishwa.",
          already_registered: "Reg Namba hii tayari ina akaunti. Ingia badala yake.",
          weak_password: "Nenosiri ni dhaifu mno. Tumia herufi 6 au zaidi.",
        };
        toast.error(msg[res.reason] || "Imeshindikana kusajili akaunti");
        return;
      }
      toast.success(`Akaunti imefunguliwa kwa ${res.fullName}. Ingia sasa.`);
      setMode("login");
      await signIn();
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPassword("");
    toast.success("Umetoka");
  };

  if (profile) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4" /> Wasifu Wangu
            </CardTitle>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5" /> Toka
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Reg Namba", value: profile.student.reg_no },
                { label: "Semina", value: profile.student.semina },
                { label: "Group", value: profile.student.student_group },
                { label: "Kozi", value: profile.student.course },
              ].map((f) => (
                <div key={f.label} className="rounded-xl border border-primary/15 bg-primary/5 p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{f.label}</div>
                  <div className="truncate text-sm font-semibold">{f.value || "—"}</div>
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold">{profile.student.full_name}</p>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> Akaunti imethibitishwa
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Historia ya Mahudhurio</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bado hujahudhuria kipindi chochote.</p>
            ) : (
              <div className="space-y-1.5">
                {profile.history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <span className="truncate">
                      {h.semina || "—"}
                      {h.method === "qr" && <Badge variant="secondary" className="ml-2 text-[10px]">QR</Badge>}
                    </span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                      {new Date(h.created_at).toLocaleDateString("sw-TZ")}
                      {h.distance_m != null ? ` · ${Math.round(h.distance_m)}m` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {mode === "login" ? "Ingia kwenye akaunti yako" : "Fungua akaunti ya mwanafunzi"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Tumia Reg Namba uliyopewa na taasisi. Namba isiyotambulika haitakubaliwa.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Reg Namba</Label>
            <Input
              value={regNo}
              onChange={(e) => setRegNo(e.target.value.toUpperCase())}
              placeholder="MUM2025-04-14106"
              className="font-mono"
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nenosiri</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") mode === "login" ? signIn() : createAccount(); }}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          <Button onClick={mode === "login" ? signIn : createAccount} disabled={busy} className="w-full">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "login" ? "Ingia" : "Fungua akaunti"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground underline"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Huna akaunti? Fungua hapa" : "Una akaunti? Ingia hapa"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
