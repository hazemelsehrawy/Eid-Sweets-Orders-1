/**
 * INJ-02: Hardened CSV Cell Sanitizer against CSV / Formula Injection (CWE-1236)
 * Neutralizes Excel, LibreOffice, and Google Sheets DDE triggers (=, +, -, @, %, |, tab, CR)
 */
export const sanitizeCsvCell = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return '""';

  // 1. Convert to string, strip null bytes and non-printable control characters
  let text = String(val)
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .trim();

  // 2. Neutralize leading formula triggers: =, +, -, @, %, |, tab, single-quote
  if (/^[=+\-@%|'\t]/.test(text)) {
    text = `'${text}`;
  }

  // 3. Double up existing quotes and enclose cell in quotes
  return `"${text.replaceAll('"', '""')}"`;
};
