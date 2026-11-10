import assert from "node:assert/strict";
import { test } from "node:test";
import { extensionOf, isUsableContentType, uploadContentType } from "./uploadContentType.ts";

test("a specific declared type wins", () => {
  assert.equal(uploadContentType({ name: "photo.png", type: "image/png" }), "image/png");
  assert.equal(uploadContentType({ name: "a.bin", type: "image/jpeg" }), "image/jpeg");
});

test("octet-stream is treated as unknown, not as a choice", () => {
  assert.equal(
    uploadContentType({ name: "photo.png", type: "application/octet-stream" }),
    "image/png",
  );
  assert.equal(
    uploadContentType({ name: "scan.PDF", type: "application/octet-stream" }),
    "application/pdf",
  );
});

test("an empty or missing type falls back to the extension", () => {
  assert.equal(uploadContentType({ name: "photo.png", type: "" }), "image/png");
  assert.equal(uploadContentType({ name: "photo.png" }), "image/png");
  assert.equal(uploadContentType({ name: "IMG_1234.JPEG" }), "image/jpeg");
  assert.equal(uploadContentType({ name: "clip.mp4" }), "video/mp4");
  assert.equal(
    uploadContentType({ name: "notes.docx" }),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
});

test("an unknown extension still yields a non-empty type", () => {
  assert.equal(uploadContentType({ name: "mystery.zzz" }), "application/octet-stream");
  assert.equal(uploadContentType({ name: "noextension" }), "application/octet-stream");
});

test("extension parsing handles paths, queries and dotfiles", () => {
  assert.equal(extensionOf("a/b/c/photo.png"), "png");
  assert.equal(extensionOf("C:\\temp\\photo.JPG"), "jpg");
  assert.equal(extensionOf("photo.png?x=1"), "png");
  assert.equal(extensionOf(".gitignore"), "");
  assert.equal(extensionOf("trailing."), "");
  assert.equal(extensionOf("plain"), "");
});

test("isUsableContentType rejects the generic types", () => {
  assert.equal(isUsableContentType("image/png"), true);
  assert.equal(isUsableContentType("application/pdf"), true);
  assert.equal(isUsableContentType("application/octet-stream"), false);
  assert.equal(isUsableContentType(""), false);
  assert.equal(isUsableContentType(null), false);
  assert.equal(isUsableContentType(undefined), false);
  assert.equal(isUsableContentType("  "), false);
});
