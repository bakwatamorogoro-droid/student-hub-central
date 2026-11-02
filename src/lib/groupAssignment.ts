/**
 * The cohort shape the owner asked for: 15 seminars, and inside each seminar 11
 * gender-pure groups of 8. A group is therefore identified by the triple
 * (semina, gender, student_group) — which is why `student_group` stays a bare
 * "GROUP n" and the gender stays on the student row.
 *
 * Everything here is pure and import-free so `node --test` can exercise the
 * boundaries directly. The Supabase reads and writes live in `groupRoster.ts`.
 */

export type Gender = "male" | "female" | "unknown";

export const SEMINAR_COUNT = 15;
export const SEMINARS: string[] = Array.from(
  { length: SEMINAR_COUNT },
  (_, i) => `SEMINA ${i + 1}`,
);

export const GROUPS_PER_SEMINAR = 11;
export const GROUP_SIZE = 8;
export const GROUP_NAMES: string[] = Array.from(
  { length: GROUPS_PER_SEMINAR },
  (_, i) => `GROUP ${i + 1}`,
);

/** 11 × 8 — the most one gender can hold in a single seminar. */
export const SEATS_PER_SEMINAR_PER_GENDER = GROUPS_PER_SEMINAR * GROUP_SIZE;

export type RosterEntry = {
  id: string;
  reg_no?: string | null;
  full_name?: string | null;
  semina?: string | null;
  gender?: string | null;
  student_group?: string | null;
};

export type GroupMember = { id: string; reg_no: string; full_name: string };

/**
 * "Mwanamke" starts with an M, so a first-letter test files every woman as male.
 * Whole words only, and the female forms are checked first.
 */
const FEMALE_WORDS = new Set([
  "f",
  "ke",
  "mke",
  "kike",
  "female",
  "fem",
  "mwanamke",
  "wanawake",
  "mama",
]);
const MALE_WORDS = new Set(["m", "me", "mume", "kiume", "male", "man", "mwanaume", "wanaume"]);

export function normalizeGender(raw: string | null | undefined): Gender {
  const text = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!text) return "unknown";
  // Split on anything that is not a letter so "Mwanamke Mwema" is two tokens,
  // and a lone "N" stays one unreadable token rather than matching by prefix.
  const tokens = text.split(/[^a-z]+/).filter(Boolean);
  for (const token of tokens) {
    if (FEMALE_WORDS.has(token)) return "female";
    if (MALE_WORDS.has(token)) return "male";
  }
  for (const token of tokens) {
    if (token.startsWith("mwanamke") || token.startsWith("wanawake") || token.startsWith("female"))
      return "female";
    if (token.startsWith("mwanaume") || token.startsWith("wanaume") || token.startsWith("male"))
      return "male";
  }
  return "unknown";
}

export const genderLabel = (g: Gender): string =>
  g === "female" ? "Wanawake" : g === "male" ? "Wanaume" : "Jinsia haijulikani";

/** "S1" / "Semina 2" / "SEMINA 10" → "SEMINA 1" / "SEMINA 2" / "SEMINA 10". */
export function normalizeSeminar(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const digits = v.match(/\d+/);
  if (!digits) return null;
  const n = Number(digits[0]);
  if (!Number.isFinite(n) || n < 1) return null;
  return `SEMINA ${n}`;
}

/** Accepts the legacy double-space "GROUP  7" and returns a real group name. */
export function normalizeGroupName(raw: string | null | undefined): string | null {
  const v = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  return GROUP_NAMES.includes(v) ? v : null;
}

/**
 * The imported cohort spells one Reg Namba several ways — "MUM2025-04-14106",
 * "MUM 2025-04-13988", "MUM2025_04_15550" — with and without trailing spaces.
 * They are the same key, so a student who types their Reg Namba normally still
 * finds themselves and their group.
 */
export function regKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function compareByRegNo(a: RosterEntry, b: RosterEntry): number {
  const ra = regKey(a.reg_no);
  const rb = regKey(b.reg_no);
  if (ra !== rb) return ra < rb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareSeminar(a: string, b: string): number {
  return (Number(a.replace(/\D+/g, "")) || 0) - (Number(b.replace(/\D+/g, "")) || 0);
}

/**
 * Keeps every student in the seminar they already have and balances the rest
 * across SEMINA 1…15. A value past the target 15 (the imported cohort carries a
 * SEMINA 16) is preserved rather than silently moved, the same way
 * `directory.ts` keeps stray values selectable instead of dropping them.
 */
export function assignSeminar(roster: RosterEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  const counts = new Map<string, number>(SEMINARS.map((s) => [s, 0]));
  const pending: RosterEntry[] = [];

  for (const s of roster) {
    const keep = normalizeSeminar(s.semina);
    if (keep) {
      out[s.id] = keep;
      counts.set(keep, (counts.get(keep) ?? 0) + 1);
    } else {
      pending.push(s);
    }
  }

  for (const s of pending.sort(compareByRegNo)) {
    let best = SEMINARS[0];
    for (const name of SEMINARS) {
      if ((counts.get(name) ?? 0) < (counts.get(best) ?? 0)) best = name;
    }
    counts.set(best, (counts.get(best) ?? 0) + 1);
    out[s.id] = best;
  }

  return out;
}

export type GroupAssignment = {
  groups: Record<string, string>;
  /** No seat left in the seminar (more than 11 × 8 of one gender). */
  unassigned: string[];
  /** Gender is blank or unreadable, so purity cannot be guaranteed. */
  unknownGender: string[];
};

export function assignGroups(roster: RosterEntry[]): GroupAssignment {
  const buckets = new Map<string, RosterEntry[]>();
  const unknownGender: string[] = [];

  for (const s of roster) {
    const semina = normalizeSeminar(s.semina);
    const gender = normalizeGender(s.gender);
    // Purity needs a known gender; guessing would put a woman in a men's group.
    if (!semina || gender === "unknown") {
      unknownGender.push(s.id);
      continue;
    }
    const key = `${semina}||${gender}`;
    const list = buckets.get(key);
    if (list) list.push(s);
    else buckets.set(key, [s]);
  }

  const groups: Record<string, string> = {};
  const unassigned: string[] = [];

  for (const list of buckets.values()) {
    const seats = new Map<string, number>(GROUP_NAMES.map((g) => [g, 0] as [string, number]));
    const overflow: RosterEntry[] = [];

    // Pass 1 keeps whoever already sits in a real group, so one student's update
    // never shuffles their classmates.
    for (const s of [...list].sort(compareByRegNo)) {
      const current = normalizeGroupName(s.student_group);
      if (current && (seats.get(current) ?? 0) < GROUP_SIZE) {
        seats.set(current, (seats.get(current) ?? 0) + 1);
        groups[s.id] = current;
      } else {
        overflow.push(s);
      }
    }

    // Pass 2 fills the gaps in order, so a group completes at 8 before the next opens.
    for (const s of overflow) {
      const free = GROUP_NAMES.find((g) => (seats.get(g) ?? 0) < GROUP_SIZE);
      if (!free) {
        unassigned.push(s.id);
        continue;
      }
      seats.set(free, (seats.get(free) ?? 0) + 1);
      groups[s.id] = free;
    }
  }

  return { groups, unassigned, unknownGender };
}

export type Plan = {
  seminars: Record<string, string>;
  groups: Record<string, string>;
  unknownGender: string[];
  unassigned: string[];
};

/** One call for the update flow: resolve the seminar, then the group inside it. */
export function planAssignments(roster: RosterEntry[]): Plan {
  const seminars = assignSeminar(roster);
  const resolved = roster.map((s) => ({ ...s, semina: seminars[s.id] ?? s.semina }));
  const { groups, unassigned, unknownGender } = assignGroups(resolved);
  return { seminars, groups, unknownGender, unassigned };
}

export const toMember = (s: RosterEntry): GroupMember => ({
  id: s.id,
  reg_no: String(s.reg_no ?? "").trim(),
  full_name: String(s.full_name ?? "").trim(),
});

export type GroupCell = {
  semina: string;
  gender: Gender;
  group: string;
  members: GroupMember[];
  count: number;
  size: number;
  complete: boolean;
  free: number;
};

export type SeminarReport = {
  semina: string;
  male: GroupCell[];
  female: GroupCell[];
  completeGroups: number;
  totalGroups: number;
  totalStudents: number;
  maleCount: number;
  femaleCount: number;
  /** Present in the seminar but not placeable until a gender is filled in. */
  unknownGender: GroupMember[];
};

/** Builds all 11 groups for both genders in every seminar that holds anyone. */
export function buildSeminarReports(roster: RosterEntry[]): SeminarReport[] {
  const plan = planAssignments(roster);
  const byId = new Map(roster.map((s) => [s.id, s]));
  const seminarOf = (s: RosterEntry) => plan.seminars[s.id] ?? normalizeSeminar(s.semina);

  const names = new Set<string>();
  for (const s of roster) {
    const n = seminarOf(s);
    if (n) names.add(n);
  }
  const sorted = [...names].sort(compareSeminar);

  return sorted.map((semina) => {
    const cells = (gender: Gender): GroupCell[] =>
      GROUP_NAMES.map((group) => {
        const members = roster
          .filter(
            (s) =>
              seminarOf(s) === semina &&
              plan.groups[s.id] === group &&
              normalizeGender(s.gender) === gender,
          )
          .map(toMember)
          .sort((a, b) => a.reg_no.localeCompare(b.reg_no));
        return {
          semina,
          gender,
          group,
          members,
          count: members.length,
          size: GROUP_SIZE,
          complete: members.length >= GROUP_SIZE,
          free: Math.max(0, GROUP_SIZE - members.length),
        };
      });

    const male = cells("male");
    const female = cells("female");
    const all = [...male, ...female];
    const unknownGender = roster
      .filter((s) => seminarOf(s) === semina && normalizeGender(s.gender) === "unknown")
      .map(toMember);

    return {
      semina,
      male,
      female,
      completeGroups: all.filter((c) => c.complete).length,
      totalGroups: all.length,
      totalStudents: all.reduce((n, c) => n + c.count, 0),
      maleCount: male.reduce((n, c) => n + c.count, 0),
      femaleCount: female.reduce((n, c) => n + c.count, 0),
      unknownGender,
    };
  });
}

export type MyGroup = {
  student: RosterEntry;
  semina: string;
  gender: Gender;
  group: string | null;
  members: GroupMember[];
  complete: boolean;
  free: number;
  note: string | null;
};

/** The student's own group and the people in it, found by Reg Namba. */
export function findMyGroup(roster: RosterEntry[], query: string): MyGroup | null {
  const q = regKey(query);
  if (!q) return null;
  const me = roster.find((s) => regKey(s.reg_no) === q);
  if (!me) return null;

  const plan = planAssignments(roster);
  const semina = plan.seminars[me.id] ?? normalizeSeminar(me.semina) ?? "";
  const gender = normalizeGender(me.gender);
  const group = plan.groups[me.id] ?? null;

  const members = group
    ? roster
        .filter(
          (s) =>
            plan.groups[s.id] === group &&
            (plan.seminars[s.id] ?? normalizeSeminar(s.semina)) === semina &&
            normalizeGender(s.gender) === gender,
        )
        .map(toMember)
        .sort((a, b) => a.reg_no.localeCompare(b.reg_no))
    : [];

  let note: string | null = null;
  if (!group) {
    note =
      gender === "unknown"
        ? "Jinsia haijatambulika kwenye taarifa zako. Mwone mwalimu au admin ailainishe."
        : "Hakuna nafasi iliyobaki kwenye semina yako. Mwone admin.";
  }

  return {
    student: me,
    semina,
    gender,
    group,
    members,
    complete: members.length >= GROUP_SIZE,
    free: Math.max(0, GROUP_SIZE - members.length),
    note,
  };
}

/** Admin / CR lookup by name or Reg Namba, used to add a present member. */
export function searchMembers(roster: RosterEntry[], query: string, limit = 40): RosterEntry[] {
  const q = regKey(query);
  const text = query.trim().toUpperCase();
  if (!q && !text) return [];
  return roster
    .filter((s) => {
      // "MUM 2025-04-13988" must match a search for "MUM2025-04-13988".
      const reg = regKey(s.reg_no);
      const name = String(s.full_name ?? "")
        .trim()
        .toUpperCase();
      return (!!q && reg.includes(q)) || (!!text && name.includes(text));
    })
    .slice(0, limit);
}

export function formatGroupLabel(semina: string, gender: Gender, group: string): string {
  return `${semina} · ${genderLabel(gender).toUpperCase()} · ${group}`;
}

/** One group's two representatives — a female and a male, as the owner asked. */
export type Representatives = {
  female: GroupMember | null;
  male: GroupMember | null;
};

/**
 * Picks the representatives of every group.
 *
 * The owner asked for random picks rather than first-in-the-list, so the choice is
 * seeded from the group's own identity (seminar, gender, group name). That keeps it
 * random across groups while staying stable: the same group yields the same two names
 * on every render, on every device, without storing anything. A group of one gender
 * simply has no representative of the other.
 *
 * `slot` rotates the pick so a group that loses its representative promotes the next
 * member instead of leaving the seat empty.
 */
export function pickRepresentative(
  members: GroupMember[],
  gender: Gender,
  seed: string,
  slot = 0,
): GroupMember | null {
  if (!members.length) return null;
  const ordered = [...members].sort((a, b) => a.reg_no.localeCompare(b.reg_no));
  const h = hashString(`${seed}:${gender}`);
  return ordered[(h + slot) % ordered.length] ?? null;
}

/** A group's representatives, keyed by the group's own identity so the pick is stable. */
export function representativesFor(
  members: GroupMember[],
  semina: string,
  gender: Gender,
  group: string,
): Representatives {
  const seed = `${semina}|${group}`;
  return {
    female: gender === "female" ? pickRepresentative(members, "female", seed) : null,
    male: gender === "male" ? pickRepresentative(members, "male", seed) : null,
  };
}

/**
 * FNV-1a, inlined so this file stays import-free for `node --test`.
 *
 * `Math.random()` cannot be used here: the pick has to be the same on the student's
 * phone and the admin's screen, and it must not change when the list re-renders.
 */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
