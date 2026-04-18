const BLOCKED_PATTERNS = [
  /ignore\s+all\s+previous\s+instructions/gi,
  /system\s*:\s*/gi,
  /developer\s*:\s*/gi
];

export function sanitizeInterviewText(input: string): string {
  let sanitized = input.trim();
  for (const pattern of BLOCKED_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  return sanitized.replace(/\s+/g, ' ').trim();
}
