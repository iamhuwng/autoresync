export const STUDENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/u;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_DISPLAY_NAME_LENGTH = 80;
export const MAX_NAME_PART_LENGTH = 50;

export const RESERVED_STUDENT_IDS = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'teacher', 'student', 'superadmin',
]);

export const normalizeStudentId = (value: unknown): { display: string; normalized: string } | null => {
  if (typeof value !== 'string') return null;
  const display = value.trim().normalize('NFKC');
  if (!STUDENT_ID_PATTERN.test(display) || RESERVED_STUDENT_IDS.has(display.toLowerCase())) return null;
  return { display, normalized: display.toLowerCase() };
};

export const normalizeRegistrationEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email) ? email : null;
};

export const normalizeNamePart = (value: unknown): string => (
  typeof value === 'string' ? value.trim().slice(0, MAX_NAME_PART_LENGTH) : ''
);

export const normalizeDisplayName = (value: unknown): string => (
  typeof value === 'string' ? value.trim().slice(0, MAX_DISPLAY_NAME_LENGTH) : ''
);

export const isValidRegistrationPassword = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length >= MIN_PASSWORD_LENGTH
  && value.length <= MAX_PASSWORD_LENGTH
);
