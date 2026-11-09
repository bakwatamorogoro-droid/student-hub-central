import test from "node:test";
import assert from "node:assert/strict";
import {
  isPlayableLessonLink,
  lessonLinkHint,
  parseLessonLink,
  youtubeThumbnail,
} from "./elesson.ts";

test("a youtu.be short link yields the video id", () => {
  const p = parseLessonLink("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(p?.provider, "youtube");
  assert.equal(p?.videoId, "dQw4w9WgXcQ");
});

test("a watch link with a playlist keeps the video and drops the list", () => {
  const p = parseLessonLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=4");
  assert.equal(p?.videoId, "dQw4w9WgXcQ");
  assert.ok(!p?.embedUrl.includes("PL123"));
});

test("a mobile youtube link is accepted", () => {
  const p = parseLessonLink("https://m.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(p?.provider, "youtube");
  assert.equal(p?.videoId, "dQw4w9WgXcQ");
});

test("a shorts link is accepted", () => {
  const p = parseLessonLink("https://www.youtube.com/shorts/dQw4w9WgXcQ");
  assert.equal(p?.videoId, "dQw4w9WgXcQ");
});

test("an embed link is accepted", () => {
  const p = parseLessonLink("https://www.youtube.com/embed/dQw4w9WgXcQ");
  assert.equal(p?.videoId, "dQw4w9WgXcQ");
});

test("the YouTube embed uses nocookie and plays inline", () => {
  const p = parseLessonLink("https://youtu.be/dQw4w9WgXcQ");
  assert.ok(p?.embedUrl.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"));
  assert.ok(p?.embedUrl.includes("playsinline=1"));
});

test("the YouTube thumbnail is the one that always exists", () => {
  const p = parseLessonLink("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(p?.thumbnailUrl, youtubeThumbnail("dQw4w9WgXcQ"));
  assert.ok(p?.thumbnailUrl.includes("hqdefault.jpg"));
});

test("a YouTube link with no id is refused", () => {
  assert.equal(parseLessonLink("https://www.youtube.com/watch?v=tooshort"), null);
  assert.equal(parseLessonLink("https://www.youtube.com/"), null);
});

test("a TikTok video link yields the numeric id", () => {
  const p = parseLessonLink("https://www.tiktok.com/@scout2015/video/6718335390845095173");
  assert.equal(p?.provider, "tiktok");
  assert.equal(p?.videoId, "6718335390845095173");
});

test("a TikTok link with tracking query still parses", () => {
  const p = parseLessonLink(
    "https://www.tiktok.com/@scout2015/video/6718335390845095173?is_from_webapp=1&sender_device=pc",
  );
  assert.equal(p?.videoId, "6718335390845095173");
});

test("the TikTok embed points at the player", () => {
  const p = parseLessonLink("https://www.tiktok.com/@scout2015/video/6718335390845095173");
  assert.ok(p?.embedUrl.startsWith("https://www.tiktok.com/player/v1/6718335390845095173"));
});

test("a Facebook watch link yields the video id", () => {
  const p = parseLessonLink("https://www.facebook.com/watch/?v=10153231379946729");
  assert.equal(p?.provider, "facebook");
  assert.equal(p?.videoId, "10153231379946729");
});

test("a Facebook videos path yields the video id", () => {
  const p = parseLessonLink("https://www.facebook.com/somepage/videos/10153231379946729/");
  assert.equal(p?.videoId, "10153231379946729");
});

test("the Facebook embed encodes the original link", () => {
  const p = parseLessonLink("https://www.facebook.com/watch/?v=10153231379946729");
  assert.ok(p?.embedUrl.includes("plugins/video.php"));
  assert.ok(
    p?.embedUrl.includes(encodeURIComponent("https://www.facebook.com/watch/?v=10153231379946729")),
  );
});

test("a host that merely mentions youtube is refused", () => {
  assert.equal(parseLessonLink("https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseLessonLink("https://notyoutube.com/watch?v=dQw4w9WgXcQ"), null);
});

test("a bare domain without a video is refused", () => {
  assert.equal(parseLessonLink("https://www.youtube.com"), null);
  assert.equal(parseLessonLink("not a link"), null);
  assert.equal(parseLessonLink(""), null);
});

test("a link pasted without a scheme still parses", () => {
  const p = parseLessonLink("youtu.be/dQw4w9WgXcQ");
  assert.equal(p?.videoId, "dQw4w9WgXcQ");
});

test("isPlayableLessonLink agrees with parseLessonLink", () => {
  assert.equal(isPlayableLessonLink("https://youtu.be/dQw4w9WgXcQ"), true);
  assert.equal(isPlayableLessonLink("https://example.com/video/1"), false);
});

test("the hint names the provider that failed", () => {
  assert.ok(lessonLinkHint("https://www.tiktok.com/@user").toLowerCase().includes("tiktok"));
  assert.ok(lessonLinkHint("https://www.youtube.com/").toLowerCase().includes("youtube"));
  assert.ok(lessonLinkHint("https://vimeo.com/123").toLowerCase().includes("youtube"));
  assert.equal(lessonLinkHint(""), "");
});
