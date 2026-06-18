import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Lang = "sw" | "en";
const dict: Record<string, { sw: string; en: string }> = {
  home: { sw: "Mwanzo", en: "Home" },
  back: { sw: "Rudi", en: "Back" },
  forward: { sw: "Mbele", en: "Forward" },
  register: { sw: "Jisajili", en: "Register" },
  exams: { sw: "Mitihani", en: "Exams" },
  results: { sw: "Matokeo", en: "Results" },
  admin: { sw: "Admin", en: "Admin" },
  title_app: { sw: "Mfumo wa Mtihani wa Islamic Studies", en: "Islamic Studies Exam System" },
  subtitle_app: { sw: "Mtandaoni · AI · Kamera · GPS · Sahihi", en: "Online · AI · Camera · GPS · Signature" },
  do_exam: { sw: "Fanya Mtihani", en: "Take Exam" },
  view_results: { sw: "Angalia Matokeo", en: "View Results" },
  loading: { sw: "Inapakia...", en: "Loading..." },
  language: { sw: "Lugha", en: "Language" },
};

const Ctx = createContext<{ lang: Lang; t: (k: string) => string; setLang: (l: Lang) => void }>({
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
  const setLang = (l: Lang) => { localStorage.setItem("lang", l); setLangState(l); };
  const t = (k: string) => dict[k]?.[lang] ?? k;
  return <Ctx.Provider value={{ lang, t, setLang }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);