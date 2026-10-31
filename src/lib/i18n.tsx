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
  subtitle_app: {
    sw: "Mtandaoni · AI · Kamera · GPS · Sahihi",
    en: "Online · AI · Camera · GPS · Signature",
  },
  nav_exams: { sw: "Mtihani wa Mtandaoni", en: "Online Test" },
  nav_quiz: { sw: "Kazi za Kufanya", en: "Assignment" },
  nav_student: { sw: "Update Taarifa", en: "Update details" },
  nav_account: { sw: "Akaunti", en: "My account" },
  nav_semester_qs: { sw: "Maswali ya Semester", en: "Semester Questions" },
  nav_attendance: { sw: "Mahudhurio", en: "Attendance" },
  coming_soon: { sw: "Coming Soon", en: "Coming Soon" },
  coming_soon_body: {
    sw: "Sehemu hii inaandaliwa. Itakua tayari hivi karibuni — subiri tangazo.",
    en: "This section is being prepared. It will be ready soon — watch for the announcement.",
  },
  semester_qs_title: { sw: "Maswali ya Semester", en: "Semester Questions" },
  semester_qs_sub: {
    sw: "Maswali ya semester iliyowashwa, yaliyowekwa na admin kwa muundo wa PDF.",
    en: "Question papers for the active semester, uploaded by the admin as PDF.",
  },
  semester_qs_empty: {
    sw: "Hakuna maswali yaliyowekwa kwa semester hii bado.",
    en: "No question papers have been uploaded for this semester yet.",
  },
  semester_qs_need_reg: {
    sw: "Ingiza Reg Namba yako ili kuona maswali ya semester yako.",
    en: "Enter your Reg number to see your semester's questions.",
  },
  open_pdf: { sw: "Fungua PDF", en: "Open PDF" },
  download_pdf: { sw: "Pakua", en: "Download" },
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
  quiz_sub: {
    sw: "Group au Individual — utachagua ndani",
    en: "Group or individual — choose inside",
  },
  enter: { sw: "Ingia", en: "Enter" },
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

  // --- update taarifa -----------------------------------------------------
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
  not_found: {
    sw: "Hatukukupata. Kagua Reg Namba yako.",
    en: "We could not find you. Check your Reg number.",
  },
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
  choose_course: { sw: "Chagua kozi", en: "Choose a course" },
  choose_semina: { sw: "Chagua semina", en: "Choose a semina" },
  choose_group: { sw: "Chagua group", en: "Choose a group" },
  choose_year: { sw: "Chagua mwaka", en: "Choose a year" },
  choose_semester: { sw: "Chagua semester", en: "Choose a semester" },
  academic_placeholder: { sw: "Mfano 2026/2027", en: "e.g. 2026/2027" },
  submit_request: { sw: "Tuma Ombi", en: "Submit request" },
  sending: { sw: "Inatuma...", en: "Sending..." },
  request_sent: {
    sw: "Ombi lako limetumwa. Admin atathibitisha.",
    en: "Your request was sent. An admin will confirm.",
  },
  auto_approved: {
    sw: "Marekebisho yako yamehifadhiwa na yameanza kutumika mara moja.",
    en: "Your corrections are saved and already in effect.",
  },
  saved_title: { sw: "Imefanikiwa!", en: "Success!" },
  saved_body: {
    sw: "Marekebisho yako yamehifadhiwa. Taarifa mpya zinaonekana hapa chini.",
    en: "Your corrections are saved. The updated details are shown below.",
  },
  semester_inactive: {
    sw: "Semester hiyo bado haijawashwa. Chagua SEMESTER 1.",
    en: "That semester is not active yet. Choose SEMESTER 1.",
  },
  issues_disabled: {
    sw: "Changamoto imezimwa na admin kwa sasa.",
    en: "Report an issue is switched off by the admin right now.",
  },
  my_requests: { sw: "Maombi yako", en: "Your requests" },
  wrong_reg: { sw: "⚠ Nilikosea Reg Namba kabisa", en: "⚠ I used the wrong Reg number entirely" },
  wrong_reg_help: {
    sw: "Kagua ikiwa ulijiandikisha kwa Reg isiyo sahihi na unataka matokeo yako ya awali yahamishwe kwa Reg mpya. Admin atathibitisha kabla ya kuhamisha.",
    en: "Tick this if you registered under the wrong Reg number and want your earlier results moved to the new one. An admin confirms before anything is moved.",
  },
  new_reg: { sw: "Reg Namba Mpya", en: "New Reg number" },
  new_name: { sw: "Jina Kamili Jipya", en: "New full name" },
  edits_disabled: {
    sw: "Update Taarifa imezimwa na admin kwa sasa.",
    en: "Update Taarifa is switched off by the admin right now.",
  },
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
  issue_received: {
    sw: "Changamoto imepokelewa! Admin atajibu hivi karibuni.",
    en: "Report received! An admin will reply soon.",
  },
  write_issue: { sw: "Andika changamoto yako", en: "Write your problem" },
  enter_reg: { sw: "Ingiza Reg Namba yako", en: "Enter your Reg number" },

  // --- register -----------------------------------------------------------
  register_title: { sw: "Usajili wa Mwanafunzi", en: "Student registration" },
  register_sub: {
    sw: "Jaza taarifa zako kwa usahihi. Utapata Reg Namba yako mwishoni.",
    en: "Fill in your details carefully. You receive your Reg number at the end.",
  },
  continue_confirm: { sw: "Endelea — Thibitisha Taarifa", en: "Continue — confirm details" },
  already_registered: {
    sw: "Tayari umesajiliwa. Karibu tena!",
    en: "You are already registered. Welcome back!",
  },
  registered_ok: {
    sw: "Usajili umethibitishwa kikamilifu!",
    en: "Registration confirmed successfully!",
  },

  // --- media / gallery ----------------------------------------------------
  media_title: {
    sw: "Ukumbi wa Mtihani — Wanafunzi wa Kiislamu",
    en: "Exam hall — Muslim students",
  },
  photos_title: { sw: "Picha za Matukio", en: "Event photos" },
  photos_kicker: { sw: "Picha Halisi", en: "Real photos" },
  taarifa_kicker: { sw: "Update Taarifa", en: "Update your details" },
  taarifa_card_title: { sw: "Update Taarifa Zako", en: "Update your details" },
  taarifa_card_sub: {
    sw: "Badilisha kozi, semina, mwaka wa masomo au group lako — moja kwa moja.",
    en: "Change your course, semina, study year or group — directly.",
  },
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
    } catch {
      /* private mode */
    }
    setLangState(l);
  };

  const t = (k: string, vars?: Record<string, string | number>) => {
    let out = dict[k]?.[lang] ?? k;
    if (vars)
      for (const [name, v] of Object.entries(vars)) out = out.replaceAll(`{${name}}`, String(v));
    return out;
  };

  return <Ctx.Provider value={{ lang, t, setLang }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
