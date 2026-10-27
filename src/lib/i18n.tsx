import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "sw" | "en";

/**
 * Every user-facing string on the public pages lives here, so switching the
 * language toggle in the header swaps the whole UI without a reload.
 * `t()` falls back to the key itself, which keeps an untranslated string
 * visible instead of rendering "undefined".
 */
const dict: Record<string, { sw: string; en: string }> = {
  // --- chrome -------------------------------------------------------------
  home: { sw: "Mwanzo", en: "Home" },
  back: { sw: "Rudi", en: "Back" },
  forward: { sw: "Mbele", en: "Forward" },
  register: { sw: "Jisajili", en: "Register" },
  exams: { sw: "Mitihani", en: "Exams" },
  results: { sw: "Matokeo", en: "Results" },
  admin: { sw: "Admin", en: "Admin" },
  language: { sw: "Lugha", en: "Language" },
  loading: { sw: "Inapakia...", en: "Loading..." },
  title_app: { sw: "Mfumo wa Mtihani wa Islamic Studies", en: "Islamic Studies Exam System" },
  subtitle_app: { sw: "Mtandaoni · AI · Kamera · GPS · Sahihi", en: "Online · AI · Camera · GPS · Signature" },
  nav_exams: { sw: "Mtihani wa Mtandaoni", en: "Online Test" },
  nav_quiz: { sw: "Kazi za Kufanya", en: "Assignment" },
  nav_media: { sw: "Bana ya Media", en: "Media Gallery" },
  nav_student: { sw: "Huduma ya Mwanafunzi", en: "Student Services" },
  footer_note: {
    sw: "Kifaa chochote • Hakuna Copy/Paste • Muda wa EAT • Imeundwa na viwango stationary",
    en: "Any device • No copy/paste • EAT time zone • Built to stationary standards",
  },

  // --- home hero ----------------------------------------------------------
  hero_kicker: { sw: "Mfumo wa Kisasa wa Mitihani", en: "A modern exam system" },
  hero_welcome: { sw: "Karibu Mfumo wa Mitihani", en: "Welcome to the exam system" },
  hero_tagline: {
    sw: "Jifunze. Jipime. Fanikiwa. — Mitihani ya Islamic Studies mtandaoni, kwa kifaa chochote.",
    en: "Learn. Test yourself. Succeed. — Islamic Studies exams online, on any device.",
  },
  badge_islamic: { sw: "Islamic Studies", en: "Islamic Studies" },
  badge_security: { sw: "Kamera · GPS · Sahihi", en: "Camera · GPS · Signature" },
  badge_instant: { sw: "Matokeo ya Papo Hapo", en: "Instant results" },

  // --- home actions -------------------------------------------------------
  do_exam: { sw: "Fanya Mtihani", en: "Take Exam" },
  do_exam_sub: { sw: "Fanya mtihani rasmi — mtu mmoja", en: "Sit a formal exam — individually" },
  start_now: { sw: "Anza sasa", en: "Start now" },
  quiz: { sw: "Quiz", en: "Quiz" },
  quiz_sub: { sw: "Group au Individual — utachagua ndani", en: "Group or individual — choose inside" },
  enter: { sw: "Ingia", en: "Enter" },
  attendance_today: { sw: "Mahudhurio ya Leo", en: "Today's attendance" },
  attendance_sub: { sw: "Jisajili kwa Reg Namba yako", en: "Check in with your Reg number" },
  attendance_count: { sw: "waliohudhuria", en: "checked in" },
  here: { sw: "Niko", en: "I'm here" },
  gps_recorded: { sw: "GPS itarekodiwa", en: "GPS will be recorded" },

  // --- stats --------------------------------------------------------------
  stats_title: { sw: "Takwimu za Mfumo", en: "System statistics" },
  stat_registered: { sw: "Waliojisajili", en: "Registered students" },
  stat_took_exam: { sw: "Waliofanya Mtihani", en: "Exams taken" },
  stat_visits_today: { sw: "Wametembelea Leo", en: "Visits today" },
  view_results: { sw: "Angalia Matokeo", en: "View Results" },
  view_results_sub: { sw: "Mtu binafsi / Group", en: "Individual / Group" },
  per_test_title: { sw: "Waliofanya kila Test", en: "Submissions per test" },
  took: { sw: "Waliofanya", en: "Submissions" },
  test_other: { sw: "Mitihani Mingine", en: "Other exams" },
  test_1: { sw: "Test 1", en: "Test 1" },
  test_2: { sw: "Test 2", en: "Test 2" },
  test_3: { sw: "Test 3", en: "Test 3" },
  get_reg: { sw: "Pata Reg Namba", en: "Get a Reg number" },
  teachers_only: { sw: "Walimu pekee", en: "Teachers only" },

  // --- update taarifa (student services) ---------------------------------
  update_title: { sw: "Update Taarifa", en: "Update your details" },
  update_sub: {
    sw: "Weka Reg Namba yako, uone taarifa zako, kisha urekebishe kozi, semina, mwaka wa masomo na group lako.",
    en: "Enter your Reg number, review your details, then correct your course, semina, study year and group.",
  },
  update_cta: { sw: "Anza Update Taarifa", en: "Start updating" },
  reg_number: { sw: "Reg Namba", en: "Reg number" },
  reg_placeholder: { sw: "Mfano: IS-2026-001", en: "e.g. IS-2026-001" },
  look_up: { sw: "Tafuta Taarifa Zangu", en: "Find my details" },
  looking_up: { sw: "Inatafuta...", en: "Searching..." },
  your_details: { sw: "Taarifa Zako", en: "Your details" },
  not_found: { sw: "Hatukukupata. Kagua Reg Namba yako.", en: "We could not find you. Check your Reg number." },
  full_name: { sw: "Jina Kamili", en: "Full name" },
  phone: { sw: "Namba ya Simu", en: "Phone number" },
  age: { sw: "Umri", en: "Age" },
  gender: { sw: "Jinsia", en: "Gender" },
  male: { sw: "Mwanaume", en: "Male" },
  female: { sw: "Mwanamke", en: "Female" },
  course: { sw: "Kozi ya Sasa", en: "Current course" },
  semina: { sw: "Semina", en: "Semina" },
  group: { sw: "Group", en: "Group" },
  study_year: { sw: "Mwaka wa Masomo", en: "Study year" },
  year_n: { sw: "Mwaka wa {n}", en: "Year {n}" },
  semester: { sw: "Semester", en: "Semester" },
  academic_year: { sw: "Mwaka wa Kitaaluma", en: "Academic year" },
  reason: { sw: "Sababu (hiari)", en: "Reason (optional)" },
  reason_placeholder: { sw: "Mfano: jina lilikuwa limechapwa vibaya", en: "e.g. my name was misspelled" },
  choose_course: { sw: "Chagua kozi", en: "Choose a course" },
  choose_semina: { sw: "Chagua semina", en: "Choose a semina" },
  choose_group: { sw: "Chagua group", en: "Choose a group" },
  choose_year: { sw: "Chagua mwaka", en: "Choose a year" },
  choose_semester: { sw: "Chagua semester", en: "Choose a semester" },
  academic_placeholder: { sw: "Mfano 2026/2027", en: "e.g. 2026/2027" },
  submit_request: { sw: "Tuma Ombi", en: "Submit request" },
  sending: { sw: "Inatuma...", en: "Sending..." },
  request_sent: { sw: "Ombi lako limetumwa. Admin atathibitisha.", en: "Your request was sent. An admin will confirm." },
  my_requests: { sw: "Maombi yako", en: "Your requests" },
  wrong_reg: { sw: "⚠ Nilikosea Reg Namba kabisa", en: "⚠ I used the wrong Reg number entirely" },
  wrong_reg_help: {
    sw: "Kagua ikiwa ulijiandikisha kwa Reg isiyo sahihi na unataka matokeo yako ya awali yahamishwe kwa Reg mpya. Admin atathibitisha kabla ya kuhamisha.",
    en: "Tick this if you registered under the wrong Reg number and want your earlier results moved to the new one. An admin confirms before anything is moved.",
  },
  new_reg: { sw: "Reg Namba Mpya", en: "New Reg number" },
  new_name: { sw: "Jina Kamili Jipya", en: "New full name" },
  edits_disabled: { sw: "Huduma hii imezimwa na admin kwa sasa.", en: "This service is switched off by the admin right now." },
  confirm_reg_first: { sw: "Thibitisha Reg Namba kwanza.", en: "Confirm your Reg number first." },
  tab_edit: { sw: "Update Taarifa", en: "Update details" },
  tab_issue: { sw: "Changamoto", en: "Report an issue" },
  edit_card_title: { sw: "Omba Marekebisho", en: "Request a correction" },
  issue_card_title: { sw: "Wasilisha Changamoto", en: "Report a problem" },
  issue_type: { sw: "Aina ya Changamoto", en: "Type of problem" },
  issue_message: { sw: "Eleza Changamoto Yako", en: "Describe the problem" },
  issue_placeholder: { sw: "Andika kwa kina...", en: "Describe it in detail..." },
  submit_issue: { sw: "Tuma Changamoto", en: "Submit report" },
  my_issues: { sw: "Changamoto zako za awali", en: "Your earlier reports" },
  issue_received: { sw: "Changamoto imepokelewa! Admin atajibu hivi karibuni.", en: "Report received! An admin will reply soon." },
  write_issue: { sw: "Andika changamoto yako", en: "Write your problem" },
  enter_reg: { sw: "Ingiza Reg Namba yako", en: "Enter your Reg number" },

  // --- register -----------------------------------------------------------
  register_title: { sw: "Usajili wa Mwanafunzi", en: "Student registration" },
  register_sub: {
    sw: "Jaza taarifa zako kwa usahihi. Utapata Reg Namba yako mwishoni.",
    en: "Fill in your details carefully. You receive your Reg number at the end.",
  },
  continue_confirm: { sw: "Endelea — Thibitisha Taarifa", en: "Continue — confirm details" },
  already_registered: { sw: "Tayari umesajiliwa. Karibu tena!", en: "You are already registered. Welcome back!" },
  registered_ok: { sw: "Usajili umethibitishwa kikamilifu!", en: "Registration confirmed successfully!" },

  // --- media / gallery ----------------------------------------------------
  media_kicker: { sw: "Uhuishaji wa Kisasa", en: "Modern animation" },
  media_title: { sw: "Ukumbi wa Mtihani — Wanafunzi wa Kiislamu", en: "Exam hall — Muslim students" },
  media_desc: {
    sw: "Video ya uhuishaji na michoro inayoonyesha wanafunzi wa Kiislamu wakifanya mtihani kwa nidhamu, adabu na utulivu.",
    en: "Animation and illustrations of Muslim students sitting exams with discipline, manners and calm.",
  },
  open_media: { sw: "Fungua Bana ya Media", en: "Open the media gallery" },
  live_animation: { sw: "Uhuishaji hai · bila sauti", en: "Live animation · muted" },
  pause: { sw: "Simamisha", en: "Pause" },
  play: { sw: "Endesha", en: "Play" },
  cartoon_title: { sw: "Michoro ya Wanafunzi", en: "Student illustrations" },
  cartoon_sub: {
    sw: "Michoro inayoonyesha maisha ya mwanafunzi — darasani, ukumbini na kujisomea.",
    en: "Illustrations of student life — in class, in the hall and studying alone.",
  },
  photos_title: { sw: "Picha za Matukio", en: "Event photos" },
  photos_sub: { sw: "Picha halisi kutoka kwa shughuli zetu.", en: "Real photos from our activities." },
  no_photos: { sw: "Hakuna picha bado.", en: "No photos yet." },
  gallery_title: { sw: "Bana ya Picha za Masomo", en: "Study photo gallery" },
};

const Ctx = createContext<{
  lang: Lang;
  t: (k: string, vars?: Record<string, string | number>) => string;
  setLang: (l: Lang) => void;
}>({
  lang: "sw",
  t: (k) => k,
  setLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("sw");

  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("lang")) as Lang | null;
    if (saved === "en" || saved === "sw") setLangState(saved);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    try {
      localStorage.setItem("lang", l);
    } catch { /* private mode */ }
    setLangState(l);
  };

  const t = (k: string, vars?: Record<string, string | number>) => {
    let out = dict[k]?.[lang] ?? k;
    if (vars) for (const [name, v] of Object.entries(vars)) out = out.replaceAll(`{${name}}`, String(v));
    return out;
  };

  return <Ctx.Provider value={{ lang, t, setLang }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
