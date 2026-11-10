import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { storageGet, storageSet } from "@/lib/safe-storage";

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
  scroll_nav_left: { sw: "Sogeza menyu kushoto", en: "Scroll menu left" },
  scroll_nav_right: { sw: "Sogeza menyu kulia", en: "Scroll menu right" },
  register: { sw: "Jisajili", en: "Register" },
  exams: { sw: "Mitihani", en: "Exams" },
  results: { sw: "Matokeo", en: "Results" },
  admin: { sw: "Admin", en: "Admin" },
  language: { sw: "Lugha", en: "Language" },
  loading: { sw: "Inapakia...", en: "Loading..." },
  title_app: {
    sw: "Islamic Studies Test Online",
    en: "Islamic Studies Test Online",
  },
  subtitle_app: {
    sw: "Mtandaoni · AI · Kamera · GPS · Sahihi",
    en: "Online · AI · Camera · GPS · Signature",
  },
  // --- utambulisho wa mfumo -------------------------------------------------
  system_full_name: { sw: "Islamic Studies Test Online", en: "Islamic Studies Test Online" },
  system_short_name: { sw: "IST Online", en: "IST Online" },
  founder_role: { sw: "Mwanzilishi wa Mfumo", en: "Founder of the System" },
  founder_name: { sw: "Dr. Jiba", en: "Dr. Jiba" },
  founder_title: {
    sw: "Mhadhiri wa Islamic Studies",
    en: "Lecturer of Islamic Studies",
  },
  founder_message: {
    sw: "Mfumo huu umeundwa ili kumrahisishia kila mwanafunzi wa Islamic Studies kufanya mitihani kwa haki, kwa urahisi, na kwa kasi ya teknolojia ya kisasa.",
    en: "This system was built so every Islamic Studies student can sit exams fairly, easily, and with the speed of modern technology.",
  },
  purpose_kicker: { sw: "Lengo la Mfumo", en: "Our Purpose" },
  purpose_title: {
    sw: "Kufundisha kwa Teknolojia ya Kisasa",
    en: "Teaching Through Modern Technology",
  },
  purpose_sub: {
    sw: "Tunaleta mitihani ya Islamic Studies kwenye tehama, ili maarifa yafike kwa kila mwanafunzi popote alipo — kwa haki, kwa urahisi, na kwa kasi.",
    en: "We bring Islamic Studies exams into the digital age, so knowledge reaches every student wherever they are — fairly, simply, and fast.",
  },
  purpose_p1_title: { sw: "Elimu kwa Wote", en: "Education for All" },
  purpose_p1_body: {
    sw: "Mwanafunzi anaweza kufanya mtihani kwa simu au kompyuta, mahali popote, bila usumbufu wa karatasi.",
    en: "A student can sit an exam on a phone or computer, from anywhere, without the friction of paper.",
  },
  purpose_p2_title: { sw: "Usahihi na Haki", en: "Accuracy and Fairness" },
  purpose_p2_body: {
    sw: "AI inasahihisha majibu kwa maana, sio kwa maneno yanayofanana, kwa hiyo kila mwanafunzi anapata alama anazostahili.",
    en: "AI marks answers by meaning, not by matching words, so every student gets the marks they deserve.",
  },
  purpose_p3_title: { sw: "Kasi ya Tehama", en: "The Speed of Technology" },
  purpose_p3_body: {
    sw: "Matokeo yanatoka mara moja baada ya mtihani, kwa hiyo mwalimu na mwanafunzi wanajua hali halisi papo hapo.",
    en: "Results appear as soon as the exam ends, so teacher and student both know where they stand right away.",
  },
  purpose_p4_title: { sw: "Maarifa ya Kiislamu", en: "Islamic Knowledge" },
  purpose_p4_body: {
    sw: "Mfumo unajua Qur'an, Hadith, Fiqh na mada nyingine, kwa hiyo unaweza kusaidia kujifunza sio tu kupima.",
    en: "The system knows Qur'an, Hadith, Fiqh and more, so it can help students learn, not only test them.",
  },
  nav_exams: { sw: "Mtihani wa Mtandaoni", en: "Online Test" },
  nav_quiz: { sw: "Kazi za Kufanya", en: "Assignment" },
  // --- group assignment ("Kazi za Kufanya") --------------------------------
  ga_title: { sw: "Kazi za Kufanya — ya Group", en: "Assignment — Group work" },
  ga_sub: {
    sw: "Chagua semina na group lenu, chagueni mliopresent, andika swali lenu, pakieni kazi (PDF au Word hadi 2MB), preview, kisha tuma. Mtatuma mara moja tu.",
    en: "Pick your seminar and group, choose who presented, write your question, upload the work (PDF or Word up to 2MB), preview, then send. You send once.",
  },
  ga_pick_title: { sw: "Hatua 1 — Chagua Group Lenu", en: "Step 1 — Pick your group" },
  ga_semina: { sw: "Semina", en: "Seminar" },
  ga_group: { sw: "Group", en: "Group" },
  ga_confirm: { sw: "Thibitisha Group", en: "Confirm group" },
  ga_choose_placeholder: { sw: "— Chagua —", en: "— Choose —" },
  ga_members: { sw: "Wanachama wa group lenu", en: "Your group members" },
  ga_no_members: {
    sw: "Hakuna mwanachama aliyepatikana kwenye group hili. Hakikisheni semina na group ni sahihi.",
    en: "No members were found in this group. Check that the seminar and group are right.",
  },
  ga_step2_title: { sw: "Hatua 2 — Mliopresent", en: "Step 2 — Who presented" },
  ga_wizard_step1: { sw: "Group Lenu", en: "Your group" },
  ga_wizard_step1_hint: { sw: "Semina, group na jinsia", en: "Seminar, group and gender" },
  ga_wizard_step2: { sw: "Mliopresent", en: "Who presented" },
  ga_wizard_step2_hint: { sw: "Chagua walioandaa", en: "Pick who prepared" },
  ga_wizard_step3: { sw: "Swali na Faili", en: "Question and file" },
  ga_wizard_step3_hint: {
    sw: "Andika swali, pakia kazi, tuma",
    en: "Write the question, upload, send",
  },
  ga_wizard_chosen: { sw: "wamechaguliwa", en: "chosen" },
  ga_need_presenter: {
    sw: "Chagua angalau mwanachama mmoja aliyepresent.",
    en: "Pick at least one member who presented.",
  },
  ga_step2_sub: {
    sw: "Wachagueni wanachama wote waliopresent kazi hii darasani.",
    en: "Select every member who presented this work in class.",
  },
  ga_step3_title: { sw: "Swali la kazi yenu", en: "Your question" },
  ga_question_label: { sw: "Swali lenu la group assignment", en: "Your group assignment question" },
  ga_question_placeholder: {
    sw: "Andika swali lenu la kazi hapa...",
    en: "Write your assignment question here...",
  },
  ga_step4_title: { sw: "Pakia faili la kazi", en: "Upload the work file" },
  ga_file_hint: {
    sw: "PDF au Word tu. Ukubwa usiozidi 2MB.",
    en: "PDF or Word only. No more than 2MB.",
  },
  ga_choose_file: { sw: "Chagua faili", en: "Choose file" },
  ga_preview: { sw: "Preview", en: "Preview" },
  ga_preview_first: {
    sw: "Bonyeza Preview kuona kazi yenu kabla ya kutuma.",
    en: "Press Preview to see your work before sending.",
  },
  ga_previewed: { sw: "Umeipreview", en: "Previewed" },
  ga_open_preview: { sw: "Fungua preview", en: "Open preview" },
  ga_submit: { sw: "Tuma Kazi", en: "Send work" },
  ga_submitting: { sw: "Inatuma...", en: "Sending..." },
  ga_sent_title: { sw: "Kazi yenu imetumwa", en: "Your work was sent" },
  ga_already: {
    sw: "Group lenu mmeshatuma kazi. Hamwezi kutuma tena.",
    en: "Your group has already sent its work. You cannot send again.",
  },
  ga_back: { sw: "Badilisha group", en: "Change group" },
  ga_missing_title: { sw: "Bado kuna mambo yaliyokosekana", en: "Some things are still missing" },
  ga_word_no_preview: {
    sw: "Faili la Word haliwezi kuonyeshwa moja kwa moja hapa. Lipakue kuona maudhui yake.",
    en: "A Word file cannot be shown inline here. Download it to see its contents.",
  },
  ga_download: { sw: "Pakua faili", en: "Download file" },
  ga_presenters_summary: { sw: "Mliopresent", en: "Presented by" },
  ga_question_summary: { sw: "Swali letu", en: "Our question" },
  ga_answer_from_admin: { sw: "Jibu la mwalimu", en: "Teacher's answer" },
  ga_mark_label: { sw: "Alama", en: "Mark" },
  ga_marks_on_work: {
    sw: "Alama za mwalimu kwenye kazi yenu",
    en: "Your teacher's marks on the work",
  },
  ga_see_marks_hint: {
    sw: "Alama zinaonekana kwenye ukurasa zilipowekwa — tembea kurasa.",
    en: "Marks appear on the page they were placed on — browse the pages.",
  },
  ga_waiting_answer: {
    sw: "Mwalimu bado hajatuma jibu. Subirini.",
    en: "The teacher has not sent an answer yet. Please wait.",
  },
  nav_student: { sw: "Update Taarifa", en: "Update details" },
  nav_account: { sw: "Akaunti", en: "My account" },
  nav_cr: { sw: "CR", en: "CR" },
  nav_semester_qs: { sw: "Maswali ya Semester", en: "Semester Questions" },
  nav_attendance: { sw: "Mahudhurio", en: "Attendance" },
  nav_group: { sw: "Group Yangu", en: "My group" },
  nav_news: { sw: "Habari", en: "News" },
  nav_tutor: { sw: "OpenTutor", en: "OpenTutor" },
  attendance_card_sub: {
    sw: "Skani QR au weka msimbo wa kipindi kuhudhuria. Hapa pia unaona historia yako.",
    en: "Scan a QR or enter a session code to check in. Your history lives here too.",
  },
  attendance_open_now: { sw: "Hudhuria sasa", en: "Check in now" },
  // --- mahudhurio ya mwanafunzi ---------------------------------------------
  att_title: { sw: "Mahudhurio Yangu", en: "My Attendance" },
  att_sub: {
    sw: "Hudhuria kipindi kwa kuscan QR au kwa msimbo. Historia yako yote iko hapa chini.",
    en: "Check in with a QR scan or a session code. Your full history sits below.",
  },
  // --- habari (ukurasa wa wazi) --------------------------------------------
  news_title: { sw: "Habari na Matangazo", en: "News & Announcements" },
  news_headline: { sw: "Habari za Chuo", en: "College News" },
  news_sub: {
    sw: "Matangazo, maelekezo na nyaraka muhimu. Ukurasa huu ni wa wazi \u2014 huhitaji kuingia kwenye akaunti.",
    en: "Notices, guidance and important documents. This page is open \u2014 no sign-in needed.",
  },
  news_public_note: { sw: "Wazi kwa kila mtu", en: "Open to everyone" },
  news_refresh: { sw: "Onyesha upya", en: "Refresh" },
  news_new: { sw: "Mpya", en: "New" },
  news_older: { sw: "Matangazo yaliyopita", en: "Earlier notices" },
  news_untitled: { sw: "Tangazo", en: "Notice" },
  news_empty: { sw: "Hakuna tangazo kwa sasa", en: "No announcements right now" },
  news_empty_body: {
    sw: "Matangazo mapya yataonekana hapa mara tu ofisi inapoyatangaza.",
    en: "New notices appear here as soon as the office posts them.",
  },
  news_open_pdf: { sw: "Fungua PDF", en: "Open PDF" },
  news_download_pdf: { sw: "Pakua", en: "Download" },
  news_no_attachment: { sw: "Hakuna kiambatisho", en: "No attachment" },
  news_help_title: { sw: "Maelekezo", en: "Guidance" },
  news_help_pdf: {
    sw: "Kwa nyaraka (PDF): bofya \u201cFungua PDF\u201d kusoma hapa, au \u201cPakua\u201d kuisave kwenye simu yako.",
    en: "For documents (PDF): tap \u201cOpen PDF\u201d to read here, or \u201cDownload\u201d to save it on your phone.",
  },
  news_help_attend: {
    sw: "Kwa mahudhurio: nenda Mahudhurio, skani QR ya mwalimu au andika msimbo wa kipindi.",
    en: "For attendance: open Attendance, scan the teacher's QR or enter the session code.",
  },
  news_help_notice: {
    sw: "Tangazo linalokwisha muda wake huondolewa kiotomatiki \u2014 hivyo unachokiona hapa ni cha sasa.",
    en: "A notice past its expiry is removed automatically, so what you see here is current.",
  },
  att_present_today: { sw: "Umehudhuria leo", en: "Present today" },
  att_total: { sw: "Jumla ya Vipindi", en: "Sessions attended" },
  att_rate: { sw: "Kiwango cha Mahudhurio", en: "Attendance rate" },
  att_sessions_open: { sw: "Vipindi Vinavyoendelea", en: "Open sessions" },
  att_no_open: {
    sw: "Hakuna kipindi kinachoendelea kwa sasa. Subiri mwalimu afungue kipindi.",
    en: "No session is open right now. Wait for your teacher to start one.",
  },
  att_heading: {
    sw: "Hudhuria kwa QR, Reg Namba na Sura",
    en: "Check in with QR, Reg Namba and face",
  },
  att_scan_qr: { sw: "Scan QR", en: "Scan QR" },
  att_enter_code: { sw: "Weka Msimbo", en: "Enter code" },
  att_code_placeholder: { sw: "Mfano: ABC-123", en: "e.g. ABC-123" },
  att_history: { sw: "Historia ya Mahudhurio", en: "Attendance history" },
  att_no_history: {
    sw: "Bado hujahudhuria kipindi chochote.",
    en: "You have not attended a session yet.",
  },
  att_present: { sw: "Alikuwepo", en: "Present" },
  att_need_account: {
    sw: "Jitambulishe ili kuhudhuria.",
    en: "Identify yourself to check in.",
  },
  att_need_account_body: {
    sw: "Weka Reg Namba yako kwenye kisanduku cha “Hudhuria kwa QR Code” hapa chini, kisha uthibitishe sura yako — huhitaji kuondoka kwenye ukurasa huu.",
    en: "Enter your Reg number in the “Check in with QR Code” box below, then verify your face — no need to leave this page.",
  },
  att_go_account: { sw: "Fungua Akaunti", en: "Open Account" },
  att_confirmed: { sw: "Mahudhurio yamethibitishwa", en: "Attendance confirmed" },
  att_distance: { sw: "Umbali", en: "Distance" },
  att_time: { sw: "Muda", en: "Time" },
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
  // --- admin dashboard ------------------------------------------------------
  admin_welcome: { sw: "Karibu kwenye Dashibodi", en: "Welcome to the Dashboard" },
  admin_welcome_sub: {
    sw: "Muhtasari wa mfumo wako, mahudhurio ya hivi karibuni, na muda wa mitihani inayokuja.",
    en: "An overview of your system, recent attendance, and the time left on upcoming exams.",
  },
  admin_attendance: { sw: "Mahudhurio", en: "Attendance" },
  admin_att_short: { sw: "Waliopo Darasani", en: "Present in class" },
  admin_att_open: { sw: "Vipindi Vinavyoendelea", en: "Open sessions" },
  admin_att_recent: { sw: "Vipindi vya Hivi Karibuni", en: "Recent sessions" },
  admin_att_none: {
    sw: "Hakuna kipindi cha mahudhurio bado. Fungua kipindi kwenye ukurasa wa Mahudhurio.",
    en: "No attendance session yet. Start one from the Attendance page.",
  },
  admin_att_manage: { sw: "Simamia Mahudhurio", en: "Manage attendance" },
  admin_att_present: { sw: "Waliopo", en: "Present" },
  admin_founder: { sw: "Mwanzilishi", en: "Founder" },
  admin_ai_ready: { sw: "AI Inasahihisha", en: "AI Grading" },
  admin_ai_ready_sub: {
    sw: "Majibu yanapimwa kwa maana, bila kusubiri mwalimu.",
    en: "Answers are marked by meaning, without waiting for a teacher.",
  },
  admin_quick: { sw: "Vitendo vya Haraka", en: "Quick actions" },

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
  quiz: { sw: "Assignment Group", en: "Group Assignment" },
  quiz_sub: {
    sw: "Kazi ya group — chagua wanachama, andika swali, pakia faili",
    en: "Group work — pick your members, write the question, upload the file",
  },
  quiz_badge: { sw: "GROUP", en: "GROUP" },
  quiz_cta: { sw: "Anza kazi", en: "Start assignment" },
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
  test_4: { sw: "Test 4", en: "Test 4" },
  test_5: { sw: "Test 5", en: "Test 5" },
  get_reg: { sw: "Pata Reg Namba", en: "Get a Reg number" },
  teachers_only: { sw: "Walimu pekee", en: "Teachers only" },

  // --- update taarifa -----------------------------------------------------
  update_title: { sw: "Update Taarifa", en: "Update your details" },
  update_sub: {
    sw: "Hatua mbili: weka Reg Namba yako ili kuipata taarifa yako, kisha rekebishe taarifa zako, semina na group lako, kisha hifadhi mabadiliko. Unaweza kubadilisha semina na group lako wakati wowote.",
    en: "Two steps: enter your Reg number to find your details, then edit your details, seminar and group, and save the changes. You can change your seminar and group at any time.",
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
  phone_placeholder: { sw: "Mfano: 0712345678", en: "e.g. 0712345678" },
  phone_help: {
    sw: "Tunatumia namba hii kukufikia kwa taarifa muhimu za masomo.",
    en: "We use this number to reach you about your studies.",
  },
  age: { sw: "Umri", en: "Age" },
  gender: { sw: "Jinsia", en: "Gender" },
  male: { sw: "Mwanaume", en: "Male" },
  female: { sw: "Mwanamke", en: "Female" },
  course: { sw: "Kozi ya Sasa", en: "Current course" },
  semina: { sw: "Semina", en: "Semina" },
  group: { sw: "Group", en: "Group" },
  study_year: { sw: "Mwaka wa Masomo", en: "Study year" },
  year_n: { sw: "Mwaka wa {n}", en: "Year {n}" },
  year_auto: {
    sw: "Umepangwa kutoka Reg Namba yako — hauhitaji kuubadilisha.",
    en: "Worked out from your Reg number — you do not need to change it.",
  },
  year_auto_unknown: {
    sw: "Hatuwezi kutambua mwaka wa masomo kutoka Reg Namba yako. Mwone admin.",
    en: "We cannot read your study year from your Reg number. See an admin.",
  },
  semester: { sw: "Semester", en: "Semester" },
  academic_year: { sw: "Mwaka wa Kitaaluma", en: "Academic year" },
  choose_course: { sw: "Chagua kozi", en: "Choose a course" },
  choose_semina: { sw: "Chagua semina", en: "Choose a semina" },
  choose_group: { sw: "Chagua group", en: "Choose a group" },
  choose_year: { sw: "Chagua mwaka", en: "Choose a year" },
  step_reg: { sw: "Reg Namba", en: "Reg number" },
  step_details: { sw: "Taarifa Zako", en: "Your details" },
  step_finish: { sw: "Group Lako", en: "Your group" },
  step_issue: { sw: "Changamoto", en: "Report a problem" },
  step_reg_help: {
    sw: "Andika Reg Namba yako kisha gusa Tafuta. Ukikuta majina mengi, chagua lako.",
    en: "Enter your Reg number and tap Search. If several names come back, pick yours.",
  },
  finish_help: {
    sw: "Hii ni group uliyoingia. Chini ni wanafunzi wenzako. Gusa Maliza kuhitimisha.",
    en: "This is the group you landed in. Your classmates are listed below. Tap Finish to complete.",
  },
  finish_button: { sw: "Maliza", en: "Finish" },
  finish_title: { sw: "Umekamilisha!", en: "All done!" },
  finish_body: {
    sw: "Taarifa zako zimehifadhiwa. Unaweza kubadilisha semina na group lako tena wakati wowote ukitaka.",
    en: "Your details are saved. You can change your seminar and group again whenever you want.",
  },
  step_issue_help: {
    sw: "Kwa wasiofanya Test 1 / Test 2 au wenye matatizo yoyote — andika hapa, admin atapokea.",
    en: "For missing Test 1 / Test 2 or any other problem — write here and the admin will receive it.",
  },
  next: { sw: "Mbele", en: "Next" },
  save: { sw: "Hifadhi", en: "Save" },
  saving: { sw: "Inahifadhi...", en: "Saving..." },
  save_continue: { sw: "Hifadhi & Endelea", en: "Save & Continue" },
  nothing_changed: { sw: "Hakuna ulichobadilisha.", en: "Nothing changed." },
  group_edit_help: {
    sw: "Chagua semina na group lako, kisha gusa Hifadhi Marekebisho. Unaweza kubadilisha semina na group lako wakati wowote.",
    en: "Pick your seminar and group, then tap Save changes. You can change your seminar and group at any time.",
  },
  confirm_group_short: { sw: "Thibitisha", en: "Confirm" },
  confirming: { sw: "Inathibitisha...", en: "Confirming..." },
  confirm_group_warning: {
    sw: "Ukihifadhi hapa, mabadiliko yako yanahifadhiwa. Unaweza kubadilisha semina na group lako tena wakati wowote.",
    en: "Saving here writes your changes. You can change your seminar and group again at any time.",
  },
  confirm_changes: { sw: "Mabadiliko yako", en: "Your changes" },
  confirm_yes: { sw: "Ndiyo, thibitisha", en: "Yes, confirm" },
  confirm_cancel: { sw: "Sitaki bado", en: "Not yet" },
  save_details: { sw: "Hifadhi Marekebisho", en: "Save changes" },
  save_details_title: {
    sw: "Hifadhi marekebisho yako?",
    en: "Save your changes?",
  },
  group_confirmed_title: {
    sw: "Mabadiliko yako yamehifadhiwa",
    en: "Your changes are saved",
  },
  group_confirmed_at: { sw: "Ilihifadhiwa", en: "Saved" },
  group_not_confirmed: { sw: "Bado haijahifadhiwa", en: "Not saved yet" },
  group_confirmed_badge: { sw: "Umejichagulia", en: "Picked by you" },
  phone_numbers: { sw: "Namba za Simu", en: "Phone numbers" },
  no_phone: { sw: "Hakuna namba", en: "No number" },
  phone_help_group: {
    sw: "Namba zilizosajiliwa na wanafunzi wa group lako. Wasiliana nao kwa masomo na mikutano.",
    en: "Numbers registered by the students in your group. Reach them for lessons and meetings.",
  },
  confirmed_progress: {
    sw: "{done}/{total} wamehakiki",
    en: "{done}/{total} confirmed",
  },
  choose_semester: { sw: "Chagua semester", en: "Choose a semester" },
  academic_placeholder: { sw: "Mfano 2026/2027", en: "e.g. 2026/2027" },
  semester_inactive: {
    sw: "Semester hiyo bado haijawashwa. Chagua SEMESTER 1.",
    en: "That semester is not active yet. Choose SEMESTER 1.",
  },
  issues_disabled: {
    sw: "Changamoto imezimwa na admin kwa sasa.",
    en: "Report an issue is switched off by the admin right now.",
  },
  my_requests: { sw: "Mabadiliko uliyofanya", en: "Changes you made" },
  confirm_unchanged: { sw: "Hakuna sehemu iliyobadilishwa", en: "No field changed" },
  new_reg: { sw: "Reg Namba Mpya", en: "New Reg number" },
  new_name: { sw: "Jina Kamili Jipya", en: "New full name" },
  edits_disabled: {
    sw: "Update Taarifa imezimwa na admin kwa sasa.",
    en: "Update Taarifa is switched off by the admin right now.",
  },
  edit_unlocked_title: {
    sw: "Umefunguliwa marekebisho",
    en: "Your edits are open",
  },
  edit_unlocked_help: {
    sw: "Admin amekufungulia ili urekebishe taarifa zako. Rekebisha, kisha gusa Hifadhi Marekebisho. Ruhusa hii inaisha mara tu unapohifadhi.",
    en: "The admin opened your form so you can correct it. Make your changes, then tap Save changes. This permission ends as soon as you save.",
  },
  edit_unlocked_banner: { sw: "Umefunguliwa na admin", en: "Opened by the admin" },
  edit_spent_title: {
    sw: "Umekwisha kurekebisha mara moja",
    en: "You have already used your one update",
  },
  edit_spent_help: {
    sw: "Umekwisha kuhifadhi marekebisho yako mara moja. Ukiwa unahitaji kubadilisha tena, mwone admin au CR akufungulie.",
    en: "You have already saved your correction once. If you need to change anything again, ask an admin or your CR to open the form for you.",
  },
  group_full: { sw: "imejaa", en: "full" },
  legacy_semina_help: {
    sw: "Semina hii ni ya zamani na haipokei wanafunzi wapya. Chagua semina moja kati ya 1 hadi 15.",
    en: "This seminar is a legacy one and is no longer taking students. Pick a seminar between 1 and 15.",
  },
  start_mode_label: { sw: "Unataka kufanya nini?", en: "What would you like to do?" },
  start_mode_seats: { sw: "Angalia nafasi zilizo wazi", en: "View open seats" },
  start_mode_update: { sw: "Update taarifa zako", en: "Update your details" },
  start_mode_seats_help: {
    sw: "Ona magroup yaliyo wazi kwa mwaka huu na upakue orodha yake.",
    en: "See the groups still open this year and download the list.",
  },
  start_mode_update_help: {
    sw: "Weka Reg Namba yako ili kubadilisha semina, group au taarifa zako nyingine.",
    en: "Enter your Reg number to change your seminar, group or other details.",
  },
  no_open_group_here: {
    sw: "Hakuna group lililo wazi kwenye semina hii. Chagua semina nyingine.",
    en: "No group is open in this seminar. Pick another seminar.",
  },
  confirm_reg_first: { sw: "Thibitisha Reg Namba kwanza.", en: "Confirm your Reg number first." },
  tab_edit: { sw: "Update Taarifa", en: "Update details" },
  tab_issue: { sw: "Changamoto", en: "Report an issue" },
  edit_card_title: { sw: "Rekebisha Taarifa Zako", en: "Edit your details" },
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
    sw: "Hatua mbili: weka Reg Namba, kisha rekebisha taarifa zako, semina na group lako, na uhifadhi.",
    en: "Two steps: enter your Reg number, then edit your details, seminar and group, and save.",
  },

  // --- E-Learning ---------------------------------------------------------
  elearning: { sw: "E-Learning", en: "E-Learning" },
  nav_elearning: { sw: "E-Learning", en: "E-Learning" },
  el_title: { sw: "E-Learning — Video za Masomo", en: "E-Learning — Lesson videos" },
  el_sub: {
    sw: "Lecture, mawaidha na duruus za Dr. Jiba. Fungua video, angalia hapa hapa, na ujibu maswali ya mada pembeni.",
    en: "Lectures, sermons and lessons from Dr. Jiba. Open a video, watch it right here, and answer the topic questions beside it.",
  },
  el_headline: { sw: "Jifunze kwa Video", en: "Learn Through Video" },
  el_kicker: { sw: "Elimu ya Kisasa", en: "Modern learning" },
  el_watch: { sw: "Angalia", en: "Watch" },
  el_watch_now: { sw: "Angalia sasa", en: "Watch now" },
  el_back: { sw: "Rudi kwenye orodha", en: "Back to the list" },
  el_open_youtube: { sw: "Fungua YouTube", en: "Open on YouTube" },
  el_open_tiktok: { sw: "Fungua TikTok", en: "Open on TikTok" },
  el_open_facebook: { sw: "Fungua Facebook", en: "Open on Facebook" },
  el_open_provider: { sw: "Fungua kwenye chanzo", en: "Open at the source" },
  el_loading: { sw: "Inapakia video...", en: "Loading videos..." },
  el_loading_player: { sw: "Video inapakia...", en: "Loading the video..." },
  el_empty: { sw: "Hakuna video bado", en: "No videos yet" },
  el_empty_body: {
    sw: "Mhadhiri bado hajaweka video. Rudi tena baadaye.",
    en: "The lecturer has not posted a video yet. Check back soon.",
  },
  el_error: {
    sw: "Imeshindikana kupata video. Jaribu tena.",
    en: "Could not load the videos. Please try again.",
  },
  el_refresh: { sw: "Onyesha upya", en: "Refresh" },
  el_search: { sw: "Tafuta somo...", en: "Search lessons..." },
  el_all: { sw: "Zote", en: "All" },
  el_count: { sw: "video", en: "videos" },
  el_questions: { sw: "Maswali ya Mada", en: "Topic questions" },
  el_questions_sub: {
    sw: "Jibu maswali haya baada ya kuangalia video. Yalitokana na mada ya somo.",
    en: "Answer these after watching. They come from the lesson's topic.",
  },
  el_questions_none: {
    sw: "Somo hili halina maswali bado.",
    en: "This lesson has no questions yet.",
  },
  el_show_answer: { sw: "Onyesha jibu", en: "Show answer" },
  el_hide_answer: { sw: "Ficha jibu", en: "Hide answer" },
  el_model_answer: { sw: "Jibu la mfano", en: "Model answer" },
  el_key_points: { sw: "Mambo muhimu", en: "Key points" },
  el_question_n: { sw: "Swali", en: "Question" },
  el_of: { sw: "kati ya", en: "of" },
  el_no_questions_badge: { sw: "Bila maswali", en: "No questions" },
  el_questions_badge: { sw: "maswali", en: "questions" },
  el_topic: { sw: "Mada", en: "Topic" },
  el_watch_help: {
    sw: "Video inaonekana hapa hapa. Ukiishindwa kuiona, tumia kitufe cha kufungua kwenye chanzo.",
    en: "The video plays right here. If it will not play, use the button to open it at the source.",
  },
  el_help_title: { sw: "Jinsi ya kutumia", en: "How to use this page" },
  el_help_1: {
    sw: "Chagua somo kwenye orodha, au tafuta kwa jina.",
    en: "Pick a lesson from the list, or search by name.",
  },
  el_help_2: {
    sw: "Video inafunguka papo hapo; maswali ya mada yako pembeni.",
    en: "The video opens right away; the topic questions sit beside it.",
  },
  el_help_3: {
    sw: "Jibu maswali kwa mdomo au kwenye daftari lako, kisha angalia jibu la mfano.",
    en: "Answer aloud or in your notebook, then check the model answer.",
  },
  el_public_note: { sw: "Wazi kwa wanafunzi wote", en: "Open to all students" },
  el_new: { sw: "Mpya", en: "New" },
  el_teacher: { sw: "Mhadhiri", en: "Lecturer" },
  el_provider: { sw: "Chanzo", en: "Source" },
  el_lesson: { sw: "Somo", en: "Lesson" },
  el_description: { sw: "Maelezo", en: "Description" },

  // --- E-Learning admin ---------------------------------------------------
  el_admin_title: { sw: "E-Learning — Weka Video", en: "E-Learning — Add a video" },
  el_admin_sub: {
    sw: "Bandika link ya YouTube, TikTok au Facebook. Mfumo unachukua picha na jina, na unaunda maswali ya mada. Rekebisha kisha hifadhi.",
    en: "Paste a YouTube, TikTok or Facebook link. The system takes the picture and title, and builds topic questions. Edit them, then save.",
  },
  el_admin_link: { sw: "Link ya video", en: "Video link" },
  el_admin_link_ph: {
    sw: "Bandika link ya YouTube, TikTok au Facebook hapa...",
    en: "Paste a YouTube, TikTok or Facebook link here...",
  },
  el_admin_check: { sw: "Angalia link", en: "Check the link" },
  el_admin_ready: { sw: "Link imekubaliwa", en: "Link accepted" },
  el_admin_resolving: {
    sw: "Inafungua link ya kushiriki...",
    en: "Opening the share link...",
  },
  el_admin_resolve_failed: {
    sw: "Link hii ya kushiriki haikufunguka. Fungua video kisha bandika link ya kwenye upau wa anwani.",
    en: "This share link could not be opened. Open the video and paste the link from the address bar.",
  },
  el_admin_title_sw: { sw: "Jina la somo (Kiswahili)", en: "Lesson title (Swahili)" },
  el_admin_title_en: { sw: "Jina la somo (Kiingereza)", en: "Lesson title (English)" },
  el_admin_desc_sw: { sw: "Maelezo (Kiswahili)", en: "Description (Swahili)" },
  el_admin_desc_en: { sw: "Maelezo (Kiingereza)", en: "Description (English)" },
  el_admin_category: { sw: "Aina ya somo", en: "Lesson type" },
  el_admin_generate: { sw: "Unda maswali kwa mada", en: "Generate topic questions" },
  el_admin_regenerate: { sw: "Unda upya maswali", en: "Regenerate questions" },
  el_admin_quiz: { sw: "Maswali ya mada", en: "Topic questions" },
  el_admin_quiz_hint: {
    sw: "Maswali yanatengenezwa kutoka jina na maelezo ya somo. Unaweza kuyaandika upya kabla ya kuhifadhi.",
    en: "The questions are built from the lesson's title and description. You can rewrite them before saving.",
  },
  el_admin_add_q: { sw: "Ongeza swali", en: "Add question" },
  el_admin_remove_q: { sw: "Ondoa", en: "Remove" },
  el_admin_save: { sw: "Hifadhi somo", en: "Save lesson" },
  el_admin_saved: { sw: "Somo limehifadhiwa", en: "Lesson saved" },
  el_admin_deleted: { sw: "Somo limefutwa", en: "Lesson deleted" },
  el_admin_save_failed: { sw: "Imeshindikana kuhifadhi", en: "Could not save" },
  el_admin_need_link: { sw: "Bandika link kwanza", en: "Paste a link first" },
  el_admin_need_title: { sw: "Weka jina la somo", en: "Enter a lesson title" },
  el_admin_list: { sw: "Video zilizopo", en: "Existing videos" },
  el_admin_none: {
    sw: "Hakuna video bado. Bandika link juu.",
    en: "No videos yet. Paste a link above.",
  },
  el_admin_active: { sw: "Inaonekana", en: "Visible" },
  el_admin_hidden: { sw: "Imefichwa", en: "Hidden" },
  el_admin_edit: { sw: "Rekebisha", en: "Edit" },
  el_admin_delete: { sw: "Futa", en: "Delete" },
  el_admin_delete_confirm: { sw: "Futa somo hili?", en: "Delete this lesson?" },
  el_admin_delete_body: { sw: "Haitarudishwa.", en: "This cannot be undone." },
  el_admin_cancel_edit: { sw: "Acha kurekebisha", en: "Cancel edit" },
  el_admin_editing: { sw: "Unarekebisha somo", en: "Editing a lesson" },
  el_admin_new: { sw: "Somo jipya", en: "New lesson" },
  el_admin_preview_missing: {
    sw: "Hatukuweza kupata jina la video. Andika jina mwenyewe.",
    en: "We could not fetch the video title. Type one yourself.",
  },
  el_admin_q_sw: { sw: "Swali (Kiswahili)", en: "Question (Swahili)" },
  el_admin_q_en: { sw: "Swali (Kiingereza)", en: "Question (English)" },
  el_admin_a_sw: { sw: "Jibu (Kiswahili)", en: "Answer (Swahili)" },
  el_admin_a_en: { sw: "Jibu (Kiingereza)", en: "Answer (English)" },
  el_admin_points: { sw: "Mambo muhimu (tenganisha kwa koma)", en: "Key points (comma separated)" },
  el_admin_detected: { sw: "Mada iliyotambuliwa", en: "Detected topic" },
  el_admin_no_topic: { sw: "Hakuna mada iliyotambuliwa", en: "No topic detected" },
  el_admin_thumb: { sw: "Picha ya video", en: "Video picture" },
  el_admin_thumb_hint: {
    sw: "Picha inachukuliwa kutoka kwenye link. Unaweza kuibadilisha kwa URL nyingine.",
    en: "The picture comes from the link. You can replace it with another URL.",
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
    const saved = storageGet("lang") as Lang | null;
    if (saved === "en" || saved === "sw") setLangState(saved);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    storageSet("lang", l);
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
