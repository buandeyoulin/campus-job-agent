const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const CN_PHONE = /(?<!\d)(?:\+?86[ -]?)?1[3-9](?:[ -]?\d){9}(?!\d)/g;
const CN_ID = /(?<!\d)\d{17}[\dXx](?!\d)/g;

export function redactResumeText(text: string): string {
  return text
    .replace(EMAIL, "[REDACTED_EMAIL]")
    .replace(CN_PHONE, "[REDACTED_PHONE]")
    .replace(CN_ID, "[REDACTED_ID]");
}
