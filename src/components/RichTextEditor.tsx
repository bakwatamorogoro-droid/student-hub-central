import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Bold, Italic, Underline, List, ListOrdered, Heading2, Heading3, Quote, Undo2, Redo2,
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon, Strikethrough, Palette, Type, Eraser,
  Copy, ClipboardPaste, CheckSquare, Trash2, Wand2,
} from "lucide-react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
};

const COLORS = ["#0f172a", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777"];
const SIZES = [
  { label: "Ndogo", val: "2" },
  { label: "Kawaida", val: "3" },
  { label: "Kubwa", val: "5" },
  { label: "Kichwa", val: "6" },
];

export function RichTextEditor({ value, onChange, placeholder, minHeight = 320 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [showColor, setShowColor] = useState(false);
  const [showSize, setShowSize] = useState(false);
  const [wc, setWc] = useState(0);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
      setWc(countWords(ref.current.innerText || ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const countWords = (t: string) => {
    const s = t.trim();
    return s ? s.split(/\s+/).length : 0;
  };

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    if (ref.current) {
      onChange(ref.current.innerHTML);
      setWc(countWords(ref.current.innerText || ""));
    }
    ref.current?.focus();
  };

  const handleInput = () => {
    if (ref.current) {
      onChange(ref.current.innerHTML);
      setWc(countWords(ref.current.innerText || ""));
    }
  };

  const insertLink = () => {
    const url = prompt("Weka URL (mfano: https://...)");
    if (url) exec("createLink", url);
  };

  const sanitizePastedHtml = (html: string) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    div.querySelectorAll("script,style,meta,link").forEach((n) => n.remove());
    div.querySelectorAll<HTMLElement>("*").forEach((el) => {
      [...el.attributes].forEach((a) => {
        if (a.name.startsWith("on") || a.name === "class" || a.name === "id") el.removeAttribute(a.name);
        if (a.name === "style") {
          const safe = a.value.replace(/expression\([^)]*\)|javascript:/gi, "");
          el.setAttribute("style", safe);
        }
      });
    });
    return div.innerHTML;
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    const clean = html ? sanitizePastedHtml(html) : text.replace(/\n/g, "<br>");
    document.execCommand("insertHTML", false, clean);
    if (ref.current) { onChange(ref.current.innerHTML); setWc(countWords(ref.current.innerText || "")); }
  };

  const copyAll = async () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    const text = ref.current.innerText || "";
    try {
      if (navigator.clipboard && (window as any).ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      toast.success("Imenakiliwa");
    } catch {
      toast.error("Imeshindwa kunakili");
    }
  };

  const pasteFromClipboard = async () => {
    try {
      ref.current?.focus();
      let html = ""; let text = "";
      if ((navigator.clipboard as any).read) {
        const items = await (navigator.clipboard as any).read();
        for (const it of items) {
          if (it.types.includes("text/html")) html = await (await it.getType("text/html")).text();
          else if (it.types.includes("text/plain")) text = await (await it.getType("text/plain")).text();
        }
      }
      if (!html && !text) text = await navigator.clipboard.readText();
      const clean = html ? sanitizePastedHtml(html) : text.replace(/\n/g, "<br>");
      document.execCommand("insertHTML", false, clean);
      if (ref.current) { onChange(ref.current.innerHTML); setWc(countWords(ref.current.innerText || "")); }
      toast.success("Imebandikwa");
    } catch {
      toast.error("Ruhusu clipboard kwenye browser kisha jaribu tena (au tumia Ctrl+V).");
    }
  };

  const importWord = async (file: File) => {
    try {
      const mammoth = await import("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const clean = sanitizePastedHtml(result.value);
      if (ref.current) {
        ref.current.innerHTML = (ref.current.innerHTML || "") + clean;
        onChange(ref.current.innerHTML);
        setWc(countWords(ref.current.innerText || ""));
      }
      toast.success(`Word imeingizwa (${countWords(result.value.replace(/<[^>]+>/g, " "))} maneno)`);
    } catch (err: any) {
      console.error(err);
      toast.error("Imeshindwa kusoma Word file. Hakikisha ni .docx");
    }
  };

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-card shadow-md overflow-hidden max-w-full">
      <div className="flex flex-wrap gap-1 p-2 border-b bg-gradient-to-r from-primary/5 to-emerald-500/5 sticky top-0 z-10">
        <ToolBtn onClick={() => exec("bold")} title="Bold (Ctrl+B)" label="Bold"><Bold className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("italic")} title="Italic" label="Italic"><Italic className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("underline")} title="Underline" label="Pigia"><Underline className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("strikeThrough")} title="Strike" label="Futia"><Strikethrough className="h-4 w-4" /></ToolBtn>
        <Sep />
        <ToolBtn onClick={() => exec("formatBlock", "<h2>")} title="Kichwa Kikubwa" label="H2"><Heading2 className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("formatBlock", "<h3>")} title="Kichwa Kidogo" label="H3"><Heading3 className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("formatBlock", "<blockquote>")} title="Nukuu" label="Nukuu"><Quote className="h-4 w-4" /></ToolBtn>
        <Sep />
        <ToolBtn onClick={() => exec("insertUnorderedList")} title="Orodha" label="Orodha"><List className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("insertOrderedList")} title="Orodha ya tarakimu" label="1,2,3"><ListOrdered className="h-4 w-4" /></ToolBtn>
        <Sep />
        <ToolBtn onClick={() => exec("justifyLeft")} title="Kushoto" label="Kushoto"><AlignLeft className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("justifyCenter")} title="Katikati" label="Kati"><AlignCenter className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("justifyRight")} title="Kulia" label="Kulia"><AlignRight className="h-4 w-4" /></ToolBtn>
        <Sep />
        <div className="relative">
          <ToolBtn onClick={() => { setShowColor((v) => !v); setShowSize(false); }} title="Rangi" label="Rangi"><Palette className="h-4 w-4" /></ToolBtn>
          {showColor && (
            <div className="absolute top-full left-0 mt-1 bg-popover border-2 rounded-lg p-2 shadow-xl z-20 grid grid-cols-5 gap-1">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => { exec("foreColor", c); setShowColor(false); }}
                  className="h-6 w-6 rounded border-2 border-white shadow hover:scale-110 transition" style={{ background: c }} />
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <ToolBtn onClick={() => { setShowSize((v) => !v); setShowColor(false); }} title="Saizi" label="Saizi"><Type className="h-4 w-4" /></ToolBtn>
          {showSize && (
            <div className="absolute top-full left-0 mt-1 bg-popover border-2 rounded-lg p-1 shadow-xl z-20 min-w-[120px]">
              {SIZES.map((s) => (
                <button key={s.val} type="button" onClick={() => { exec("fontSize", s.val); setShowSize(false); }}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted rounded">{s.label}</button>
              ))}
            </div>
          )}
        </div>
        <ToolBtn onClick={insertLink} title="Weka Link" label="Link"><LinkIcon className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("removeFormat")} title="Futa Mpangilio" label="Futa"><Eraser className="h-4 w-4" /></ToolBtn>
        <Sep />
        <ToolBtn onClick={copyAll} title="Nakili Yote" label="Nakili"><Copy className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={pasteFromClipboard} title="Bandika" label="Bandika"><ClipboardPaste className="h-4 w-4" /></ToolBtn>
        <Sep />
        <label className="inline-flex flex-col items-center justify-center h-auto min-h-8 px-2 py-1 gap-0.5 hover:bg-primary/10 rounded-md cursor-pointer text-foreground" title="Pakua Word file (.docx) — itasomwa kiotomatiki">
          <span className="text-[11px] font-bold">📄 .docx</span>
          <span className="text-[9px] font-medium text-muted-foreground leading-none">Pakia Word</span>
          <input
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importWord(f);
              e.target.value = "";
            }}
          />
        </label>
        <Sep />
        <ToolBtn
          onClick={() => {
            ref.current?.focus();
            document.execCommand("selectAll");
          }}
          title="Chagua yote (Ctrl+A)"
          label="Chagua"
        ><CheckSquare className="h-4 w-4" /></ToolBtn>
        <ToolBtn
          onClick={() => {
            if (!ref.current) return;
            if (!ref.current.innerText.trim() || confirm("Futa kazi yote uliyoandika?")) {
              ref.current.innerHTML = "";
              onChange("");
              setWc(0);
              ref.current.focus();
            }
          }}
          title="Futa yote"
          label="Futa Yote"
        ><Trash2 className="h-4 w-4" /></ToolBtn>
        <ToolBtn
          onClick={() => {
            if (!ref.current) return;
            ref.current.focus();
            document.execCommand("selectAll");
            document.execCommand("removeFormat");
            // Normalize block: convert any divs to <p>
            const html = ref.current.innerHTML
              .replace(/<div(\s[^>]*)?>/gi, "<p>")
              .replace(/<\/div>/gi, "</p>")
              .replace(/<p>\s*<\/p>/gi, "");
            ref.current.innerHTML = html;
            onChange(ref.current.innerHTML);
            toast.success("Mpangilio umesafishwa");
          }}
          title="Fomati kazi (safisha mpangilio)"
          label="Fomati"
        ><Wand2 className="h-4 w-4" /></ToolBtn>
        <Sep />
        <ToolBtn onClick={() => exec("undo")} title="Tendua" label="Tendua"><Undo2 className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("redo")} title="Rudia" label="Rudia"><Redo2 className="h-4 w-4" /></ToolBtn>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder || "Andika kazi yako hapa…"}
        className="rte-content prose prose-sm dark:prose-invert max-w-none p-4 focus:outline-none break-words"
        style={{ minHeight, userSelect: "text", wordBreak: "break-word", overflowWrap: "anywhere" }}
      />
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-muted-foreground border-t bg-muted/30 flex-wrap">
        <span className="truncate">✨ Rich Text — tumia toolbar kupanga maandishi</span>
        <span className="font-mono shrink-0">Maneno: <b className="text-primary">{wc}</b></span>
      </div>
      <style>{`
        .rte-content:empty:before { content: attr(data-placeholder); color: hsl(var(--muted-foreground)); pointer-events: none; }
        .rte-content h2 { font-size: 1.5rem; font-weight: 800; margin: 0.6em 0 0.3em; }
        .rte-content h3 { font-size: 1.2rem; font-weight: 700; margin: 0.5em 0 0.3em; }
        .rte-content ul { list-style: disc; padding-left: 1.5rem; }
        .rte-content ol { list-style: decimal; padding-left: 1.5rem; }
        .rte-content blockquote { border-left: 4px solid hsl(var(--primary)); padding: 0.25rem 0.75rem; color: hsl(var(--muted-foreground)); font-style: italic; background: hsl(var(--muted)/0.3); border-radius: 0 0.25rem 0.25rem 0; }
        .rte-content a { color: hsl(var(--primary)); text-decoration: underline; }
        .rte-content p { margin: 0.4em 0; line-height: 1.65; }
        .rte-content img, .rte-content table { max-width: 100%; height: auto; }
      `}</style>
    </div>
  );
}

function Sep() { return <span className="w-px bg-border mx-1 self-stretch" />; }
function ToolBtn({ children, onClick, title, label }: { children: React.ReactNode; onClick: () => void; title: string; label?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-auto min-h-8 px-2 py-1 gap-0.5 hover:bg-primary/10 flex flex-col items-center justify-center leading-none"
      onClick={onClick}
      title={title}
    >
      {children}
      {label && <span className="text-[9px] font-medium text-muted-foreground mt-0.5">{label}</span>}
    </Button>
  );
}
