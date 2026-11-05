// Apple Wallet passes (.pkpass): the pass files, their SHA-1 manifest, a detached PKCS#7 signature
// made with the Pass Type ID certificate, and a plain (stored) zip around them.
// Runs on the Workers runtime: the RSA signature uses WebCrypto; the small DER and zip writers are here
// so no large library is needed.

/** Bytes backed by a plain ArrayBuffer (what WebCrypto and Response take). */
export type Bytes = Uint8Array<ArrayBuffer>;

const enc = new TextEncoder();

// ---- DER ----

function len(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  while (n > 0) {
    out.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | out.length, ...out];
}

function tlv(tag: number, ...parts: Bytes[]): Bytes {
  const body = concat(parts);
  return concat([new Uint8Array([tag, ...len(body.length)]), body]);
}

export function concat(parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const seq = (...p: Bytes[]) => tlv(0x30, ...p);
const set = (...p: Bytes[]) => tlv(0x31, ...p);
const NULL = new Uint8Array([0x05, 0x00]);

function oid(dotted: string): Bytes {
  const [a, b, ...rest] = dotted.split(".").map(Number);
  const bytes = [40 * a + b];
  for (const n of rest) {
    const chunk: number[] = [n & 0x7f];
    let v = n >> 7;
    while (v > 0) {
      chunk.unshift(0x80 | (v & 0x7f));
      v >>= 7;
    }
    bytes.push(...chunk);
  }
  return tlv(0x06, new Uint8Array(bytes));
}

const OID = {
  data: "1.2.840.113549.1.7.1",
  signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingTime: "1.2.840.113549.1.9.5",
  sha256: "2.16.840.1.101.3.4.2.1",
  rsa: "1.2.840.113549.1.1.1",
};

/** Reads one TLV at `at`: where its value starts and ends. */
function readTlv(der: Bytes, at: number): { tag: number; start: number; end: number; next: number } {
  const tag = der[at];
  let l = der[at + 1];
  let start = at + 2;
  if (l & 0x80) {
    const n = l & 0x7f;
    l = 0;
    for (let i = 0; i < n; i++) l = (l << 8) | der[at + 2 + i];
    start += n;
  }
  return { tag, start, end: start + l, next: start + l };
}

/** The issuer Name and serial number of an X.509 certificate, as DER, for the signer's IssuerAndSerialNumber. */
export function issuerAndSerial(certDer: Bytes): Bytes {
  const cert = readTlv(certDer, 0);
  const tbs = readTlv(certDer, cert.start);
  let at = tbs.start;
  let field = readTlv(certDer, at);
  if (field.tag === 0xa0) {
    at = field.next; // explicit version
    field = readTlv(certDer, at);
  }
  const serial = certDer.slice(at, field.next);
  const alg = readTlv(certDer, field.next);
  const issuer = readTlv(certDer, alg.next);
  return seq(certDer.slice(alg.next, issuer.next), serial);
}

export function pemToDer(pem: string): Bytes {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utcTime(d: Date): Bytes {
  const p = (n: number) => String(n).padStart(2, "0");
  const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return tlv(0x17, enc.encode(s));
}

/** DER SET OF: members sorted by their encoding. */
function sortedSet(members: Bytes[]): Bytes[] {
  return [...members].sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });
}

async function sha(algo: "SHA-1" | "SHA-256", data: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest(algo, data));
}

export type PassSigner = { certPem: string; keyPem: string; wwdrPem: string };

/** Detached PKCS#7 (CMS SignedData) signature of `content`, as Apple Wallet expects for manifest.json. */
export async function signDetached(content: Bytes, signer: PassSigner, now = new Date()): Promise<Bytes> {
  const cert = pemToDer(signer.certPem);
  const wwdr = pemToDer(signer.wwdrPem);
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(signer.keyPem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const attrs = sortedSet([
    seq(oid(OID.contentType), set(oid(OID.data))),
    seq(oid(OID.signingTime), set(utcTime(now))),
    seq(oid(OID.messageDigest), set(tlv(0x04, await sha("SHA-256", content)))),
  ]);
  // The signature covers the attributes encoded as a SET; inside SignerInfo they are tagged [0].
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, set(...attrs)));
  const sha256Alg = seq(oid(OID.sha256), NULL);
  const signerInfo = seq(
    tlv(0x02, new Uint8Array([1])),
    issuerAndSerial(cert),
    sha256Alg,
    tlv(0xa0, ...attrs),
    seq(oid(OID.rsa), NULL),
    tlv(0x04, signature),
  );
  const signedData = seq(
    tlv(0x02, new Uint8Array([1])),
    set(sha256Alg),
    seq(oid(OID.data)),
    tlv(0xa0, cert, wwdr),
    set(signerInfo),
  );
  return seq(oid(OID.signedData), tlv(0xa0, signedData));
}

// ---- Zip (stored, no compression) ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Bytes): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files: { name: string; data: Bytes }[]): Bytes {
  const local: Bytes[] = [];
  const central: Bytes[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true); // UTF-8 names
    head.setUint16(8, 0, true); // stored
    head.setUint32(14, crc, true);
    head.setUint32(18, f.data.length, true);
    head.setUint32(22, f.data.length, true);
    head.setUint16(26, name.length, true);
    local.push(new Uint8Array(head.buffer), name, f.data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, f.data.length, true);
    dir.setUint32(24, f.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const dirBytes = concat(central);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, dirBytes.length, true);
  end.setUint32(16, offset, true);
  return concat([...local, dirBytes, new Uint8Array(end.buffer)]);
}

// ---- The pass package ----

const hex = (b: Bytes) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** pass.json + images → a signed .pkpass. `files` maps file names (e.g. "icon.png") to their bytes. */
export async function buildPkpass(pass: Record<string, unknown>, files: Record<string, Bytes>, signer: PassSigner): Promise<Bytes> {
  const all: Record<string, Bytes> = { "pass.json": enc.encode(JSON.stringify(pass)), ...files };
  const manifest: Record<string, string> = {};
  for (const [name, data] of Object.entries(all)) manifest[name] = hex(await sha("SHA-1", data));
  const manifestBytes = enc.encode(JSON.stringify(manifest));
  const signature = await signDetached(manifestBytes, signer);
  return zip([...Object.entries(all).map(([name, data]) => ({ name, data })), { name: "manifest.json", data: manifestBytes }, { name: "signature", data: signature }]);
}

/** "#7558E8" → "rgb(117, 88, 232)", the colour format pass.json takes. */
export function rgb(hexColor: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hexColor);
  if (!m) return "rgb(30, 27, 46)";
  return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
}
