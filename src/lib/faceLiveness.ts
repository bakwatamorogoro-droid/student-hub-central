/**
 * The face step of attendance: proving a live student is standing there, not a
 * photograph of one.
 *
 * This is a *liveness* check, not face recognition, and the distinction is the
 * whole design. The app has no photo of the student to compare against and never
 * will — storing a classroom of minors' faces to make "recognition" literal
 * would be a worse problem than the one it solves. What it can do is require a
 * sequence of movements that a still image cannot perform: be centred, come
 * closer, then turn. A printed photo held to the lens fails the second step.
 *
 * Two engines, because the browser support is split:
 *
 *   `FaceDetector` (Chromium only) gives a bounding box per face, which is
 *   enough to judge all three movements. Chrome, Edge and Android Chrome take
 *   this path.
 *
 *   Firefox and Safari have no detector, so `proctoring.ts`'s frame statistics
 *   stand in: brightness and contrast prove the lens is uncovered and something
 *   is in front of it, and motion proves it is alive. That is a weaker claim and
 *   `faceCheckSupport()` reports which one is in play, so the UI says what it is
 *   actually checking instead of implying more than it can deliver. A check that
 *   silently does nothing would be worse than no check.
 *
 * No frame is stored and no image leaves the device on either path.
 */

import { frameStats, type FrameStats } from "./proctoring.ts";
import type { DetectedFace } from "./proctorFaces.ts";

/** Which engine this browser will use, or none when there is no camera at all. */
export type FaceCheckSupport = "face_detector" | "motion_only" | "none";

export function faceCheckSupport(): FaceCheckSupport {
  if (typeof window === "undefined") return "none";
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "none";
  return "FaceDetector" in window ? "face_detector" : "motion_only";
}

/** One face's position and size, as fractions of the frame. */
export type FaceReading = {
  count: number;
  /** Face centre, 0–1 across the frame. Null when no face is visible. */
  cx: number | null;
  cy: number | null;
  /** Face width as a fraction of the frame width. Null when no face is visible. */
  width: number | null;
};

export const NO_FACE: FaceReading = { count: 0, cx: null, cy: null, width: null };

/** Reduces a detector result to the numbers the challenges care about. */
export function readFaces(
  faces: DetectedFace[],
  frame: { width: number; height: number },
): FaceReading {
  if (faces.length === 0) return NO_FACE;
  // The largest face is the student: someone in the background must not become
  // the subject of the check, and the nearest face is the one holding the phone.
  let biggest = faces[0].boundingBox;
  for (const f of faces) {
    if (f.boundingBox.width * f.boundingBox.height > biggest.width * biggest.height) {
      biggest = f.boundingBox;
    }
  }
  if (frame.width <= 0 || frame.height <= 0) return { ...NO_FACE, count: faces.length };
  return {
    count: faces.length,
    cx: (biggest.x + biggest.width / 2) / frame.width,
    cy: (biggest.y + biggest.height / 2) / frame.height,
    width: biggest.width / frame.width,
  };
}

// ---------------------------------------------------------------
// The movements
// ---------------------------------------------------------------

/**
 * The sequence a student performs.
 *
 * `closer` and `turn` are the load-bearing ones. Both are measured against a
 * baseline taken on the first step, so they test that the face *changed* in
 * response to an instruction — which is exactly what a still photograph cannot
 * do, and why this is worth asking for.
 */
export type FaceChallenge = "centred" | "closer" | "turn";

export const FACE_CHALLENGES: FaceChallenge[] = ["centred", "closer", "turn"];

/** A face this far off centre is not "looking at the camera". */
const CENTRED_TOLERANCE_X = 0.2;
const CENTRED_TOLERANCE_Y = 0.24;
/** A face narrower than this fraction of the frame is too far away to judge. */
const MIN_FACE_WIDTH = 0.14;
/** How much the face must grow to count as having come closer. */
const CLOSER_GROWTH = 0.18;
/** How far the face centre must travel to count as a turn. */
const TURN_TRAVEL = 0.1;

/**
 * Judges one movement.
 *
 * `baseline` is the reading from the `centred` step, and is what `closer` and
 * `turn` are measured against. Passing it as an argument rather than holding it
 * in module state keeps the whole judgement pure and testable.
 */
export function challengeSatisfied(
  challenge: FaceChallenge,
  reading: FaceReading,
  baseline: FaceReading | null,
): boolean {
  // Two faces never satisfy any step: whoever the second person is, this is the
  // one check where their presence has to stop the flow.
  if (reading.count !== 1) return false;
  if (reading.cx == null || reading.cy == null || reading.width == null) return false;

  switch (challenge) {
    case "centred":
      return (
        Math.abs(reading.cx - 0.5) <= CENTRED_TOLERANCE_X &&
        Math.abs(reading.cy - 0.5) <= CENTRED_TOLERANCE_Y &&
        reading.width >= MIN_FACE_WIDTH
      );
    case "closer":
      if (!baseline || baseline.width == null) return false;
      return reading.width >= baseline.width * (1 + CLOSER_GROWTH);
    case "turn":
      if (!baseline || baseline.cx == null) return false;
      return Math.abs(reading.cx - baseline.cx) >= TURN_TRAVEL;
  }
}

/**
 * Why a reading is not good enough, so the student can be told *what* to fix.
 *
 * The three movements need a face that is present, alone, close enough and in the
 * middle. When one of those is missing, "hold still and follow the instructions"
 * is the wrong thing to say — the student cannot see the camera, so they do not
 * know their face is out of frame or that a classmate has wandered in behind
 * them. Naming the fault is the whole point of this function; `FaceCheck` renders
 * the matching instruction.
 *
 * `too_far` is reported before `off_centre`: a face too small to measure is also
 * likely to be off centre, and "come closer" is the instruction that fixes both.
 */
export type FaceIssue = "none" | "absent" | "multiple" | "too_far" | "off_centre";

export function faceIssue(reading: FaceReading): FaceIssue {
  if (reading.count === 0) return "absent";
  if (reading.count > 1) return "multiple";
  if (reading.cx == null || reading.cy == null || reading.width == null) return "absent";
  if (reading.width < MIN_FACE_WIDTH) return "too_far";
  if (
    Math.abs(reading.cx - 0.5) > CENTRED_TOLERANCE_X ||
    Math.abs(reading.cy - 0.5) > CENTRED_TOLERANCE_Y
  ) {
    return "off_centre";
  }
  return "none";
}

// ---------------------------------------------------------------
// The fallback: frame statistics, no detector
// ---------------------------------------------------------------

/** A frame with less contrast than this is a covered lens or a blank wall. */
const MIN_CONTRAST = 8;
/** Darker than this is a lens with a finger over it. */
const MIN_BRIGHTNESS = 12;
/** Movement between frames that counts as a live subject rather than sensor noise. */
const MIN_MOTION = 1.5;

export type MotionChallenge = "in_frame" | "moved";

export const MOTION_CHALLENGES: MotionChallenge[] = ["in_frame", "moved"];

/** Whether something is actually in front of an uncovered lens. */
export function motionInFrame(stats: FrameStats): boolean {
  return stats.contrast >= MIN_CONTRAST && stats.brightness >= MIN_BRIGHTNESS;
}

/**
 * Whether the subject moved.
 *
 * `frameStats` measures motion against the previous frame's brightness, so a
 * student who holds still reads as zero. Two readings are required to agree
 * before the step passes, so a single noisy frame cannot carry it.
 */
export function motionMoved(samples: FrameStats[]): boolean {
  if (samples.length < 2) return false;
  return samples.filter((s) => s.motion >= MIN_MOTION).length >= 2;
}

export { frameStats };
export type { FrameStats };
