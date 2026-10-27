// Media served from public/media/ so they work on any host.
// The previous Lovable-hosted /__l5e/asset paths returned 502 off-Lovable.
//
// The clips and stills below are rendered motion-graphics of African Muslim
// students sitting an exam (see public/media). They are vector-style animation
// rather than generated photographs, and each clip is authored to loop.
export const HOME_ANIMATION = "/media/home-animation.mp4";
export const EXAM_HERO_VIDEO = "/media/exam-hero.mp4";
export const STUDY_HALL_LOOP = "/media/study-hall-loop.mp4";
export const MUM_LOGO = "/media/mum-logo.png";

// Poster frames let the browser paint the first frame before the video decodes.
export const POSTER_HOME = "/media/poster-home.jpg";
export const POSTER_EXAM = "/media/poster-exam.jpg";
export const POSTER_STUDY = "/media/poster-study.jpg";

/** Stills pulled from the same animation, used for the exam-hall gallery. */
export const EXAM_HALL_STILLS = [
  { src: "/media/exam-hall-1.jpg", title: "Ukumbi wa Mtihani", caption: "Wanafunzi wakianza mtihani kwa utulivu na nidhamu." },
  { src: "/media/exam-hall-2.jpg", title: "Kuandika Majibu", caption: "Kila mwanafunzi anajibu kwa makini kwenye karatasi yake." },
  { src: "/media/exam-hall-3.jpg", title: "Muda wa Mtihani", caption: "Saa ya ukutani inafuatilia muda wa mtihani." },
  { src: "/media/exam-hall-4.jpg", title: "Nidhamu na Adabu", caption: "Mazingira ya Kiislamu yenye heshima na utulivu." },
];
