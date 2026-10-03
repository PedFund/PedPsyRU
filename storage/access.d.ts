export const SCRYPT: {N: number; r: number; p: number; maxmem: number};
export const SCHEME: string;
export function derive(password: string, salt: Buffer, length: number, options: typeof SCRYPT): Promise<Buffer>;
export function validLogin(value: unknown): value is string;
export function validPassword(value: unknown): value is string;
export function validToken(value: unknown): value is string;
export function csrfFor(token: string): string;
export function equalText(a: unknown, b: unknown): boolean;
