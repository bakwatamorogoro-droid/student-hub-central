import type { QueryClient } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter } from "@tanstack/react-router";

import { I18nProvider, useI18n } from "@/lib/i18n";
import { LockGate } from "@/components/LockGate";
import { PageLoader } from "@/components/PageLoader";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-black tracking-tight text-primary/80">404</h1>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_1px_2px_-1px_rgb(var(--shadow-brand)/0.45),0_10px_28px_-12px_rgb(var(--shadow-brand)/0.55)] transition-[transform,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-primary/92"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_1px_2px_-1px_rgb(var(--shadow-brand)/0.45),0_10px_28px_-12px_rgb(var(--shadow-brand)/0.55)] transition-[transform,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-primary/92"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-input bg-background/70 px-5 py-2.5 text-sm font-semibold text-foreground backdrop-blur-md transition-[transform,background-color,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/70"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  return (
    <I18nProvider>
      {/* One grain layer for the whole app, behind everything, drawn once. */}
      <div className="grain-layer" aria-hidden="true" />
      <LockGate>
        <Outlet />
        <SiteFooter />
      </LockGate>
      <PageLoader />
    </I18nProvider>
  );
}

function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="mt-16 border-t border-border/50 bg-card/60 backdrop-blur-xl backdrop-saturate-150">
      <div className="container mx-auto space-y-4 px-4 py-10 text-center">
        <div className="flex flex-col items-center gap-1">
          <span className="font-display text-base font-black tracking-tight text-foreground">
            {t("system_full_name")}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/90">
            {t("founder_title")} · {t("founder_name")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{t("footer_note")}</p>
      </div>
    </footer>
  );
}
