import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device-id";
import { formatEat } from "@/lib/time";
import { Clock, User, GraduationCap, Phone, CheckCircle2, Calendar } from "lucide-react";
import { toast } from "@/lib/toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExamVideoHero, BigSystemTitle } from "@/components/ExamVideoHero";

import { findStudentsByQuery } from "@/lib/studentSearch";
import { StudentMatchesPicker } from "@/components/StudentMatchesPicker";
import { matchesAcademicTarget } from "@/lib/academicTargeting";

export const Route = createFileRoute("/exams")({
  component: ExamsPage,
  head: () => ({
    meta: [
      { title: "Mitihani Iliyopangwa — Islamic Studies Test" },
      { name: "description", content: "Orodha ya mitihani iliyopangwa ya Islamic Studies." },
      { property: "og:title", content: "Mitihani Iliyopangwa — Islamic Studies Test" },
    ],
  }),
});

function ExamsPage() {
  const nav = useNavigate();
  const [exams, setExams] = useState<any[]>([]);
  const [regInput, setRegInput] = useState("");
  const [student, setStudent] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [checking, setChecking] = useState(false);
  const [category, setCategory] = useState<string>("all");

  useEffect(() => {
    const r = localStorage.getItem("student_reg");
    if (r) {
      setRegInput(r);
      lookup(r);
    }
    supabase.from("exams").select("*").eq("published", true).order("created_at", { ascending: false })
      .then(({ data }: { data: any }) => setExams(data || []));
  }, []);

  const categorize = (title: string): string => {
    const t = (title || "").toLowerCase();
    if (/\btest\s*0*1\b/.test(t) || /\bmtihani\s*0*1\b/.test(t)) return "test1";
    if (/\btest\s*0*2\b/.test(t) || /\bmtihani\s*0*2\b/.test(t)) return "test2";
    if (/\btest\s*0*3\b/.test(t) || /\bmtihani\s*0*3\b/.test(t)) return "test3";
    return "others";
  };

  const eligibleExams = student ? exams.filter((e) => matchesAcademicTarget(e, student)) : [];
  const filteredExams = eligibleExams.filter((e) => category === "all" ? true : categorize(e.title) === category);
  const counts = {
    all: eligibleExams.length,
    test1: eligibleExams.filter((e) => categorize(e.title) === "test1").length,
    test2: eligibleExams.filter((e) => categorize(e.title) === "test2").length,
    test3: eligibleExams.filter((e) => categorize(e.title) === "test3").length,
    others: eligibleExams.filter((e) => categorize(e.title) === "others").length,
  };

  const confirmStudent = (s: any) => {
    setStudent(s);
    setMatches([]);
    setRegInput(s.reg_no);
    localStorage.setItem("student_reg", s.reg_no);
  };

  const lookup = async (reg: string) => {
    if (!reg) return;
    setChecking(true);
    const results = await findStudentsByQuery(reg);
    setChecking(false);
    if (results.length === 0) {
      toast.error("Hakuna mwanafunzi anayelingana. Hakikisha umeandika sahihi au jisajili.");
      setStudent(null);
      setMatches([]);
      return;
    }
    if (results.length === 1) { confirmStudent(results[0]); return; }
    setStudent(null);
    setMatches(results);
    toast.info(`Tumepata ${results.length} wanafunzi — chagua wewe ni nani.`);
  };

  const now = Date.now();
  const status = (e: any) => {
    const s = e.start_time ? new Date(e.start_time).getTime() : 0;
    const en = e.end_time ? new Date(e.end_time).getTime() : Infinity;
    if (now < s) return { label: "Bado haijaanza", can: false };
    if (now > en) return { label: "Muda umeisha", can: false };
    return { label: "Inapatikana sasa", can: true };
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <ExamVideoHero subtitle="Jisajili, thibitisha taarifa zako, kisha anza mtihani wako mtandaoni kwa usalama na adabu ya Kiislamu." />
        <Card className="mb-6 border-2 border-primary/30">

          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Thibitisha Mwanafunzi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={regInput}
                onChange={(e) => setRegInput(e.target.value.toUpperCase())}
                placeholder="Ingiza Reg Namba au jina (mfano: jina la mwisho)"
                className="flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") lookup(regInput); }}
              />
              <Button onClick={() => lookup(regInput)} disabled={checking || !regInput}>
                {checking ? "Inathibitisha..." : "Thibitisha"}
              </Button>
            </div>
            {!student && (
              <p className="text-sm text-muted-foreground mt-2">
                Hujajisajili? <Link to="/register" className="text-primary underline">Jisajili hapa</Link>
              </p>
            )}
            {student && (
              <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20 grid sm:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><span className="font-bold">{student.full_name}</span></div>
                <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> {student.phone || "-"}</div>
                <div><span className="text-muted-foreground">Reg:</span> {student.reg_no}</div>
                <div className="flex items-center gap-2"><GraduationCap className="h-4 w-4" /> {student.course || student.student_group}</div>
                <div><span className="text-muted-foreground">Semina:</span> {student.semina}</div>
                <div><span className="text-muted-foreground">Group:</span> {student.student_group}</div>
                <div><span className="text-muted-foreground">Mwaka:</span> {student.study_year ? `Mwaka wa ${student.study_year}` : "Haujawekwa"}</div>
                <div><span className="text-muted-foreground">Kitaaluma:</span> {student.academic_year || "Haujawekwa"}</div>
              </div>
            )}
            {matches.length > 0 && (
              <StudentMatchesPicker matches={matches} onConfirm={confirmStudent} onCancel={() => setMatches([])} />
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-xl font-bold">Mitihani Iliyopangwa</h2>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Aina ya mtihani" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Zote ({counts.all})</SelectItem>
              <SelectItem value="test1">Test 1 ({counts.test1})</SelectItem>
              <SelectItem value="test2">Test 2 ({counts.test2})</SelectItem>
              <SelectItem value="test3">Test 3 ({counts.test3})</SelectItem>
              <SelectItem value="others">Others ({counts.others})</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {!student && <p className="text-muted-foreground">Thibitisha taarifa zako ili kuona mitihani ya mwaka wako.</p>}
          {student && filteredExams.length === 0 && <p className="text-muted-foreground">Hakuna mtihani wa mwaka wako katika aina hii.</p>}
          {filteredExams.map((e) => {
            const st = status(e);
            return (
              <Card
                key={e.id}
                className="group relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-card via-card to-primary/5 hover:border-primary/50 hover:shadow-2xl hover:-translate-y-1 transition-all"
              >
                <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-primary/10 blur-2xl" />
                <CardHeader className="relative pb-2">
                  <CardTitle className="flex justify-between items-start gap-2 text-base md:text-lg">
                    <span className="font-extrabold tracking-tight">{e.title}</span>
                    <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-1 rounded-full whitespace-nowrap ${st.can ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{st.label}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  {e.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{e.description}</p>}
                  <div className="grid gap-1.5 text-xs text-muted-foreground mb-4">
                    <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" /> {e.duration_minutes} dakika</span>
                    {e.start_time && <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-primary" /> Huanza: {formatEat(e.start_time)}</span>}
                    {e.end_time && <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-primary" /> Humalizika: {formatEat(e.end_time)}</span>}
                  </div>
                  <Button
                    className="w-full rounded-xl font-bold"
                    disabled={!student || !st.can}
                    onClick={() => nav({ to: "/exam/$examId", params: { examId: e.id }, search: {} as any })}
                  >
                    {student ? "Anza Mtihani" : "Thibitisha Reg Namba kwanza"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <BigSystemTitle sub="Islamic Studies · Mtandaoni" />
      </main>

    </div>
  );
}
