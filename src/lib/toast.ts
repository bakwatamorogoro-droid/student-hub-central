import Swal from "sweetalert2";

/**
 * Drop-in replacement for the toast helper, rendered with SweetAlert2 so every
 * message in the app shares one look. These use SweetAlert's `toast` mode:
 * they stack in the corner and auto-dismiss, so a notification never blocks the
 * student, while the blocking confirmations live in `@/lib/alerts`.
 */
const Toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3200,
  timerProgressBar: true,
  customClass: { popup: "rounded-xl" },
  didOpen: (el) => {
    // Let the reader keep a long message on screen by hovering it.
    el.addEventListener("mouseenter", Swal.stopTimer);
    el.addEventListener("mouseleave", Swal.resumeTimer);
  },
});

type ToastKind = "success" | "error" | "info" | "warning";

type ToastOptions = { duration?: number };

function show(kind: ToastKind, message: string, opts?: ToastOptions) {
  void Toast.fire({ icon: kind, title: message, timer: opts?.duration ?? 3200 });
}

export const toast = {
  success: (message: string, opts?: ToastOptions) => show("success", message, opts),
  error: (message: string, opts?: ToastOptions) => show("error", message, opts),
  info: (message: string, opts?: ToastOptions) => show("info", message, opts),
  warning: (message: string, opts?: ToastOptions) => show("warning", message, opts),
  message: (message: string, opts?: ToastOptions) => show("info", message, opts),
};

export type Toast = typeof toast;
