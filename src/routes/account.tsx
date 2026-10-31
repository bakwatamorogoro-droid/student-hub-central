import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  claimStudentPin,
  getMyProfile,
  loginStudent,
  logoutStudent,
  resetStudentPin,
  type StudentProfile,
} from "@/lib/studentAccount";
import { getStudentToken, setStudentToken, clearStudentToken } from "@/lib/student-session";
import {
  CalendarCheck,
  Copy,
  GraduationCap,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  QrCode,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/account")({ component: Page });

function Page() {
  const [regNo, setRegNo] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  // Step one of the flow: a student without a PIN claims one with their
  // registration number and the phone the school already has on file.
  const [claimReg, setClaimReg] = useState("");
  const [claimPhone, setClaimPhone] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [issuedPin, setIssuedPin] = useState<string | null>(null);
  // Forgot-PIN flow: phone on file plus last name, in exchange for a new PIN.
  const [resetPhone, setResetPhone] = useState("");
  const [resetLastName, setResetLastName] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetPin, setResetPin] = useState<string | null>(null);

  // Restore a previous session so a refresh does not sign the student out.
  useEffect(() => {
    const token = getStudentToken();
    if (!token) return;
    getMyProfile(token)
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
      const res = await loginStudent(regNo.trim(), pin);
      if (!res.ok) {
        if (res.reason === "locked") {
          toast.error(
            "Akaunti imefungwa kwa muda kwa sababu ya PIN zisizo sahihi. Jaribu baada ya dakika 15.",
          );
        } else if (res.reason === "not_ready") {
          toast.error("Imeshindikana kuwasiliana na hifadhidata. Jaribu tena.");
        } else {
          toast.error("Reg Namba au PIN si sahihi");
        }
        return;
      }
      setStudentToken(res.token);
      const p = await getMyProfile(res.token);
      setProfile(p);
      setPin("");
      toast.success(`Karibu ${res.fullName}`);
    } finally {
      setBusy(false);
    }
  };

  const claimPin = async () => {
    if (!claimReg.trim()) return toast.error("Weka Reg Namba yako");
    if (claimPhone.trim().length < 9) return toast.error("Weka namba ya simu uliyosajiliwa nayo");
    setClaimBusy(true);
    try {
      const res = await claimStudentPin(claimReg.trim(), claimPhone.trim());
      if (!res.ok) {
        if (res.reason === "already_claimed") {
          toast.error(
            "Reg Namba hii imekwisha chukua PIN kwenye simu nyingine. Mwone msimamizi wa shule.",
          );
        } else if (res.reason === "disabled") {
          toast.error("Huduma hii imezimwa. Mwone msimamizi wa shule kupata PIN.");
        } else if (res.reason === "not_ready") {
          toast.error("Imeshindikana kuwasiliana na hifadhidata. Jaribu tena.");
        } else {
          toast.error("Reg Namba au namba ya simu haitambuliki");
        }
        return;
      }
      setIssuedPin(res.pin);
      setRegNo(claimReg.trim());
      toast.success("PIN yako imetengenezwa. Iandike na uikumbuke!");
    } finally {
      setClaimBusy(false);
    }
  };

  const doReset = async () => {
    if (resetPhone.trim().length < 9) return toast.error("Weka namba ya simu uliyosajiliwa nayo");
    if (resetLastName.trim().length < 2) return toast.error("Weka jina lako la mwisho");
    setResetBusy(true);
    try {
      const res = await resetStudentPin(resetPhone.trim(), resetLastName.trim());
      if (!res.ok) {
        if (res.reason === "not_ready") {
          toast.error("Imeshindikana kuwasiliana na hifadhidata. Jaribu tena.");
        } else {
          toast.error(
            "Taarifa hizi hazilingani na usajili. Hakikisha namba ya simu na jina la mwisho ni sahihi.",
          );
        }
        return;
      }
      setResetPin(res.pin);
      setRegNo(res.regNo);
      toast.success("PIN mpya imetengenezwa. Iandike!");
    } finally {
      setResetBusy(false);
    }
  };

  const copyPin = async () => {
    const value = issuedPin || resetPin;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("PIN imenakiliwa");
    } catch {
      toast.error("Imeshindikana kunakili — andika kwa mkono");
    }
  };

  const signOut = async () => {
    const token = getStudentToken();
    if (token) await logoutStudent(token).catch(() => undefined);
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
                <div
                  key={f.label}
                  className="rounded-xl border border-primary/15 bg-primary/5 p-2.5"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {f.label}
                  </div>
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

        {/* Attendance has its own page now, reachable from the main menu. This
            card is the signpost so a student who lands here still finds it. */}
        <Card className="border-2 border-primary/25 bg-gradient-to-br from-primary/10 via-card to-secondary/10">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-bold">
                <CalendarCheck className="h-4 w-4 text-primary" /> Mahudhurio
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Hudhuria kipindi kwa kuscan QR ya mwalimu, na uone historia yako.
              </p>
            </div>
            <Button asChild>
              <Link to="/attendance">
                <QrCode className="h-4 w-4" /> Nenda Mahudhurio
              </Link>
            </Button>
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
            <GraduationCap className="h-4 w-4" /> Akaunti ya Mwanafunzi
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Chukua PIN kwa Reg Namba yako, kisha ingia nayo kuhudhuria.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={issuedPin ? "login" : "claim"}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="claim" className="gap-1">
                <KeyRound className="h-3.5 w-3.5" /> Pata PIN
              </TabsTrigger>
              <TabsTrigger value="login" className="gap-1">
                <LogIn className="h-3.5 w-3.5" /> Ingia
              </TabsTrigger>
              <TabsTrigger value="reset" className="gap-1">
                <RotateCcw className="h-3.5 w-3.5" /> Sahau PIN
              </TabsTrigger>
            </TabsList>

            <TabsContent value="claim" className="space-y-3 pt-3">
              {issuedPin ? (
                <div className="space-y-3 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
                  <p className="text-sm font-medium">PIN yako ni</p>
                  <p className="font-mono text-4xl font-extrabold tracking-[0.35em] text-emerald-700 dark:text-emerald-300">
                    {issuedPin}
                  </p>
                  <Button variant="outline" size="sm" onClick={copyPin} className="mx-auto gap-1">
                    <Copy className="h-3.5 w-3.5" /> Nakili
                  </Button>
                  <div className="rounded-lg bg-background/70 p-3 text-left text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">Ihifadhi PIN hii vizuri.</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      <li>Haitaonyeshwa tena. Ukiipoteza, mwone msimamizi wa shule.</li>
                      <li>Haishirikiwi na mtu mwingine — imefungwa kwenye simu hii.</li>
                      <li>Ukitumia simu nyingine, haitafanya kazi.</li>
                    </ul>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setPin(issuedPin);
                      setIssuedPin(null);
                    }}
                  >
                    Nimeiandika — ingia sasa
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Reg Namba</Label>
                    <Input
                      value={claimReg}
                      onChange={(e) => setClaimReg(e.target.value.toUpperCase())}
                      placeholder="MUM2025-04-14106"
                      className="font-mono"
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Namba ya simu uliyosajiliwa nayo</Label>
                    <Input
                      inputMode="numeric"
                      value={claimPhone}
                      onChange={(e) => setClaimPhone(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") claimPin();
                      }}
                      placeholder="0699105527"
                      className="font-mono"
                      autoComplete="tel"
                    />
                  </div>
                  <Button onClick={claimPin} disabled={claimBusy} className="w-full">
                    {claimBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Nitengenezee PIN
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    PIN moja kwa mwanafunzi mmoja, kwenye simu yake. Haishirikiwi.
                  </p>
                </>
              )}
            </TabsContent>

            <TabsContent value="login" className="space-y-3 pt-3">
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") signIn();
                  }}
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
                Huna PIN? Fungua kichupo cha "Pata PIN" juu. Umesahau? Fungua "Sahau PIN".
              </p>
            </TabsContent>

            <TabsContent value="reset" className="space-y-3 pt-3">
              {resetPin ? (
                <div className="space-y-3 rounded-xl border-2 border-amber-500/40 bg-amber-500/10 p-4 text-center">
                  <p className="text-sm font-medium">PIN yako mpya ni</p>
                  <p className="font-mono text-4xl font-extrabold tracking-[0.35em] text-amber-700 dark:text-amber-300">
                    {resetPin}
                  </p>
                  <Button variant="outline" size="sm" onClick={copyPin} className="mx-auto gap-1">
                    <Copy className="h-3.5 w-3.5" /> Nakili
                  </Button>
                  <div className="rounded-lg bg-background/70 p-3 text-left text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">PIN ya zamani imefutwa.</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      <li>Vifaa vyote ulivyoingia vimetolewa — ingia upya kwa PIN hii.</li>
                      <li>Ihifadhi vizuri. Ukiacha hapa, mwone msimamizi wa shule.</li>
                    </ul>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setPin(resetPin);
                      setResetPin(null);
                    }}
                  >
                    Nimeiandika — ingia sasa
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
                    <p className="text-xs text-muted-foreground">
                      Umesahau PIN? Weka namba ya simu uliyosajiliwa nayo na jina lako la mwisho.
                      Zikilingana na taarifa zilizopo shuleni, utapata PIN mpya.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Namba ya simu uliyosajiliwa nayo</Label>
                    <Input
                      inputMode="numeric"
                      value={resetPhone}
                      onChange={(e) => setResetPhone(e.target.value)}
                      placeholder="0699105527"
                      className="font-mono"
                      autoComplete="tel"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Jina lako la mwisho</Label>
                    <Input
                      value={resetLastName}
                      onChange={(e) => setResetLastName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") doReset();
                      }}
                      placeholder="Mfano: MOHAMEDI"
                    />
                  </div>
                  <Button onClick={doReset} disabled={resetBusy} className="w-full">
                    {resetBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Nipatie PIN mpya
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Ukishindwa, mwone msimamizi wa shule — anaweza kukupa PIN mpya moja kwa moja.
                  </p>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
