import test from "node:test";
import assert from "node:assert/strict";
import { hasContent, liveNews, type AnnouncementRow } from "./news.ts";

const NOW = new Date("2026-10-27T12:00:00Z").getTime();

function row(over: Partial<AnnouncementRow> = {}): AnnouncementRow {
  return {
    id: "a1",
    title: "Tangazo",
    message: "Habari",
    pdf_url: null,
    created_at: "2026-10-01T00:00:00Z",
    expires_at: null,
    active: true,
    ...over,
  };
}

test("an active, unexpired notice is live", () => {
  const out = liveNews([row()], NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].message, "Habari");
});

test("an inactive notice is hidden", () => {
  assert.equal(liveNews([row({ active: false })], NOW).length, 0);
});

test("an expired notice is hidden", () => {
  assert.equal(liveNews([row({ expires_at: "2026-10-26T00:00:00Z" })], NOW).length, 0);
});

test("a notice expiring later is still shown", () => {
  assert.equal(liveNews([row({ expires_at: "2026-10-28T00:00:00Z" })], NOW).length, 1);
});

test("newest first", () => {
  const out = liveNews(
    [
      row({ id: "old", created_at: "2026-10-01T00:00:00Z" }),
      row({ id: "new", created_at: "2026-10-20T00:00:00Z" }),
    ],
    NOW,
  );
  assert.deepEqual(
    out.map((i) => i.id),
    ["new", "old"],
  );
});

test("a missing image_url column does not break the read", () => {
  const out = liveNews([row()], NOW);
  assert.equal(out[0].imageUrl, null);
});

test("the pdf url survives", () => {
  const out = liveNews([row({ pdf_url: "https://x/y.pdf" })], NOW);
  assert.equal(out[0].pdfUrl, "https://x/y.pdf");
});

test("nothing at all is not an error", () => {
  assert.deepEqual(liveNews(null, NOW), []);
  assert.deepEqual(liveNews(undefined, NOW), []);
  assert.deepEqual(liveNews([], NOW), []);
});

test("a notice with only a PDF still counts as content", () => {
  const item = liveNews([row({ message: "", title: null, pdf_url: "https://x/y.pdf" })], NOW)[0];
  assert.equal(hasContent(item), true);
});

test("a notice with nothing in it is dropped", () => {
  const item = liveNews([row({ message: "  ", title: null })], NOW)[0];
  assert.equal(hasContent(item), false);
});
