import { Link, useRouter } from "@tanstack/react-router";
import { BookOpenCheck, Home, ArrowLeft, ArrowRight, Languages } from "lucide-react";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function SiteHeader() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  return (
    <>
      <AnnouncementBanner />
      <header className="border-b border-primary/20 bg-gradient-to-r from-primary/10 via-card/95 to-secondary/15 backdrop-blur-xl sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" className="rounded-full hover:bg-primary/15 hover:scale-110 transition-all" onClick={() => router.history.back()} title={t("back")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="rounded-full hover:bg-primary/15 hover:scale-110 transition-all" onClick={() => router.history.forward()} title={t("forward")}>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Link to="/" className="flex items-center gap-2 font-extrabold bg-gradient-to-r from-primary via-primary to-secondary-foreground bg-clip-text text-transparent">
              <BookOpenCheck className="h-6 w-6 text-primary" />
              <span className="hidden sm:inline">{t("title_app")}</span>
            </Link>
          </div>
          <nav className="flex gap-1 text-sm items-center bg-background/50 rounded-full p-1 border border-primary/10 shadow-inner">
            {[
              { to: "/", label: t("home"), icon: <Home className="h-3.5 w-3.5" /> },
              { to: "/register", label: t("register") },
              { to: "/exams", label: t("exams") },
              { to: "/quiz", label: "Quiz" },
              { to: "/pdf-quiz", label: "PDF Quiz" },
              { to: "/results", label: t("results") },
              { to: "/student", label: "Huduma" },
              { to: "/admin", label: t("admin") },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="px-3 py-1.5 rounded-full font-medium text-foreground/80 hover:text-primary-foreground hover:bg-gradient-to-r hover:from-primary hover:to-primary/80 hover:shadow-md transition-all flex items-center gap-1"
                activeProps={{ className: "px-3 py-1.5 rounded-full font-bold bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md flex items-center gap-1" }}
                activeOptions={{ exact: true }}
              >
                {l.icon}{l.label}
              </Link>
            ))}
            <Button size="sm" variant="outline" className="ml-2 gap-1 rounded-full border-primary/30 hover:bg-primary hover:text-primary-foreground transition-all" onClick={() => setLang(lang === "sw" ? "en" : "sw")}>
              <Languages className="h-4 w-4" /> {lang === "sw" ? "EN" : "SW"}
            </Button>
          </nav>
        </div>
      </header>
    </>
  );
}