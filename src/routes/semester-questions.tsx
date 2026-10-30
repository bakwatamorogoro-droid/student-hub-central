import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import {
  FileText,
  Download,
  ExternalLink,
  Search,
  CheckCircle2,
  GraduationCap,
} from "lucide-react";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { StudentMatchesPicker, type Student } from "@/components/StudentMatchesPicker";
import { ACTIVE_SEMESTERS } from "@/lib/academicTargeting";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/semester-questions")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Maswali ya Semester — Islamic Studies Test Online" },
      {
        name: "description",
        content: "Angalia na pakua maswali ya semester yaliyowekwa na mwalimu kwa muundo wa PDF.",
      },
      { property: "og:title", content: "Maswali ya Semester — Islamic Studies Test Online" },
    ],
  }),
});

type Paper = {
  id: string;
  title: string;
  file_url: string | null;
  file_name: string | null;
  target_semester: string | null;
  target_study_year: number | null;
  created_at: string;
};

// `target_semester` is not in the generated `exam_pdfs` types until the semester
// migration lands, so query through a narrow shape instead of the generated client.
type PaperQuery = {
  eq: (column: string, value: unknown) => PaperQuery;
  order: (column: string, opts: { ascending: boolean }) => Promise<{ data: Paper[] | null }>;
};

function papersTable(): { select: (columns: string) => PaperQuery } {
  return (
    supabase as unknown as { from: (table: string) => { select: (c: string) => PaperQuery } }
  ).from("exam_pdfs");
}

function Page() {
  const { t } = useI18n();
  const [reg, setReg] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [matches, setMatches] = useState<Student[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const r = localStorage.getItem("student_reg");
    if (r) {
      setReg(r);
      lookup(r);
    } else {
      loadPapers(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPapers = async (s: Student | null) => {
    let { data } = await papersTable()
      .select("id,title,file_url,file_name,target_semester,target_study_year,created_at")
      .eq("active", true)
      .eq("is_assignment", false)
      .order("created_at", { ascending: false });
    if (!data) {
      // `target_semester` arrives with the semester migration; without it every
      // paper is simply visible rather than the page appearing empty.
      const retry = await papersTable()
        .select("id,title,file_url,file_name,target_study_year,created_at")
        .eq("active", true)
        .eq("is_assignment", false)
        .order("created_at", { ascending: false });
      data = retry.data;
    }
    const rows = (data || []).filter((p) => {
      // Only the semester the owner has switched on is visible.
      if (p.target_semester && !ACTIVE_SEMESTERS.includes(p.target_semester)) return false;
      // A paper aimed at one study year only shows for that year.
      if (p.target_study_year && s && Number(p.target_study_year) !== Number(s.study_year))
        return false;
      return true;
    });
    setPapers(rows);
  };

  const confirmStudent = (s: Student) => {
    setStudent(s);
    setMatches([]);
    setReg(s.reg_no);
    localStorage.setItem("student_reg", s.reg_no);
    loadPapers(s);
  };

  const lookup = async (r: string) => {
    if (!r) return;
    setLoading(true);
    const results = await findStudentsByQuery(r);
    setLoading(false);
    if (results.length === 0) {
      toast.error("Hakuna mwanafunzi anayelingana. Hakikisha umeandika sahihi au jisajili.");
      setStudent(null);
      setMatches([]);
      loadPapers(null);
      return;
    }
    if (results.length === 1) {
      confirmStudent(results[0]);
      return;
    }
    setStudent(null);
    setMatches(results);
    toast.info(`Tumepata ${results.length} wanafunzi — chagua wewe ni nani.`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10">
      <SiteHeader />
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <div className="relative mb-6 overflow-hidden rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/12 via-card to-secondary/15 p-6 text-center shadow-lg">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <FileText className="h-3 w-3" /> PDF
            </div>
            <h1 className="mt-3 bg-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-black tracking-tight text-transparent md:text-4xl">
              {t("semester_qs_title")}
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              {t("semester_qs_sub")}
            </p>
          </div>
        </div>

        <Card className="mb-6 border-2 border-primary/25 shadow-lg">
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={reg}
                onChange={(e) => setReg(e.target.value.toUpperCase())}
                placeholder={t("reg_placeholder")}
                className="flex-1 font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter") lookup(reg);
                }}
              />
              <Button onClick={() => lookup(reg)} disabled={loading || !reg} className="font-bold">
                <Search className="mr-1 h-4 w-4" /> {t("look_up")}
              </Button>
            </div>
            {student && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <b>{student.full_name}</b>
                <span className="text-muted-foreground">• {student.reg_no}</span>
                <span className="ml-auto flex items-center gap-1 text-xs">
                  <GraduationCap className="h-3 w-3" />
                  {student.study_year ? `Mwaka wa ${student.study_year}` : "Mwaka haujawekwa"}
                </span>
              </div>
            )}
            {matches.length > 0 && (
              <StudentMatchesPicker
                matches={matches}
                onConfirm={confirmStudent}
                onCancel={() => setMatches([])}
              />
            )}
          </CardContent>
        </Card>

        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <FileText className="h-5 w-5 text-primary" /> {t("semester_qs_title")} ({papers.length})
        </h2>

        {papers.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t("semester_qs_empty")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {papers.map((p) => (
              <Card
                key={p.id}
                className="group border-2 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-xl"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-start justify-between gap-2 text-base">
                    <span className="leading-tight">{p.title}</span>
                    {p.target_semester && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                        {p.target_semester}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-[11px] text-muted-foreground">
                    {p.target_study_year ? `Mwaka wa ${p.target_study_year} · ` : ""}
                    {new Date(p.created_at).toLocaleDateString("sw-TZ")}
                  </div>
                  {p.file_url ? (
                    <div className="flex gap-2">
                      <Button asChild size="sm" className="flex-1">
                        <a href={p.file_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1 h-3 w-3" /> {t("open_pdf")}
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <a href={p.file_url} download={p.file_name || undefined}>
                          <Download className="mr-1 h-3 w-3" /> {t("download_pdf")}
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("semester_qs_empty")}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {!student && (
            <Link to="/register" className="text-primary underline">
              {t("register")}
            </Link>
          )}
        </p>
      </main>
    </div>
  );
}
