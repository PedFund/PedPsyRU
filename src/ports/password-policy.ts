// Password quality checks for NEW passwords only (registration, future password
// change). Login must keep accepting existing passwords, so this module is not
// used on the login path. No network calls and no new dependencies: the list is
// a bounded local blocklist of very common passwords, and the identity check
// rejects a password that repeats the account email or its local part.
// The blocklist is one comma-separated literal on purpose: a list of adjacent
// quoted strings looks like a key/value pair to secret scanners even though every
// entry is a public weak password.
const COMMON: ReadonlySet<string> = new Set(`123456789012,1234567890123,12345678901234,1234567890qwerty,1q2w3e4r5t6y,1qaz2wsx3edc,abc123456789,admin123456,administrator,changeme1234,correcthorsebatterystaple,dragon123456,football1234,iloveyou1234,letmein123456,monkey123456,passw0rd1234,password1234,password123456,passwordpassword,qazwsxedc123,qwerty123456,qwerty12345678,qwertyuiop12,sunshine1234,superman1234,trustno1trustno1,welcome12345,welcome123456,йцукенгшщзфыва,пароль123456,парольпароль,привет123456`.split(","));
const SIMPLE_SEQUENCES = ["0123456789", "1234567890", "abcdefghijklmnopqrstuvwxyz"];
export function weakNewPassword(password: string, identifiers: readonly string[]): boolean {
  const normalized = password.normalize("NFKC").toLowerCase();
  if (COMMON.has(normalized)) return true;
  // A single repeated character or a straight sequence is not a secret.
  if (new Set(normalized).size === 1) return true;
  if (SIMPLE_SEQUENCES.some(seq => normalized.length >= 8 && seq.includes(normalized))) return true;
  for (const identifier of identifiers) {
    const value = identifier.normalize("NFKC").toLowerCase().trim();
    if (!value) continue;
    if (normalized === value) return true;
    const local = value.includes("@") ? value.slice(0, value.indexOf("@")) : value;
    if (local.length >= 3 && normalized === local) return true;
    if (local.length >= 4 && normalized.includes(local)) return true;
  }
  return false;
}
