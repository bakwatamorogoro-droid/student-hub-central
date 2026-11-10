import assert from "node:assert/strict";
import test from "node:test";

import { judgeAudio, summariseAudio, talkingShare, type AudioLevel } from "./proctorAudio.ts";

const quiet: AudioLevel = { rms: 0.003, voiceRatio: 0.2 };
const fan: AudioLevel = { rms: 0.02, voiceRatio: 0.3 };
const speech: AudioLevel = { rms: 0.09, voiceRatio: 0.7 };
const loudNoise: AudioLevel = { rms: 0.09, voiceRatio: 0.2 };

test("judgeAudio calls a silent room quiet", () => {
  assert.equal(judgeAudio(quiet), "quiet");
});

test("judgeAudio calls a loud but broadband room noisy, not talking", () => {
  // A fan or an air conditioner is loud but spread across the spectrum. Calling
  // this "talking" would accuse a student of a conversation with their desk fan.
  assert.equal(judgeAudio(fan), "noisy");
  assert.equal(judgeAudio(loudNoise), "noisy");
});

test("judgeAudio calls loud speech concentrated in the voice band talking", () => {
  assert.equal(judgeAudio(speech), "talking");
});

test("summariseAudio stays quiet until the window fills", () => {
  // One reading is not a verdict: the window exists so a cough does not report.
  assert.equal(summariseAudio([speech], 3), "quiet");
  assert.equal(summariseAudio([speech, speech], 3), "quiet");
});

test("summariseAudio reports talking when the window contains speech", () => {
  assert.equal(summariseAudio([quiet, speech, quiet], 3), "talking");
});

test("summariseAudio reports noisy when the window has noise but no speech", () => {
  assert.equal(summariseAudio([quiet, fan, quiet], 3), "noisy");
});

test("summariseAudio only looks at the most recent window", () => {
  // Speech long ago, silence since: the current verdict must be quiet, or the
  // teacher would see a warning that never clears.
  assert.equal(summariseAudio([speech, speech, speech, quiet, quiet, quiet], 3), "quiet");
});

test("talkingShare measures the proportion of the window that was speech", () => {
  assert.equal(talkingShare([]), 0);
  assert.equal(talkingShare([speech, speech, quiet, quiet]), 0.5);
  assert.equal(talkingShare([quiet, quiet]), 0);
});
