export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Spróbuj również, gdy przeglądarka odmawia dostępu do Clipboard API.
    }
  }

  // Fallback dla instalacji dostępnych przez HTTP w sieci lokalnej.
  const focusedElement = document.activeElement;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);

  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    if (!document.execCommand("copy")) {
      throw new Error("Nie udało się skopiować tekstu do schowka.");
    }
  } finally {
    textarea.remove();
    if (focusedElement instanceof HTMLElement) {
      focusedElement.focus({ preventScroll: true });
    }
  }
}
