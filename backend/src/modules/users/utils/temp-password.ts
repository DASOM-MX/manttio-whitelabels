import { customAlphabet } from 'nanoid';

// Temporary passwords (backend plan §1): always `tmp_` + 18 random characters.
// They're hand-relayed (no email flow), so the alphabet drops look-alikes
// (0/O, 1/l/I). nanoid's customAlphabet is CSPRNG-backed and unbiased.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const RANDOM_LENGTH = 18;

export const TEMP_PASSWORD_PREFIX = 'tmp_';

const randomPart = customAlphabet(ALPHABET, RANDOM_LENGTH);

export const generateTempPassword = (): string => TEMP_PASSWORD_PREFIX + randomPart();
