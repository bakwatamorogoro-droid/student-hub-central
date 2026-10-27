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
  { src: "/media/exam-hall-1.jpg", titleKey: "media_title", captionKey: "media_desc" },
  { src: "/media/exam-hall-2.jpg", titleKey: "cartoon_title", captionKey: "cartoon_sub" },
  { src: "/media/exam-hall-3.jpg", titleKey: "stats_title", captionKey: "media_desc" },
  { src: "/media/exam-hall-4.jpg", titleKey: "badge_security", captionKey: "media_desc" },
];

/**
 * Hand-drawn style illustrations (rendered offline with PIL, not generated
 * photographs) of Muslim students in class, in the hall, in a group and
 * studying alone. `titleKey`/`captionKey` are i18n keys so the captions follow
 * the language toggle.
 */
export const CARTOONS = [
  { src: "/media/cartoon-hall.jpg", titleKey: "media_title", captionKey: "media_desc" },
  { src: "/media/cartoon-auditorium.jpg", titleKey: "photos_title", captionKey: "cartoon_sub" },
  { src: "/media/cartoon-group.jpg", titleKey: "quiz", captionKey: "cartoon_sub" },
  { src: "/media/cartoon-one.jpg", titleKey: "study_year", captionKey: "cartoon_sub" },
];

