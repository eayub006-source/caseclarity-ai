import bcrypt from "bcryptjs";

// Passwords are only ever stored as bcrypt hashes (cost 10). Plaintext
// passwords are never persisted in the database or localStorage.
export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
