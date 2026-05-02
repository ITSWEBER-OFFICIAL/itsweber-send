import { createHmac, randomBytes } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let result = '';
  let bits = 0;
  let val = 0;
  for (const byte of buf) {
    val = (val << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32[(val << (5 - bits)) & 31];
  return result;
}

function base32Decode(str: string): Buffer {
  const s = str.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let val = 0;
  const bytes: number[] = [];
  for (const ch of s) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base32 character: ${ch}`);
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function getTotpUri(secret: string, email: string, issuer = 'ITSWEBER Send'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = `secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return `otpauth://totp/${label}?${params}`;
}

export function verifyTotp(secret: string, code: string): boolean {
  let secretBuf: Buffer;
  try {
    secretBuf = base32Decode(secret);
  } catch {
    return false;
  }
  const cleaned = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;

  const t = Math.floor(Date.now() / 1000 / 30);
  for (const offset of [0, -1, 1]) {
    const counter = t + offset;
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeUInt32BE(0, 0);
    counterBuf.writeUInt32BE(counter >>> 0, 4);
    const hmac = createHmac('sha1', secretBuf).update(counterBuf).digest();
    const off = (hmac[hmac.length - 1] ?? 0) & 0xf;
    const otp = (
      ((hmac[off]! & 0x7f) << 24) |
      ((hmac[off + 1]! & 0xff) << 16) |
      ((hmac[off + 2]! & 0xff) << 8) |
      (hmac[off + 3]! & 0xff)
    ) % 1_000_000;
    if (String(otp).padStart(6, '0') === cleaned) return true;
  }
  return false;
}
