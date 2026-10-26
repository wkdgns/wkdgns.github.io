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
  _pdfjs = {getDocument: src => gd({...src, CMapReaderFactory: KRCMapFactory, cMapUrl: "kr/", cMapPacked: true, useWorkerFetch: false, isEvalSupported: false})};
  return _pdfjs;
}
</script>`;
const src = fs.readFileSync("src/app.html", "utf8").replace("<!--PDFJS-->", () => loader);
fs.mkdirSync("dist/pwa", {recursive: true});
fs.writeFileSync("dist/KTX도면찾기.html", src.replace("<!--MANIFEST-->", ""));
fs.writeFileSync("dist/pwa/index.html", src.replace("<!--MANIFEST-->", '<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg">'));
console.log("ok", (fs.statSync("dist/KTX도면찾기.html").size / 1e6).toFixed(2) + "MB");
