/**
 * The E-Learning shelf: reading and writing the `elessons` rows.
 *
 * The row shape, the category list and the two ways the public page reads the
 * table live here, so the admin form and the student page cannot disagree about
 * what a lesson is. The link parsing is in `elesson.ts` and the question
 * building in `elessonQuiz.ts`; this file only moves rows.
 */

import { supabase } from "@/integrations/supabase/client";
import { isMissingColumnError } from "@/lib/studentProfile";
import type { LessonProvider } from "@/lib/elesson";
import { readLessonQuiz, type LessonQuestion } from "@/lib/elessonQuiz";

export type LessonCategory = "lecture" | "mawaidha" | "duruus" | "other";

/** The four shelves a lesson can sit on. Frozen: the owner asked for these. */
export const LESSON_CATEGORIES: LessonCategory[] = ["lecture", "mawaidha", "duruus", "other"];

export const LESSON_CATEGORY_LABELS: Record<LessonCategory, { sw: string; en: string }> = {
  lecture: { sw: "Lecture", en: "Lecture" },
  mawaidha: { sw: "Mawaidha", en: "Sermons" },
  duruus: { sw: "Duruus", en: "Lessons" },
  other: { sw: "Nyingine", en: "Other" },
};

export const LESSON_CATEGORY_ICONS: Record<LessonCategory, string> = {
  lecture: "🎓",
  mawaidha: "🕌",
  duruus: "📖",
  other: "🎬",
};

export function normalizeLessonCategory(value: unknown): LessonCategory {
  const v = String(value ?? "").toLowerCase();
  return (LESSON_CATEGORIES as string[]).includes(v) ? (v as LessonCategory) : "other";
}

export type Lesson = {
  id: string;
  provider: LessonProvider;
  videoId: string | null;
  url: string;
  embedUrl: string;
  thumbnailUrl: string | null;
  category: LessonCategory;
  title: string;
  titleEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  quiz: LessonQuestion[];
  sourceMeta: Record<string, unknown> | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/** One row as PostgREST returns it. */
type LessonRow = {
  id: string;
  provider: string;
  video_id: string | null;
  url: string;
  embed_url: string;
  thumbnail_url: string | null;
  category: string;
  title: string;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  quiz: unknown;
  source_meta: unknown;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const PROVIDERS: LessonProvider[] = ["youtube", "tiktok", "facebook"];

function toLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    provider: (PROVIDERS as string[]).includes(row.provider)
      ? (row.provider as LessonProvider)
      : "youtube",
    videoId: row.video_id,
    url: row.url,
    embedUrl: row.embed_url,
    thumbnailUrl: row.thumbnail_url,
    category: normalizeLessonCategory(row.category),
    title: row.title,
    titleEn: row.title_en,
    description: row.description,
    descriptionEn: row.description_en,
    quiz: readLessonQuiz(row.quiz),
    sourceMeta: (row.source_meta as Record<string, unknown> | null) ?? null,
    active: row.active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every lesson, newest first, for the admin list. */
export async function loadAllLessons(): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from("elessons")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error as unknown as Error;
  return ((data as unknown as LessonRow[]) ?? []).map(toLesson);
}

/** The lessons a student may see: the ones the admin left switched on. */
export async function loadLiveLessons(): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from("elessons")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) throw error as unknown as Error;
  return ((data as unknown as LessonRow[]) ?? []).map(toLesson);
}

export type LessonInput = {
  provider: LessonProvider;
  videoId: string | null;
  url: string;
  embedUrl: string;
  thumbnailUrl: string | null;
  category: LessonCategory;
  title: string;
  titleEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  quiz: LessonQuestion[];
  sourceMeta: Record<string, unknown> | null;
  active?: boolean;
};

export async function createLesson(input: LessonInput): Promise<Lesson> {
  const { data, error } = await supabase
    .from("elessons")
    .insert({
      provider: input.provider,
      video_id: input.videoId,
      url: input.url,
      embed_url: input.embedUrl,
      thumbnail_url: input.thumbnailUrl,
      category: input.category,
      title: input.title,
      title_en: input.titleEn,
      description: input.description,
      description_en: input.descriptionEn,
      quiz: input.quiz as never,
      source_meta: input.sourceMeta as never,
      active: input.active !== false,
    })
    .select()
    .single();
  if (error) throw error as unknown as Error;
  return toLesson(data as unknown as LessonRow);
}

export async function updateLesson(id: string, input: Partial<LessonInput>): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.provider !== undefined) patch.provider = input.provider;
  if (input.videoId !== undefined) patch.video_id = input.videoId;
  if (input.url !== undefined) patch.url = input.url;
  if (input.embedUrl !== undefined) patch.embed_url = input.embedUrl;
  if (input.thumbnailUrl !== undefined) patch.thumbnail_url = input.thumbnailUrl;
  if (input.category !== undefined) patch.category = input.category;
  if (input.title !== undefined) patch.title = input.title;
  if (input.titleEn !== undefined) patch.title_en = input.titleEn;
  if (input.description !== undefined) patch.description = input.description;
  if (input.descriptionEn !== undefined) patch.description_en = input.descriptionEn;
  if (input.quiz !== undefined) patch.quiz = input.quiz;
  if (input.sourceMeta !== undefined) patch.source_meta = input.sourceMeta;
  if (input.active !== undefined) patch.active = input.active;

  const { error } = await supabase
    .from("elessons")
    .update(patch as never)
    .eq("id", id);
  if (error) throw error as unknown as Error;
}

export async function deleteLesson(id: string): Promise<void> {
  const { error } = await supabase.from("elessons").delete().eq("id", id);
  if (error) throw error as unknown as Error;
}

/** Switch a lesson on or off without touching anything else. */
export async function setLessonActive(id: string, active: boolean): Promise<void> {
  await updateLesson(id, { active });
}

/**
 * What the provider says about a link.
 *
 * YouTube and TikTok both answer an oEmbed request from the browser (both send
 * permissive CORS headers), which is how the admin gets a real title and a
 * poster frame for a pasted link. Facebook's endpoint refuses without an access
 * token, so it returns nothing rather than failing — the admin then types the
 * title, which is the honest outcome.
 *
 * A failed lookup is never fatal: the lesson is saved with whatever the admin
 * typed. It only ever *fills in* fields the admin has left blank.
 */
export type LessonPreview = {
  title: string | null;
  author: string | null;
  thumbnailUrl: string | null;
};

export async function fetchLessonPreview(input: {
  provider: LessonProvider;
  url: string;
  videoId: string | null;
}): Promise<LessonPreview | null> {
  const empty: LessonPreview = { title: null, author: null, thumbnailUrl: null };

  try {
    if (input.provider === "youtube") {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(input.url)}&format=json`,
      );
      if (!res.ok) return empty;
      const d = (await res.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      return {
        title: d.title?.trim() || null,
        author: d.author_name?.trim() || null,
        thumbnailUrl: input.videoId
          ? `https://i.ytimg.com/vi/${input.videoId}/hqdefault.jpg`
          : d.thumbnail_url || null,
      };
    }

    if (input.provider === "tiktok") {
      const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(input.url)}`);
      if (!res.ok) return empty;
      const d = (await res.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      // TikTok's title is the whole caption, often with hashtags. The first line
      // is the useful part, so that is what is offered.
      const firstLine = (d.title || "").split("\n")[0].trim();
      return {
        title: firstLine || null,
        author: d.author_name?.trim() || null,
        thumbnailUrl: d.thumbnail_url || null,
      };
    }
  } catch {
    /* a lookup that fails leaves the admin to type the fields */
  }

  return empty;
}

/**
 * Follow a provider *share* short link to its real address.
 *
 * Facebook's share button gives `facebook.com/share/v/<code>` and
 * `fb.watch/<code>`, and TikTok's gives `vm.tiktok.com/<code>`. The id is not
 * in those links and the embed player refuses them, so the redirect has to be
 * followed first — which the browser cannot do itself, because Facebook sends
 * no CORS header on the redirect and `fetch` throws before `Location` can be
 * read. The hop is done by `/api/resolve-link` instead.
 *
 * Returns the canonical URL, or null when the hop failed. A null is not fatal:
 * the admin can still paste the canonical link, or the lesson can be saved from
 * the provider's own share page. Callers should treat it as "type the link from
 * the video's address bar".
 */
export async function resolveLessonShareLink(url: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/resolve-link?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data.url?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * True when the lesson table is missing.
 *
 * The page uses this to explain the situation rather than showing a raw
 * PostgREST error. It should not happen — the migration is applied — but a
 * preview deploy against a project that has not had it applied would otherwise
 * show a stack trace.
 */
export function isMissingLessonsTable(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error ?? "");
  if (/relation .*elessons.* does not exist/i.test(message)) return true;
  const code = (error as { code?: string })?.code;
  return (
    code === "42P01" ||
    (code === "PGRST205" && /elessons/i.test(message)) ||
    isMissingColumnError(error)
  );
}
