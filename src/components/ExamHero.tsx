import { useI18n } from "@/lib/i18n";
import { EXAM_HERO_IMAGE } from "@/lib/mediaAssets";

/**
 * The picture that heads the exam page.
 *
 * A still rather than a looping clip: the page it sits above is a form a
 * student reads before sitting a test, and a muted video behind the
 * instructions pulled the eye away from them.
 *
 * Nothing is written over the picture. The photograph already carries the
 * classroom, the students and the light, and a caption laid across it would
 * cover the faces it is there to show.
 */
export function ExamHero() {
  const { t } = useI18n();

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-primary/25 shadow-2xl">
      <img
        src={EXAM_HERO_IMAGE}
        alt={t("exam_hero_alt")}
        width={1600}
        height={900}
        loading="eager"
        decoding="async"
        className="aspect-[16/9] w-full object-cover object-center"
      />
    </section>
  );
}

export function BigSystemTitle({
  label = "ISLAMIC STUDIES TEST ONLINE",
  sub,
}: {
  label?: string;
  sub?: string;
}) {
  return (
    <div className="my-10 text-center">
      <h2 className="bg-gradient-to-b from-primary via-primary/80 to-primary/30 bg-clip-text text-4xl font-black leading-none tracking-tighter text-transparent md:text-7xl">
        {label}
      </h2>
      {sub && (
        <p className="mt-2 text-xs uppercase tracking-[0.35em] text-muted-foreground md:text-sm">
          {sub}
        </p>
      )}
    </div>
  );
}
