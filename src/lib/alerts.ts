import Swal from "sweetalert2";

/**
 * SweetAlert2 themed to the app's palette. The default stylesheet is imported
 * once here so every caller gets the same look without repeating the CSS.
 */
import "sweetalert2/dist/sweetalert2.min.css";

const themed = Swal.mixin({
  confirmButtonColor: "hsl(var(--primary))",
  cancelButtonColor: "hsl(var(--muted-foreground))",
  buttonsStyling: true,
  customClass: { popup: "rounded-2xl" },
});

export function alertSuccess(title: string, text?: string) {
  return themed.fire({
    icon: "success",
    title,
    text,
    confirmButtonText: "Sawa",
  });
}

export function alertError(title: string, text?: string) {
  return themed.fire({
    icon: "error",
    title,
    text,
    confirmButtonText: "Sawa",
  });
}

export function alertWarning(title: string, text?: string) {
  return themed.fire({
    icon: "warning",
    title,
    text,
    confirmButtonText: "Sawa",
  });
}

/** Resolves true when the user confirms the destructive action. */
export async function confirmAction(title: string, text?: string, confirmText = "Ndiyo, futa") {
  const res = await themed.fire({
    icon: "warning",
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Ghairi",
    reverseButtons: true,
  });
  return res.isConfirmed;
}

/** Single-field input dialog; resolves the trimmed value or null when cancelled. */
export async function promptText(
  title: string,
  placeholder?: string,
  inputValue = "",
): Promise<string | null> {
  const res = await themed.fire({
    title,
    input: "text",
    inputValue,
    inputPlaceholder: placeholder,
    showCancelButton: true,
    confirmButtonText: "Sawa",
    cancelButtonText: "Ghairi",
    reverseButtons: true,
  });
  const value = typeof res.value === "string" ? res.value.trim() : "";
  return res.isConfirmed && value ? value : null;
}
