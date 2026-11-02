import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadLiveAttendance, type LiveAttendance } from "@/lib/attendance";

/**
 * How often the counter re-reads the head count.
 *
 * Realtime carries the arrival itself, so this is only a safety net for a
 * dropped socket and for the count changing for any reason other than an
 * insert. Short enough that a teacher watching a hall sees it move.
 */
const POLL_MS = 20_000;

/**
 * The live head count, refreshed by realtime and by a slow poll.
 *
 * `quiz_participants` is already in the realtime publication, so an INSERT is
 * what an arrival looks like. The poll stays because a websocket that dies
 * silently would otherwise freeze the number at whatever it last read, and a
 * frozen number is worse than a slightly late one.
 */
export function useLiveAttendance(enabled = true): {
  live: LiveAttendance | null;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [live, setLive] = useState<LiveAttendance | null>(null);
  const [loading, setLoading] = useState(enabled);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    try {
      const next = await loadLiveAttendance();
      if (mounted.current) setLive(next);
    } catch {
      // A failed read must not blank the card; the next tick retries.
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();

    const channel = supabase
      .channel("attendance-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quiz_participants" },
        () => void reload(),
      )
      .subscribe();

    const timer = setInterval(() => void reload(), POLL_MS);
    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, reload]);

  return { live, loading, reload };
}
