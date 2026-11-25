import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminLogin } from "@/lib/admin-session";
import { toast } from "@/lib/toast";
import {
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  Lock,
  ShieldCheck,
  User,
} from "lucide-react";

export function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!u.trim() || !p) {
      toast.error("Weka username na password");
      return;
    }
    setLoading(true);
    const ok = await adminLogin(u, p);
    setLoading(false);
    if (ok) {
      toast.success("Karibu admin!");
      onLogin();
    } else {
      toast.error("Username au password si sahihi");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* A soft two-tone wash rather than an image: it loads instantly and it
          follows the theme tokens, so dark mode needs no second asset. */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-[26rem] w-[26rem] rounded-full bg-secondary/20 blur-3xl" />
      </div>

      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/25">
            <GraduationCap className="h-7 w-7 text-primary-foreground" />
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-card">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            </span>
          </div>
          <h1 className="font-display text-2xl font-black tracking-tight">Karibu Mwalimu</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingia kusimamia mitihani, wanafunzi na matokeo.
          </p>
        </div>

        <div className="rounded-2xl border border-primary/15 bg-card/80 p-6 shadow-xl shadow-primary/5 backdrop-blur-xl">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-user" className="text-xs font-bold uppercase tracking-wide">
                Username
              </Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="admin-user"
                  value={u}
                  onChange={(e) => setU(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  placeholder="Jina la mtumiaji"
                  className="h-11 pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-pass" className="text-xs font-bold uppercase tracking-wide">
                Password
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="admin-pass"
                  type={showPassword ? "text" : "password"}
                  value={p}
                  onChange={(e) => setP(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-11 pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ficha password" : "Onyesha password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="group h-11 w-full gap-2 bg-gradient-to-r from-primary to-secondary text-sm font-bold shadow-md shadow-primary/20"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Inaingia…
                </>
              ) : (
                <>
                  Ingia
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" />
            Eneo hili ni la walimu na wasimamizi pekee.
          </p>
        </div>
      </div>
    </div>
  );
}
