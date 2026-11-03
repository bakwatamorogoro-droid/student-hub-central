import { storageGet, storageSet } from "@/lib/safe-storage";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = storageGet("exam_device_id");
  if (!id) {
    const nav = window.navigator;
    const fp = [
      nav.userAgent,
      nav.language,
      screen.width + "x" + screen.height,
      new Date().getTimezoneOffset(),
      nav.hardwareConcurrency || "",
      // @ts-ignore
      nav.deviceMemory || "",
    ].join("|");
    let hash = 0;
    for (let i = 0; i < fp.length; i++) hash = ((hash << 5) - hash + fp.charCodeAt(i)) | 0;
    id = "dev-" + Math.abs(hash).toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    storageSet("exam_device_id", id);
  }
  return id;
}
