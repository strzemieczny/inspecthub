/** Clean human-authored text without changing case, punctuation or joiners in emoji. */
export function normalizeText(value: string, multiline = false): string {
  const text = value
    .normalize('NFC')
    // Copy/paste artifacts: soft hyphen, zero-width space, direction marks and BOM.
    .replace(
      /[\u00ad\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/gu,
      '',
    )
    .replace(/\r\n?|[\u0085\u2028\u2029]/gu, '\n')
    .replace(/\p{Cc}/gu, (character) =>
      /\s/u.test(character) ? character : '',
    );

  if (!multiline) return text.replace(/\s+/gu, ' ').trim();
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}
