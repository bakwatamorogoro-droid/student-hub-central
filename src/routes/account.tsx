import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getMyProfile, loginStudent, logoutStudent, type StudentProfile } from "@/lib/studentAccount.functions";
import { getStudentToken, setStudentToken, clearStudentToken } from "@/lib/student-session";
import { GraduationCap, Loader2, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/account")({ component: Page });

function Page() {
  const [regNo, setRegNo] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<StudentProfile | null>(null);

  // Restore a previous session so a refresh does not sign the student out.
  useEffect(() => {
    const token = getStudentToken();
    if (!token) return;
    getMyProfile({ data: { token } })
      .then((p) => {
        if (p) setProfile(p);
        else clearStudentToken();
      })
      .catch(() => clearStudentToken());
  }, []);

  const signIn = async () => {
    if (!regNo.trim()) return toast.error("Weka Reg Namba yako");
    if (!/^[0-9]{4,10}$/.test(pin)) return toast.error("PIN inatakiwa tarakimu 4 hadi 10");
    setBusy(true);
    try {
      const res = await loginStudent({ data: { regNo: regNo.trim(), pin } });
      if (!res.ok) {
        if (res.reason === "locked") {
          toast.error("Akaunti imefungwa kwa muda kwa sababu ya PIN zisizo sahihi. Jaribu baada ya dakika 15.");
        } else if (res.reason === "not_ready") {
          toast.error("Mfumo wa akaunti haujawashwa. Mwambie msimamizi aendeshe supabase/APPLY_STUDENT_PIN_AUTH.sql.");
        } else {
          toast.error("Reg Namba au PIN si sahihi");
        }
        return;
      }
      setStudentToken(res.token);
      const p = await getMyProfile({ data: { token: res.token } });
      setProfile(p);
      setPin("");
      toast.success(`Karibu ${res.fullName}`);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const token = getStudentToken();
    if (token) await logoutStudent({ data: { token } }).catch(() => undefined);
    clearStudentToken();
    setProfile(null);
    setPin("");
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
                { label: "Reg Namba", value: profile.regNo },
                { label: "Semina", value: profile.semina },
                { label: "Group", value: profile.studentGroup },
                { label: "Kozi", value: profile.course },
              ].map((f) => (
                <div key={f.label} className="rounded-xl border border-primary/15 bg-primary/5 p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{f.label}</div>
                  <div className="truncate text-sm font-semibold">{f.value || "—"}</div>
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold">{profile.fullName}</p>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> Umeingia kwa PIN
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Historia ya Mahudhurio</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.attendance.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bado hujahudhuria kipindi chochote.</p>
            ) : (
              <div className="space-y-1.5">
                {profile.attendance.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <span className="truncate">
                      {h.semina || "—"}
                      {h.status === "present" && <Badge variant="secondary" className="ml-2 text-[10px]">Alikuwepo</Badge>}
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
            <LogIn className="h-4 w-4" /> Ingia kwenye akaunti yako
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Tumia Reg Namba na PIN uliyopewa na msimamizi wa shule.
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
            <Label>PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
              placeholder="Tarakimu 4-10"
              className="font-mono tracking-widest"
              autoComplete="current-password"
            />
          </div>
          <Button onClick={signIn} disabled={busy} className="w-full">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Ingia
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Huna PIN? Mwone msimamizi wa shule.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
