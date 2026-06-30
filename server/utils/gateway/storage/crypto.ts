import {
  argon2Sync,
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ENCRYPTION_VERSION = "v1";
const PASSWORD_VERSION = "argon2id";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = argon2Sync("argon2id", {
    message: Buffer.from(password),
    nonce: salt,
    tagLength: 32,
    memory: 64 * 1024,
    passes: 3,
    parallelism: 1,
  });
  return `${PASSWORD_VERSION}$${salt.toString("base64url")}$${Buffer.from(hash).toString("base64url")}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [version, saltText, hashText] = storedHash.split("$");
  if (version !== PASSWORD_VERSION || !saltText || !hashText) {
    return false;
  }
  const expected = Buffer.from(hashText, "base64url");
  const actual = Buffer.from(
    argon2Sync("argon2id", {
      message: Buffer.from(password),
      nonce: Buffer.from(saltText, "base64url"),
      tagLength: 32,
      memory: 64 * 1024,
      passes: 3,
      parallelism: 1,
    }),
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function encryptJson(value: unknown) {
  const key = configEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join("$");
}

export function decryptJson<T>(encrypted: string): T {
  const [version, ivText, tagText, ciphertextText] = encrypted.split("$");
  if (version !== ENCRYPTION_VERSION || !ivText || !tagText || !ciphertextText) {
    throw new Error("Invalid encrypted config format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    configEncryptionKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

function configEncryptionKey() {
  const secret = process.env.CODEX_GATEWAY_CONFIG_SECRET || "";
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("CODEX_GATEWAY_CONFIG_SECRET is required in production");
  }
  return createHash("sha256")
    .update(secret || "codex-gateway-development-secret")
    .digest();
}
