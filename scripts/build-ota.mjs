// Ilova uchun "orqa fonda yangilanish" fayllari (OTA). `vite build` dan keyin ishga tushadi.
//   dist/ota/bundle-<id>.zip  — saytning butun build'i (ilova uni yuklab olib, keyingi ochilishda ishlatadi)
//   dist/ota/latest.json      — oxirgi versiya, fayl manzili, sha256, kerakli eng kichik APK raqami
// Faqat Netlify build'ida ishlaydi (ilova shu saytdan yangilanadi). Boshqa joyda: FORCE_OTA=1.
// Tashqi kutubxonasiz: ZIP Node'ning o'zidagi zlib bilan yoziladi.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { deflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { buildId } from "./build-id.mjs";

if (process.env.NETLIFY !== "true" && process.env.FORCE_OTA !== "1") {
  console.log("build-ota: Netlify emas — o'tkazib yuborildi (FORCE_OTA=1 bilan majburlash mumkin).");
  process.exit(0);
}

const DIST = "dist";
const OUT = join(DIST, "ota");
rmSync(OUT, { recursive: true, force: true });

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;                 // yashirin fayllar zip'ni buzadi
    const p = join(dir, name);
    if (p === OUT) continue;
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(DIST);
if (!files.some((f) => relative(DIST, f) === "index.html")) {
  console.error("build-ota: dist/index.html topilmadi");
  process.exit(1);
}

// CRC-32 (ZIP talab qiladi)
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const local = [], central = [];
let offset = 0;
const DOS_TIME = 0, DOS_DATE = (2020 - 1980) << 9 | 1 << 5 | 1;   // qat'iy sana: bir xil build -> bir xil zip
for (const file of files.sort()) {
  const name = Buffer.from(relative(DIST, file).split(sep).join("/"), "utf8");
  const data = readFileSync(file);
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
  h.writeUInt16LE(DOS_TIME, 10); h.writeUInt16LE(DOS_DATE, 12); h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
  local.push(h, name, comp);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
  c.writeUInt16LE(DOS_TIME, 12); c.writeUInt16LE(DOS_DATE, 14); c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28);
  c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += h.length + name.length + comp.length;
}
const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...local, centralBuf, end]);

const id = buildId();
let minApk = 0;
try { minApk = Number(JSON.parse(readFileSync("ota.config.json", "utf8")).min_apk_build) || 0; } catch { /* default 0 */ }

mkdirSync(OUT, { recursive: true });
const zipName = `bundle-${id}.zip`;
writeFileSync(join(OUT, zipName), zip);
const latest = {
  version: id,
  url: `/ota/${zipName}`,
  sha256: createHash("sha256").update(zip).digest("hex"),
  size: zip.length,
  files: files.length,
  min_apk_build: minApk,
  built_at: new Date().toISOString(),
};
writeFileSync(join(OUT, "latest.json"), JSON.stringify(latest, null, 2));
console.log(`build-ota: ${zipName} (${(zip.length / 1024 / 1024).toFixed(2)} MB, ${files.length} fayl), min_apk_build=${minApk}`);
