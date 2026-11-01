/**
 * Kanzi ya maarifa ya Islamic Studies.
 *
 * Hutumika na `ai-grader.ts` kutambua jibu sahihi hata pale ambapo mwalimu
 * hajaweka `correct_answer`. Kila kikundi kina maneno yanayomaanisha kitu
 * kimoja kwa lugha tofauti (Kiswahili, Kiingereza, Kiarabu) ili jibu la
 * mwanafunzi litambulike kwa MAANA, sio kwa maneno yanayofanana.
 */

/** Vitu vinavyomaanisha kimoja — "Mungu" = "Allah" = "Mola". */
export const SYNONYM_GROUPS: string[][] = [
  ["allah", "mungu", "mola", "rabi", "rabb", "god", "the almighty", "subhanahu"],
  ["mtume", "nabii", "rasuli", "prophet", "messenger", "rasul", "nabi"],
  ["muhammad", "mohammed", "mohamed", "muhammed", "mustafa", "ahmad"],
  ["quran", "kurani", "qur'an", "koran", "kitabu", "book of allah"],
  ["hadith", "hadisi", "sunna", "sunnah", "mila", "traditions"],
  ["sala", "swala", "salat", "salah", "prayer", "prayers", "kuswali"],
  ["zaka", "zakah", "zakat", "almsgiving", "sadaka"],
  ["saumu", "funga", "fasting", "sawm", "siyam"],
  ["hajj", "haji", "pilgrimage", "ziara"],
  ["iman", "faith", "imani", "kuamini"],
  ["tawhid", "tawheed", "umoja", "monotheism", "oneness", "upweke"],
  ["shirk", "ushirikina", "polytheism", "kuushirikisha"],
  ["jibril", "gabriel", "jibreel", "malai jibril"],
  ["malaika", "malaika", "angels", "angel", "malayk"],
  ["shetani", "shetwan", "iblis", "satan", "devil", "iblis"],
  ["malaika wakuu", "archangels"],
  ["jannah", "peponi", "paradise", "heaven", "bustani"],
  ["jahannam", "motoni", "hell", "hellfire", "moto"],
  ["qiyama", "kiama", "day of judgment", "day of resurrection", "siku ya mwisho"],
  ["imam", "kiongozi", "leader", "imamu"],
  ["khalifa", "caliph", "caliphate", "khalifa"],
  ["sunni", "sunni", "ahl sunna", "sunna"],
  ["shia", "shia", "shiite", "shiah"],
  ["fiqh", "jurisprudence", "sheria ya kiislamu"],
  ["sharia", "shariah", "sheria", "islamic law"],
  ["tafsir", "exegesis", "tafseer", "ufafanuzi wa quran"],
  ["ijma", "consensus", "makubaliano"],
  ["qiyas", "analogy", "ulinganisho"],
  ["ijtihad", "ijtihaad", "independent reasoning"],
  ["wudu", "udhu", "ablution", "kuoga"],
  ["ghusl", "ghusul", "bath", "kuoga kabisa"],
  ["tayammum", "tayamum", "dry ablution"],
  ["adhan", "azan", "call to prayer", "mwito wa swala"],
  ["iqama", "ikama", "iqamah"],
  ["qibla", "qiblah", "direction of prayer", "kibla"],
  ["kaaba", "kaaba", "kaba", "ka'ba", "baitullah", "nyumba ya mungu"],
  ["masjid", "msikiti", "mosque"],
  ["ramadan", "ramadhani", "ramadhan"],
  ["eid", "id", "idi", "eid ul fitr", "eid ul adha"],
  ["ashura", "ashura", "ashuraa"],
  ["hijra", "hijrah", "migration", "uhama"],
  ["makkah", "mekka", "mecca", "makkah al mukarramah"],
  ["madinah", "medina", "madinah al munawwarah"],
  ["ummah", "umma", "community", "jamii ya waislamu"],
  ["khutbah", "hutuba", "sermon", "mahubiri"],
  ["sunna", "sunnah", "mila ya mtume"],
  ["bidah", "bidaa", "innovation", "ubunifu katika dini"],
  ["haram", "haramu", "forbidden", "prohibited"],
  ["halal", "halali", "permitted", "allowed"],
  ["makruh", "makruhu", "disliked", "karaha"],
  ["mustahab", "sunna", "recommended", "inapendekezwa"],
  ["fardh", "faradhi", "fard", "obligatory", "lazima"],
  ["wajib", "wajibu", "obligatory", "lazima"],
  ["najis", "najisi", "impurity", "unchastity"],
  ["tahara", "taharah", "purity", "usafi"],
  ["jihad", "jihaad", "struggle", "kujitolea"],
  ["dawah", "dawa", "invitation to islam", "mwito"],
  ["kalima", "shahada", "shahadah", "declaration of faith", "kukiri"],
  ["arkan", "pillars", "nguzo", "misingi"],
  ["wajib", "obligations"],
  ["sahaba", "masahaba", "companions", "sahaba"],
  ["tabiun", "tabieen", "successors"],
  ["ahlul kitab", "people of the book", "watu wa kitabu"],
  ["tawrat", "torah", "taurat"],
  ["injil", "gospel", "injili"],
  ["zabur", "psalms", "zaburi"],
  ["suhuf", "scrolls", "sahifa"],
  ["isra", "miraj", "isra wal miraj", "night journey"],
  ["aqiqah", "aqiqa"],
  ["nikah", "ndoa", "marriage", "nikaha"],
  ["talaq", "talaka", "divorce"],
  ["mirath", "mirathi", "inheritance", "urithi"],
  ["waqf", "wakf", "endowment", "waqfu"],
  ["riba", "usury", "interest"],
  ["gharar", "uncertainty", "uncertain"],
  ["takaful", "insurance"],
  ["khums", "khumus", "one fifth"],
  ["jizya", "jizyah", "poll tax"],
  ["zakatul fitr", "zakat ul fitr", "fitra", "sadaqatul fitr"],
  ["sadaqah", "sadaka", "charity"],
  ["itikaf", "i'tikaf", "seclusion"],
  ["taraweeh", "tarawih", "night prayers"],
  ["qiyam", "tahajjud", "night prayer"],
  ["witr", "witr", "odd prayer"],
  ["sujud", "sajda", "prostration", "kusujudu"],
  ["ruku", "rukuu", "bowing", "kuinama"],
  ["takbir", "takbeer", "allahu akbar"],
  ["taslim", "salaam", "greeting"],
  ["fatiha", "al fatiha", "opening chapter", "fatiha"],
  ["ikhlas", "al ikhlas", "sincerity"],
  ["kursi", "ayatul kursi", "throne verse"],
  ["baqarah", "al baqarah", "the cow"],
  ["yasin", "ya sin", "yaaseen"],
  ["rahman", "ar rahman", "the merciful"],
  ["kahf", "al kahf", "the cave"],
  ["nas", "an nas", "mankind"],
  ["falaq", "al falaq", "daybreak"],
  ["fatihah", "fatiha"],
  ["ilm", "elimu", "knowledge", "learning"],
  ["adab", "adabu", "etiquette", "manners"],
  ["akhlaq", "maadili", "morals", "character", "ethics"],
  ["sabr", "subira", "patience", "perseverance"],
  ["shukr", "shukrani", "gratitude", "thanks"],
  ["tawakkul", "trust in allah", "kumtegemea mungu"],
  ["taqwa", "uchamungu", "piety", "god consciousness"],
  ["ikhlas", "sincerity", "unyofu"],
  ["haya", "aibu", "modesty", "shame"],
  ["amanah", "uaminifu", "trustworthiness", "trust"],
  ["sidq", "ukweli", "truthfulness", "honesty"],
  ["adl", "haki", "justice", "fairness"],
  ["ihsan", "excellence", "wema", "perfection"],
  ["rahma", "rehema", "mercy", "compassion"],
  ["khushu", "khushuu", "humility in prayer"],
  ["nikah", "marriage"],
  ["walima", "walimah", "wedding feast"],
  ["iddah", "idda", "waiting period"],
  ["mahram", "mahram", "guardian"],
  ["hijab", "hijabu", "veil", "covering"],
  ["awrah", "aura", "private parts"],
  ["khamr", "pombe", "alcohol", "intoxicant"],
  ["maidah", "al maidah", "the table"],
  ["nur", "an nur", "light"],
  ["hujurat", "al hujurat", "the rooms"],
  ["luqman", "luqman", "luqmaan"],
  ["maryam", "mary", "maryamu"],
  ["ibrahim", "abraham", "ibrahim"],
  ["musa", "moses", "musa"],
  ["isa", "jesus", "isaa"],
  ["nuh", "noah", "nuu"],
  ["adam", "adam", "aadam"],
  ["hawwa", "eve", "hawa"],
  ["yusuf", "joseph", "yusufu"],
  ["ayyub", "job", "ayub"],
  ["yunus", "jonah", "yunus"],
  ["dawud", "david", "daud"],
  ["sulaiman", "solomon", "sulayman"],
  ["zakariya", "zechariah", "zakariyya"],
  ["yahya", "john", "yahya"],
  ["ismail", "ishmael", "ismail"],
  ["ishaq", "isaac", "ishaq"],
  ["yaqub", "jacob", "yakub"],
  ["harun", "aaron", "haruni"],
  ["shuaib", "jethro", "shuaib"],
  ["salih", "salih", "saleh"],
  ["hud", "hud", "huud"],
  ["lut", "lot", "luti"],
  ["idris", "enoch", "idris"],
  ["khidr", "khidr", "al khidr"],
  ["bilal", "bilal", "bilal ibn rabah"],
  ["abubakar", "abu bakr", "abubakr", "siddiq"],
  ["umar", "umar", "umar ibn khattab", "farooq"],
  ["uthman", "uthman", "uthman ibn affan"],
  ["ali", "ali", "ali ibn abi talib"],
  ["hamza", "hamza", "hamzah"],
  ["khadija", "khadija", "khadijah"],
  ["aisha", "aisha", "aishah"],
  ["fatima", "fatima", "fatimah"],
  ["zainab", "zainab", "zaynab"],
  ["umm salama", "umm salamah"],
  ["talha", "talha", "talhah"],
  ["zubair", "zubair", "zubayr"],
  ["saad", "saad", "sa'd"],
  ["abudhar", "abu dhar", "abu dharr"],
  ["salman", "salman", "salman al farisi"],
  ["khalid", "khalid", "khalid ibn walid"],
  ["ansari", "ansar", "helpers"],
  ["muhajirun", "muhajireen", "migrants"],
];

/** Alama za Kiarabu zinazojulikana na maana zake. */
export const ARABIC_TERMS: Record<string, string> = {
  الله: "allah",
  محمد: "muhammad",
  القرآن: "quran",
  الحديث: "hadith",
  الصلاة: "sala",
  الزكاة: "zaka",
  الصوم: "saumu",
  الحج: "hajj",
  الإيمان: "iman",
  التوحيد: "tawhid",
  الشرك: "shirk",
  الجنة: "jannah",
  جهنم: "jahannam",
  القيامة: "qiyama",
  الكعبة: "kaaba",
  المسجد: "masjid",
  رمضان: "ramadan",
  الهجرة: "hijra",
  مكة: "makkah",
  المدينة: "madinah",
};

const SYNONYM_INDEX: Map<string, Set<string>> = (() => {
  const index = new Map<string, Set<string>>();
  for (const group of SYNONYM_GROUPS) {
    const set = new Set(group);
    for (const term of group) {
      const existing = index.get(term);
      if (existing) for (const t of set) existing.add(t);
      else index.set(term, new Set(set));
    }
  }
  return index;
})();

/**
 * Maneno yote yanayomaanisha kimoja na neno hili, pamoja na neno lenyewe.
 *
 * Ulinganisho ni wa neno zima. Ulinganisho wa viambishi (`"na"` → `"iman"`)
 * ungeleta makosa mengi, kwa hiyo kanzi imejengwa kwa maneno kamili pekee.
 */
export function synonymsOf(term: string): Set<string> {
  const key = term.toLowerCase().trim();
  const direct = SYNONYM_INDEX.get(key);
  return direct ? new Set(direct) : new Set([key]);
}

/** Badilisha maneno ya Kiarabu kuwa yale yanayotambulika. */
export function normalizeArabic(text: string): string {
  let out = text;
  for (const [ar, latin] of Object.entries(ARABIC_TERMS)) out = out.replaceAll(ar, ` ${latin} `);
  return out;
}

/**
 * Rubric ya kila mada: kila kipengele ni kundi la maneno yanayoonyesha wazo
 * moja. Mwanafunzi akitaja neno lolote la kundi, wazo hilo limefikiwa.
 *
 * Hii ndiyo inayoruhusu mfumo "kujua" jibu bila mwalimu kuandika
 * `correct_answer` — mfumo unapima kama jibu limegusa mawazo ya mada.
 */
export const TOPIC_RUBRICS: Record<string, string[][]> = {
  // Kuhifadhi Qur'an na Sunnah — mada ya kawaida ya mitihani.
  preserve: [
    ["kukariri", "memorisation", "memorization", "memorise", "recitation", "recite"],
    ["kuandika", "writing", "maandishi", "record", "kuandika"],
    ["kufundisha", "teaching", "kueneza", "propagation", "kufundisha"],
    ["review", "marudio", "revision", "kukagua", "kuhesabu"],
    ["compilation", "ukusanyaji", "kukusanya", "book", "vitabu"],
  ],
  hadith: [
    ["maneno", "matendo", "usemi", "maelezo", "kukiri"],
    ["mtume", "muhammad", "nabii", "rasuli"],
    ["mila", "sunnah", "riwaya", "isnad", "mfululizo"],
  ],
  quran: [
    ["allah", "wahyi", "ufunuo", "kuteremshwa"],
    ["jibril", "malaika"],
    ["kitabu", "sura", "aya", "maelezo"],
    ["muhammad", "mtume", "nabii"],
  ],
  sunnah: [
    ["mtume", "muhammad", "nabii"],
    ["maneno", "matendo", "maelezo", "mila"],
    ["mfano", "kuiga", "kufuata"],
  ],
  sala: [
    ["nyakati", "tano", "majira"],
    ["wudu", "usafi", "tahara"],
    ["qibla", "kaaba", "kibla"],
    ["rakaa", "takbir", "sujud", "ruku"],
  ],
  zaka: [
    ["ngawila", "malipo", "kutoa"],
    ["mali", "pesa", "nisabu"],
    ["maskini", "fukara", "wahitaji"],
    ["mwaka", "asilimia", "hijra"],
  ],
  saumu: [
    ["ramadan", "mwezi"],
    ["funga", "kujizuia", "kufunga"],
    ["alfajiri", "magharibi", "adhan"],
    ["nia", "kusudi"],
  ],
  hajj: [
    ["makkah", "kaaba"],
    ["ihram", "tawaf", "safa", "marwa"],
    ["arafah", "muzdalifah", "mina"],
    ["mara moja", "nguzo", "ufungaji"],
  ],
  tawhid: [
    ["umoja", "mmoja", "pweke"],
    ["allah", "mungu", "mola"],
    ["shirk", "ushirikina", "kuabudu"],
    ["peke yake", "hakuna mwingine"],
  ],
  iman: [
    ["nguzo", "misingi"],
    ["malaika", "vitabu", "mitume"],
    ["qiyama", "kiama", "qadr"],
    ["allah", "kuamini", "kukiri"],
  ],
  nikah: [
    ["ndoa", "kuoana", "nikaha"],
    ["wali", "mahari", "ridhaa"],
    ["shahidi", "mashahidi"],
    ["mume", "mke"],
  ],
  talaq: [
    ["talaka", "kutengana", "kuachana"],
    ["iddah", "kungoja"],
    ["ndoa", "mume", "mke"],
    ["masharti", "hukumu"],
  ],
  mirath: [
    ["mirathi", "urithi"],
    ["warithi", "warithi", "ndugu"],
    ["sehemu", "quran", "wasiya"],
    ["kugawana", "mgawanyo"],
  ],
  sharia: [
    ["sheria", "hukumu", "fiqh"],
    ["halali", "haramu"],
    ["quran", "sunnah"],
    ["ijma", "qiyas", "ijtihad"],
  ],
  wudu: [
    ["usafi", "tahara", "kujisafisha"],
    ["maji", "kuosha"],
    ["uso", "mikono", "kichwa", "miguu"],
    ["sala", "kabla ya"],
  ],
  malaika: [
    ["nur", "mwanga", "kutoka nur"],
    ["jibril", "mikail", "israfil", "azrail"],
    ["wakuu", "malayk"],
    ["hawafanyi", "hawana dhambi", "watiifu"],
  ],
  jannah: [
    ["peponi", "bustani", "jannah"],
    ["mito", "milele", "furaha"],
    ["wema", "mema", "waadilifu"],
    ["allah", "malipo", "thawabu"],
  ],
  jahannam: [
    ["motoni", "jahannam", "moto"],
    ["adhabu", "mateso", "kuadhibiwa"],
    ["milele", "daima"],
    ["waovu", "dhambi", "waovu"],
  ],
  qiyama: [
    ["kiama", "qiyama", "siku ya mwisho"],
    ["kufufuliwa", "fufuka", "kufufuka"],
    ["hesabu", "mizani", "sirat"],
    ["malipo", "thawabu", "adhabu"],
  ],
  hijra: [
    ["makkah", "mekka"],
    ["madinah", "medina"],
    ["uhama", "kuhama", "migration"],
    ["622", "mwaka", "kalenda", "mwanzo"],
  ],
  khulafa: [
    ["abubakar", "umar", "uthman", "ali"],
    ["khalifa", "warashidi", "waongofu"],
    ["baada ya", "mtume", "kuongoza"],
  ],
  adabu: [
    ["adabu", "maadili", "akhlaq", "tabia"],
    ["heshima", "kuthamini"],
    ["wazazi", "walimu", "watu"],
    ["wema", "upole", "huruma"],
  ],
  elimu: [
    ["elimu", "kujifunza", "kufundisha"],
    ["maarifa", "hekima", "ilm"],
    ["lazima", "wajibu", "faradhi"],
    ["allah", "mtume", "waislamu"],
  ],
  ibada: [
    ["ibada", "kuabudu"],
    ["allah", "mola", "mungu"],
    ["sala", "zaka", "saumu", "hajj"],
    ["nyenyekevu", "unyofu", "ikhlas"],
  ],
  toba: [
    ["toba", "kuomba msamaha", "kurejea"],
    ["dhambi", "kosa", "makosa"],
    ["allah", "rehema", "msamaha"],
    ["kutubu", "kuacha", "kurekebisha"],
  ],
  dua: [
    ["dua", "maombi", "kuomba"],
    ["allah", "mola", "mungu"],
    ["mwomba", "mtumishi", "kumtegemea"],
  ],
  shukrani: [
    ["shukrani", "shukr", "asante"],
    ["neema", "baraka", "riziki"],
    ["allah", "mola", "mungu"],
  ],
  saburi: [
    ["saburi", "subira", "sabr", "uvumilivu"],
    ["shida", "majaribio", "mateso"],
    ["allah", "malipo", "thawabu"],
  ],
};

/** Rubric za swali, zikiwa tayari kwa kupimwa. */
export function clustersForQuestion(question: string, explicit?: string[]): string[][] {
  if (Array.isArray(explicit) && explicit.length > 0) return explicit.map((c) => [c]);
  const q = normalizeArabic(question).toLowerCase();

  // Mada moja tu — ile inayolingana zaidi — hutumika. Kuchanganya mada zote
  // zinazotajwa hufanya rubrics zisizohusiana na swali ziongeze vigezo vya
  // uongo. Neno refu zaidi lililolingana ndilo linaamua, kwa sababu neno
  // mahususi ("preserve") hueleza mada kuliko jina la jumla ("sunnah").
  let best: string[][] = [];
  let bestLongest = 0;
  let bestTotal = 0;
  for (const [topic, rubric] of Object.entries(TOPIC_RUBRICS)) {
    // Set huondoa marudio: `synonymsOf` inaweza kurudia neno lenyewe, na
    // marudio yangevimba alama ya mada.
    const terms = new Set([topic, ...synonymsOf(topic)]);
    const hits = [...terms].filter((t) => q.includes(t));
    if (hits.length === 0) continue;
    const longest = Math.max(...hits.map((t) => t.length));
    const totalLen = hits.reduce((a, t) => a + t.length, 0);
    if (longest > bestLongest || (longest === bestLongest && totalLen > bestTotal)) {
      bestLongest = longest;
      bestTotal = totalLen;
      best = rubric;
    }
  }
  return best;
}

/** Jina la kundi linaloonyeshwa kwa mwanafunzi. */
export function clusterLabel(cluster: string[]): string {
  return cluster[0];
}
