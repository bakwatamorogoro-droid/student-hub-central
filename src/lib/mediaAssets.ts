// Media served from public/media/ so they work on any host.
// The previous Lovable-hosted /__l5e/asset paths returned 502 off-Lovable.
//
// The exam page heads a form with a still photograph: motion behind a form
// competes with it.
export const EXAM_HERO_IMAGE = "/media/exam-hero.jpg";
export const MUM_LOGO = "/media/mum-logo.png";

// The dashboard opening. Two encodings of the same frame so a browser that
// takes WebP downloads 72 KB instead of 97 KB; both are pre-sized at 1000px,
// which is enough for the card at 2x on every width it is shown at.
export const HOME_HERO_IMAGE = "/media/home-hero.jpg";
export const HOME_HERO_IMAGE_WEBP = "/media/home-hero.webp";
