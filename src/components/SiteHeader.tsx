import { Link, useRouter } from "@tanstack/react-router";
import {
  BookOpenCheck,
  Home,
  ArrowLeft,
  ArrowRight,
  Languages,
  UserCog,
  FileText,
  LogIn,
  CalendarCheck,
  Newspaper,
  Users,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function SiteHeader() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/50 bg-card/70 shadow-[0_1px_0_0_rgb(255_255_255/0.28),0_10px_30px_-24px_rgb(var(--shadow-tint)/0.45)] backdrop-blur-2xl backdrop-saturate-150">
        <div className="container mx-auto flex items-center justify-between gap-3 px-3 py-2.5 md:px-4 md:py-3">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="rounded-xl hover:bg-primary/15"
              onClick={() => router.history.back()}
              title={t("back")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="hidden rounded-xl hover:bg-primary/15 sm:inline-flex"
              onClick={() => router.history.forward()}
              title={t("forward")}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Link
              to="/"
              className="group flex min-w-0 items-center gap-2 font-extrabold text-foreground"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_1px_2px_-1px_rgb(var(--shadow-brand)/0.55),0_10px_24px_-12px_rgb(var(--shadow-brand)/0.7)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-3 group-hover:scale-105">
                <BookOpenCheck className="h-5 w-5" />
              </span>
              <span className="hidden max-w-48 truncate sm:inline">{t("title_app")}</span>
            </Link>
          </div>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-2xl border border-border/50 bg-background/55 p-1 text-sm shadow-[var(--shadow-inset)] backdrop-blur-xl backdrop-saturate-150 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              { to: "/", label: t("home"), icon: <Home className="h-3.5 w-3.5" /> },
              {
                to: "/elessons",
                label: t("nav_elearning"),
                icon: <GraduationCap className="h-3.5 w-3.5" />,
              },
              { to: "/register", label: t("register") },
              { to: "/exams", label: t("nav_exams") },
              { to: "/quiz", label: t("nav_quiz") },
              {
                to: "/semester-questions",
                label: t("nav_semester_qs"),
                icon: <FileText className="h-3.5 w-3.5" />,
              },
              {
                to: "/news",
                label: t("nav_news"),
                icon: <Newspaper className="h-3.5 w-3.5" />,
              },
              {
                to: "/tutor",
                label: t("nav_tutor"),
                icon: <Sparkles className="h-3.5 w-3.5" />,
              },
              { to: "/results", label: t("results") },
              {
                to: "/student",
                label: t("nav_student"),
                icon: <UserCog className="h-3.5 w-3.5" />,
              },
              {
                to: "/student#group-yangu",
                label: t("nav_group"),
                icon: <Users className="h-3.5 w-3.5" />,
              },
              {
                to: "/attendance",
                label: t("nav_attendance"),
                icon: <CalendarCheck className="h-3.5 w-3.5" />,
              },
              {
                to: "/account",
                label: t("nav_account"),
                icon: <LogIn className="h-3.5 w-3.5" />,
              },
              {
                to: "/cr",
                label: t("nav_cr"),
                icon: <UserCog className="h-3.5 w-3.5" />,
              },
              { to: "/admin", label: t("admin") },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 font-medium text-foreground/70 transition-[background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-primary/10 hover:text-primary"
                activeProps={{
                  className:
                    "flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-b from-primary to-primary/85 px-3 py-2 font-bold text-primary-foreground shadow-[0_1px_2px_-1px_rgb(var(--shadow-brand)/0.5),0_8px_18px_-10px_rgb(var(--shadow-brand)/0.6)]",
                }}
                activeOptions={{ exact: true }}
              >
                {l.icon}
                {l.label}
              </Link>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="ml-1 shrink-0 gap-1 rounded-xl border-primary/30 hover:bg-primary hover:text-primary-foreground"
              onClick={() => setLang(lang === "sw" ? "en" : "sw")}
            >
              <Languages className="h-4 w-4" /> {lang === "sw" ? "EN" : "SW"}
            </Button>
          </nav>
        </div>
      </header>
    </>
  );
}
