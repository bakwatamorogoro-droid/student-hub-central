import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageCircle, Send } from "lucide-react";
import { toast } from "@/lib/toast";

type Msg = { id: string; student_id: string; full_name: string; message: string; created_at: string };

export function GroupChat({ examId, student }: { examId: string; student: any }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const { data } = await supabase.from("group_messages")
      .select("id, student_id, full_name, message, created_at")
      .eq("exam_id", examId).eq("semina", student.semina).eq("student_group", student.student_group)
      .order("created_at").limit(500);
    setMsgs((data as Msg[]) || []);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel(`gchat-${examId}-${student.semina}-${student.student_group}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `exam_id=eq.${examId}` }, (p: any) => {
        const m = p.new;
        if (m.semina === student.semina && m.student_group === student.student_group) {
          setMsgs((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [examId, student.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const { error } = await supabase.from("group_messages").insert({
      exam_id: examId, semina: student.semina, student_group: student.student_group,
      student_id: student.id, full_name: student.full_name, message: body.slice(0, 1000),
    });
    setSending(false);
    if (error) return toast.error(error.message);
    setText("");
  };

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-background/70 p-3 space-y-2">
      <div className="text-sm font-bold flex items-center gap-1.5">
        <MessageCircle className="h-4 w-4 text-primary" /> Chumba cha Majadiliano — {student.student_group}
      </div>
      <p className="text-[11px] text-muted-foreground">Jadilini swali hapa pamoja, kisha mmoja wenu apakie/ajibu kazi kama kawaida.</p>
      <div className="h-64 overflow-y-auto rounded-lg bg-muted/30 p-2 space-y-1.5">
        {msgs.length === 0 && <div className="text-[11px] text-muted-foreground text-center py-6">Hakuna ujumbe bado — anza majadiliano.</div>}
        {msgs.map((m) => {
          const mine = m.student_id === student.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                {!mine && <div className="text-[10px] font-bold opacity-70">{m.full_name}</div>}
                <div className="break-words whitespace-pre-wrap" style={{ overflowWrap: "anywhere" }}>{m.message}</div>
                <div className="text-[9px] opacity-60 text-right">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <Input value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Andika ujumbe..."
          onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <Button onClick={send} disabled={sending || !text.trim()} size="icon"><Send className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
