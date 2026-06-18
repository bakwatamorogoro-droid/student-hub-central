import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trophy, User, GraduationCap, Lock } from "lucide-react";

export const Route = createFileRoute("/r/$slug")({ component: SecretResults });

function SecretResults() {
  const { slug } = Route.useParams();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [regNo, setRegNo] = useState("");
  const [student, setStudent] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("results_secret_slug").eq("id", 1).single();
      setAllowed((data?.results_secret_slug || "siri-alama") === slug);
    })();
    const r = localStorage.getItem("student_reg");
    if (r) setRegNo(r);
  }, [slug]);

  const fetchResults = async () => {
    const r = regNo.toUpperCase();
    const { data: s } = await supabase.from("students").select("*").ilike("reg_no", r.trim()).maybeSingle();
    setStudent(s);
    const { data } = await supabase
      .from("submissions")
      .select("*, exams!inner(title, results_published)")
      .eq("reg_no", r)
      .order("submitted_at", { ascending: false });
    setRows((data || []).filter((x: any) => x.exams.results_published && x.ai_confirmed));
    setSearched(true);
  };

  if (allowed === null) return null;
  if (!allowed) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h1 className="text-xl font-bold">Link si sahihi</h1>
        <p className="text-sm text-muted-foreground">Tafadhali tumia link ya siri uliyopewa.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-primary/5">
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold mb-2">
            <Lock className="h-3 w-3" /> Sehemu ya Siri ya Alama
          </div>
          <h1 className="text-2xl font-bold">Angalia Matokeo Yako</h1>
        </div>

        <Card className="mb-6">
          <CardHeader><CardTitle>Reg Namba</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())} placeholder="Reg Namba" onKeyDown={(e) => { if (e.key === "Enter") fetchResults(); }} />
            <Button onClick={fetchResults}>Tafuta</Button>
          </CardContent>
        </Card>

        {student && (
          <Card className="mb-6 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-5 grid sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2"><User className="h-5 w-5 text-primary" /><div><div className="text-xs text-muted-foreground">Jina</div><div className="font-bold">{student.full_name}</div></div></div>
              <div><div className="text-xs text-muted-foreground">Reg Namba</div><div className="font-mono">{student.reg_no}</div></div>
              <div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" /><div><div className="text-xs text-muted-foreground">Kozi</div><div>{student.course || student.student_group}</div></div></div>
              <div><div className="text-xs text-muted-foreground">Semina / Group</div><div>{student.semina} • {student.student_group}</div></div>
            </CardContent>
          </Card>
        )}

        {searched && rows.length === 0 && <p className="text-center text-muted-foreground">Hakuna matokeo yaliyopublishiwa bado.</p>}

        <div className="space-y-3">
          {rows.map((r) => {
            const pct = r.max_score ? (Number(r.score) / Number(r.max_score)) * 100 : 0;
            const pass = pct >= 50;
            return (
              <Card key={r.id} className="overflow-hidden">
                <div className={`h-1 ${pass ? "bg-primary" : "bg-destructive"}`} />
                <CardContent className="p-4 flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{r.exams.title}</div>
                    <div className="text-xs text-muted-foreground">{new Date(r.submitted_at).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <Trophy className={`h-5 w-5 ${pass ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-2xl font-bold">{r.score != null ? Number(r.score).toFixed(1) : "-"}<span className="text-sm text-muted-foreground"> / {r.max_score ?? "-"}</span></span>
                    </div>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold ${pass ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{pct.toFixed(1)}%</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}