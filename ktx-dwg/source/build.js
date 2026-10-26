const fs = require("fs"), path = require("path");
const P = "node_modules/pdfjs-dist/";
const b64 = f => fs.readFileSync(f).toString("base64");
const cmaps = {};
for (const n of fs.readdirSync(P + "cmaps")) if (/KSC|UniKS|Korea/.test(n)) cmaps[n.replace(".bcmap", "")] = b64(P + "cmaps/" + n);
const loader = `<script type="text/plain" id="pdfjs-lib">${b64(P + "legacy/build/pdf.min.mjs")}</script>
<script type="text/plain" id="pdfjs-worker">${b64(P + "legacy/build/pdf.worker.min.mjs")}</script>
<script>
"use strict";
const KR_CMAPS = ${JSON.stringify(cmaps)};
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let _pdfjs;
async function getPdfjs(){
  if (_pdfjs) return _pdfjs;
  const mk = id => URL.createObjectURL(new Blob([unb64(document.getElementById(id).textContent)], {type: "text/javascript"}));
  const lib = await import(mk("pdfjs-lib"));
  lib.GlobalWorkerOptions.workerSrc = mk("pdfjs-worker");
  class KRCMapFactory {
    constructor(){}
    async fetch({name}){
      if (!KR_CMAPS[name]) throw new Error("CMap 없음: " + name);
      return {cMapData: unb64(KR_CMAPS[name]), isCompressed: true};
    }
  }
  const gd = lib.getDocument;
  _pdfjs = {OPS: lib.OPS, getDocument: src => gd({...src, CMapReaderFactory: KRCMapFactory, cMapUrl: "kr/", cMapPacked: true, useWorkerFetch: false, isEvalSupported: false})};
  return _pdfjs;
}
</script>`;
const ocr = fs.readFileSync("src/ocr.js", "utf8");
const src = fs.readFileSync("src/app.html", "utf8").replace("<!--PDFJS-->", () => loader).replace("/*OCR_MODULE*/", () => ocr);
fs.mkdirSync("dist/pwa", {recursive: true});
fs.writeFileSync("dist/KTX도면찾기.html", src.replace("<!--MANIFEST-->", ""));
fs.writeFileSync("dist/pwa/index.html", src.replace("<!--MANIFEST-->", '<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg">'));
// 글자 인식 엔진과 학습 데이터 (앱과 함께 기기에 캐시됨)
fs.mkdirSync("dist/pwa/ocr", {recursive: true});
const ocrFiles = {
  "tesseract.min.js": "node_modules/tesseract.js/dist/tesseract.min.js",
  "worker.min.js": "node_modules/tesseract.js/dist/worker.min.js",
  "tesseract-core-lstm.wasm.js": "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js": "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "eng.traineddata.gz": "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  "kor.traineddata.gz": "node_modules/@tesseract.js-data/kor/4.0.0_best_int/kor.traineddata.gz"
};
for (const [to, from] of Object.entries(ocrFiles)) fs.copyFileSync(from, "dist/pwa/ocr/" + to);
const ver = require("crypto").createHash("sha1").update(src).digest("hex").slice(0, 8);
fs.writeFileSync("dist/pwa/sw.js", fs.readFileSync("src/sw.js", "utf8").replace("__VER__", ver)
  .replace("__FILES__", JSON.stringify(["./", "./index.html", "./manifest.webmanifest", "./icon.svg", ...Object.keys(ocrFiles).map(f => "./ocr/" + f)])));
for (const f of ["manifest.webmanifest", "icon.svg"]) fs.copyFileSync("src/" + f, "dist/pwa/" + f);
console.log("ok", (fs.statSync("dist/KTX도면찾기.html").size / 1e6).toFixed(2) + "MB");
