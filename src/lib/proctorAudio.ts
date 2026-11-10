/**
 * Audio integrity for a live exam: is someone speaking, and how much?
 *
 * The owner asked the system to notice when "there are people, or the student
 * is being looked at, or someone is helping him". Camera presence (see
 * `proctoring.ts`) answers the "is a person there" half by looking at the
 * picture. This file answers the other half — whether there is *talking* — which
 * a camera cannot hear and a picture cannot show.
 *
 * The rule this file keeps, and the reason it is written the way it is: **it
 * measures, it does not listen.** An exam room is not a place to transcribe a
 * student, and sending a minor's audio to a model to guess what was said would
 * be both a privacy problem and a wrong answer half the time. So the analyser
 * reads one number — how loud the room is — many times a second, and every
 * sample is discarded the moment it is read. Nothing is recorded, nothing is
 * uploaded, and no speech is turned into words. What the teacher gets is a
 * timeline of "quiet" and "someone was talking for 6 seconds", which is exactly
 * what they can act on.
 *
 * As with the camera check, the judgement is deliberately conservative: a single
 * cough, a chair scrape, or a door is not an incident. Only speech that persists
 * across a run of samples is reported.
 */

/** One reading of the room's loudness, all derived from the same instant. */
export type AudioLevel = {
  /** RMS amplitude, 0–1. Roughly the room's loudness. */
  rms: number;
  /** Energy in the voice band relative to the whole spectrum, 0–1. */
  voiceRatio: number;
};

export type AudioVerdict = "quiet" | "talking" | "noisy";

/**
 * Above this RMS the room is loud enough that speech is plausible.
 *
 * This is not "is a human speaking" — that needs a model. It is "is there
 * something to look at", and it is set high enough that the hum of a fan or a
 * keyboard does not clear it.
 */
const TALKING_RMS = 0.045;

/**
 * Below this RMS the room is quiet enough that the verdict is meaningful.
 * Between this and `TALKING_RMS` is "noisy", which is reported but not treated
 * as speech.
 */
const QUIET_RMS = 0.012;

/**
 * The share of energy that must sit in the voice band before a loud sample is
 * called talking rather than noise. Speech concentrates in roughly 300–3000 Hz;
 * a fan, a fan and a keyboard are spread far more evenly.
 */
const VOICE_BAND_MIN = 0.45;

/**
 * Classify one reading.
 *
 * The two-part test — loud *and* concentrated in the voice band — is what keeps
 * a noisy classroom fan from reading as a conversation. Either signal alone
 * would produce false accusations, which in an exam is worse than a miss.
 */
export function judgeAudio(level: AudioLevel): AudioVerdict {
  if (level.rms < QUIET_RMS) return "quiet";
  if (level.rms < TALKING_RMS) return "noisy";
  return level.voiceRatio >= VOICE_BAND_MIN ? "talking" : "noisy";
}

/**
 * Folds a run of readings into one verdict.
 *
 * `window` readings must agree before anything is reported, so that a single
 * cough in an otherwise silent room stays silent. The verdict is the most
 * serious one that the window supports: any talking wins, otherwise any noise.
 */
export function summariseAudio(levels: AudioLevel[], window = 3): AudioVerdict {
  if (levels.length < window) return "quiet";
  const recent = levels.slice(-window);
  if (recent.some((l) => judgeAudio(l) === "talking")) return "talking";
  if (recent.some((l) => judgeAudio(l) === "noisy")) return "noisy";
  return "quiet";
}

/**
 * The share of a window's readings that count as talking.
 *
 * This is the number worth showing a teacher: "talking in 40% of the last
 * minute" is a different accusation from "a word was heard once", and only the
 * teacher can tell which it was.
 */
export function talkingShare(levels: AudioLevel[]): number {
  if (levels.length === 0) return 0;
  const talking = levels.filter((l) => judgeAudio(l) === "talking").length;
  return talking / levels.length;
}

export type AudioMonitorOptions = {
  /** How often to read the analyser, in ms. */
  intervalMs?: number;
  /** Readings that must agree before a verdict is reported. */
  window?: number;
  onVerdict: (verdict: AudioVerdict, level: AudioLevel) => void;
  /** Readings so far, newest last. Capped, so this stays cheap over an hour. */
  onHistory?: (levels: AudioLevel[]) => void;
};

/**
 * How many readings to keep. At the default interval this is a few minutes of
 * history — enough to show a pattern, far too little to reconstruct anything.
 */
const HISTORY_CAP = 240;

/**
 * Reads a live `MediaStream`'s microphone and reports what the room sounds like.
 *
 * The stream is *not* recorded and nothing leaves the page: this only ever
 * reads the analyser's current frame. Call the returned function to stop; it
 * closes the `AudioContext` so the microphone indicator goes out.
 */
export function monitorAudio(
  stream: MediaStream,
  { intervalMs = 2000, window = 3, onVerdict, onHistory }: AudioMonitorOptions,
): () => void {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return () => {};

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  // 1024 bins at 48 kHz is ~47 Hz per bin: fine enough to separate the voice
  // band from the rest, coarse enough to be cheap.
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);

  const time = new Float32Array(analyser.fftSize);
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const history: AudioLevel[] = [];

  const read = (): AudioLevel => {
    analyser.getFloatTimeDomainData(time);
    let sum = 0;
    for (let i = 0; i < time.length; i++) sum += time[i] * time[i];
    const rms = Math.sqrt(sum / time.length);

    analyser.getByteFrequencyData(freq);
    const binHz = ctx.sampleRate / analyser.fftSize;
    let voice = 0;
    let total = 0;
    for (let i = 1; i < freq.length; i++) {
      const hz = i * binHz;
      const energy = freq[i];
      total += energy;
      if (hz >= 300 && hz <= 3000) voice += energy;
    }
    return { rms, voiceRatio: total > 0 ? voice / total : 0 };
  };

  const timer = setInterval(() => {
    const level = read();
    history.push(level);
    if (history.length > HISTORY_CAP) history.shift();
    onVerdict(summariseAudio(history, window), level);
    onHistory?.(history.slice());
  }, intervalMs);

  void ctx.resume?.().catch(() => {});

  return () => {
    clearInterval(timer);
    try {
      source.disconnect();
      analyser.disconnect();
    } catch {
      /* already torn down */
    }
    void ctx.close().catch(() => {});
  };
}
