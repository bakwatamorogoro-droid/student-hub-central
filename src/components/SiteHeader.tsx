import { Link, useRouter } from "@tanstack/react-router";
import { BookOpenCheck, Home, ArrowLeft, ArrowRight, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function SiteHeader() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-primary/15 bg-card/75 shadow-soft backdrop-blur-2xl">
        <div className="container mx-auto flex items-center justify-between gap-3 px-3 py-2.5 md:px-4">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" className="rounded-xl hover:bg-primary/15" onClick={() => router.history.back()} title={t("back")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="hidden rounded-xl hover:bg-primary/15 sm:inline-flex" onClick={() => router.history.forward()} title={t("forward")}>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Link to="/" className="group flex min-w-0 items-center gap-2 font-extrabold text-foreground">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105"><BookOpenCheck className="h-5 w-5" /></span>
              <span className="hidden max-w-48 truncate sm:inline">{t("title_app")}</span>
            </Link>
          </div>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-primary/10 bg-background/50 p-1 text-sm shadow-inner [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              { to: "/", label: t("home"), icon: <Home className="h-3.5 w-3.5" /> },
              { to: "/register", label: t("register") },
              { to: "/exams", label: t("exams") },
              { to: "/quiz", label: "Assignment" },
              { to: "/results", label: t("results") },
              { to: "/student", label: "Huduma" },
              { to: "/admin", label: t("admin") },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 font-medium text-foreground/80 transition-all hover:bg-primary/10 hover:text-primary"
                activeProps={{ className: "flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 font-bold text-primary-foreground shadow-md" }}
                activeOptions={{ exact: true }}
              >
                {l.icon}{l.label}
              </Link>
            ))}
            <Button size="sm" variant="outline" className="ml-1 shrink-0 gap-1 rounded-lg border-primary/30 hover:bg-primary hover:text-primary-foreground" onClick={() => setLang(lang === "sw" ? "en" : "sw")}>
              <Languages className="h-4 w-4" /> {lang === "sw" ? "EN" : "SW"}
            </Button>
          </nav>
        </div>
      </header>
    </>
  );
}