import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Compared against when the email doesn't exist, so "no such user" and
// "wrong password" take the same time. Generated once per process.
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= bcrypt.hash("settlestay-timing-equalizer", ROUNDS);
  return dummy;
}
