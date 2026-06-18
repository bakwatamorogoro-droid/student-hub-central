import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Clock, ArrowRight, AlertCircle } from "lucide-react";

export function HomeAssignments() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase
      .from("exam_pdfs" as any)
      .select("*")
      .eq("is_assignment", true)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(6)
      .then(({ data }: { data: any }) => setItems((data as any[]) || []));
  }, []);

  if (items.length === 0) return null;

  const now = Date.now();

  return (
    <section className="max-w-6xl mx-auto mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> Kazi za Nyumbani (Assignment)
        </h2>
        <Link to="/pdf-quiz" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
          Zote <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((a) => {
          const due = a.due_at ? new Date(a.due_at).getTime() : null;
          const overdue = due ? now > due : false;
          return (
            <Link key={a.id} to="/pdf-quiz" search={{ a: a.id } as any} className="group">
              <Card className="h-full border-2 hover:border-primary hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-primary/10 to-transparent">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold leading-tight">{a.title}</div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold shrink-0">{a.points} alama</span>
                  </div>
                  {a.assignment_text && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.assignment_text}</p>
                  )}
                  <div className="flex items-center gap-2 text-[11px] flex-wrap">
                    {a.file_url && <a href={a.file_url} target="_blank" rel="noreferrer" className="text-primary underline">📄 Pakua maswali</a>}
                    {due && (
                      <span className={`inline-flex items-center gap-1 ${overdue ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                        {overdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        Mwisho: {new Date(a.due_at).toLocaleString("sw-TZ")}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}