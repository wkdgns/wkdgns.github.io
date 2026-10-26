/* ---------- 글자 인식 (OCR, 기기 안에서만 실행) ---------- */
// 스캔 도면은 PDF 안에 글자가 없어서, 페이지를 고해상도 조각으로 그려 Tesseract로 읽는다.
// 엔진과 학습 데이터는 앱과 같은 폴더(ocr/)에서 불러오며 인터넷으로 아무것도 보내지 않는다.
const ocrCount = fileId => PAGES.filter(p => p.fileId === fileId && p.ocr).length;
const OCR_MODES = {
  wire: {label: "선번호·계전기 번호만 (영문 대문자·숫자)", langs: "eng",
    whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/._()+:#"},
  all: {label: "한글 포함 전체 글자", langs: "kor+eng", whitelist: ""}
};
// 스캔 해상도 그대로 한 번 읽고, 정밀 모드는 1.7배 확대해서 한 번 더 읽어 작은 글자를 보완한다
const OCR_QUALITY = {fast: {label: "빠르게 (스캔 해상도 그대로)", scales: [1]}, fine: {label: "정밀하게 (작은 선번호까지, 약 3배 느림)", scales: [1, 1.7]}};
let OCR = null;  // 진행 중인 작업

function parsePages(str, max){
  str = (str || "").trim();
  if (!str) return Array.from({length: max}, (_, i) => i + 1);
  const out = new Set();
  for (const part of str.split(/[,\s]+/).filter(Boolean)){
    const m = part.match(/^(\d+)(?:[-~](\d+))?$/);
    if (!m) throw new Error(`“${part}”는 쪽 번호가 아닙니다`);
    let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a];
    for (let i = Math.max(1, a); i <= Math.min(max, b); i++) out.add(i);
  }
  if (!out.size) throw new Error(`1~${max}쪽 사이로 입력하세요`);
  return [...out].sort((x, y) => x - y);
}
function getPref(k, d){ try { return localStorage.getItem("ktx-ocr-" + k) || d; } catch { return d; } }
function setPref(k, v){ try { localStorage.setItem("ktx-ocr-" + k, v); } catch {} }

function ocrDialog(fileId, presetPages){
  const f = fileById(fileId);
  if (OCR){ toast("이미 글자 인식이 진행 중입니다"); return; }
  const scanPages = PAGES.filter(p => p.fileId === fileId && p.text.replace(/\s/g, "").length <= 15).map(p => p.page);
  const mode = getPref("mode", "wire"), q = getPref("q", "fine"), rot = getPref("rot", "1");
  openSheet(`<h3 style="margin-top:0">글자 인식</h3>
    <div class="muted">${esc(f.name)} · 전체 ${f.pages}쪽 · 인식 완료 ${ocrCount(fileId)}쪽</div>
    <label class="f" for="oPages">인식할 쪽 (비우면 전체)</label>
    <input class="t" id="oPages" inputmode="text" placeholder="예: 3-7, 12" value="${esc(presetPages || "")}">
    <div class="chips">
      <span class="chip x" data-pp="">전체</span>
      ${scanPages.length && scanPages.length < f.pages ? `<span class="chip x" data-pp="${compactPages(scanPages)}">스캔된 쪽만 (${scanPages.length})</span>` : ""}
      ${V.fileId === fileId && $("#viewer").classList.contains("open") ? `<span class="chip x" data-pp="${V.page}">지금 보는 ${V.page}쪽</span>` : ""}
    </div>
    <label class="f">읽을 글자</label>
    ${Object.entries(OCR_MODES).map(([k, m]) => `<label class="opt"><input type="radio" name="oMode" value="${k}" ${k === mode ? "checked" : ""}><span>${m.label}${k === "wire" ? '<br><span class="muted">헷갈리는 글자(O/0, l/1)가 줄어 선번호가 더 정확해요</span>' : ""}</span></label>`).join("")}
    <label class="f">해상도</label>
    ${Object.entries(OCR_QUALITY).map(([k, m]) => `<label class="opt"><input type="radio" name="oQ" value="${k}" ${k === q ? "checked" : ""}><span>${m.label}</span></label>`).join("")}
    <label class="opt"><input type="checkbox" id="oRot" ${rot === "1" ? "checked" : ""}><span>세로로 쓰인 선번호도 읽기<br><span class="muted">시간이 약 2배 걸려요</span></span></label>
    <div class="muted" style="margin-top:6px">한 쪽에 1~3분 정도 걸려요. 인식이 끝난 쪽은 바로 저장되니 중간에 멈춰도 됩니다. 인식하는 동안 화면을 켜 두세요.</div>
    <div class="row" style="margin-top:16px"><span class="grow"></span>
      <button class="btn" id="oCancel">취소</button><button class="btn primary" id="oStart">인식 시작</button></div>`);
  $("#sheetPanel").querySelectorAll("[data-pp]").forEach(c => c.onclick = () => $("#oPages").value = c.dataset.pp);
  $("#oCancel").onclick = () => history.back();
  $("#oStart").onclick = () => {
    let pages;
    try { pages = parsePages($("#oPages").value, f.pages); } catch (err){ toast(err.message); return; }
    const opts = {mode: document.querySelector('input[name="oMode"]:checked').value,
      q: document.querySelector('input[name="oQ"]:checked').value, rot: $("#oRot").checked};
    setPref("mode", opts.mode); setPref("q", opts.q); setPref("rot", opts.rot ? "1" : "0");
    history.back();
    runOcr(fileId, pages, opts);
  };
}
function compactPages(list){
  const out = []; let a = list[0], b = a;
  for (const n of list.slice(1).concat([null])){
    if (n === b + 1){ b = n; continue; }
    out.push(a === b ? a : a + "-" + b); a = b = n;
  }
  return out.join(", ");
}

function loadScript(src){
  return new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src;
    s.onload = res; s.onerror = () => rej(new Error("인식 엔진 파일을 찾을 수 없습니다"));
    document.head.appendChild(s);
  });
}
async function makeWorker(mode){
  if (location.protocol === "file:") throw new Error("글자 인식은 설치한 앱(웹 주소)에서만 쓸 수 있어요");
  if (!window.Tesseract) await loadScript("ocr/tesseract.min.js");
  const base = new URL("ocr/", location.href).href;
  const m = OCR_MODES[mode];
  const w = await Tesseract.createWorker(m.langs, 1 /* LSTM */, {
    workerPath: base + "worker.min.js", corePath: base, langPath: base,
    workerBlobURL: false, cacheMethod: "none", gzip: true
  });
  await w.setParameters({
    tessedit_pageseg_mode: "11",            // 흩어진 글자 (도면용)
    tessedit_char_whitelist: m.whitelist,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300"
  });
  return w;
}

function setOcrBar(msg, pct){
  $("#ocrbar").hidden = false;
  $("#ocrMsg").textContent = msg;
  $("#ocrProg").style.width = Math.round(pct * 100) + "%";
}

async function runOcr(fileId, pages, opts){
  const f = fileById(fileId);
  OCR = {stop: false};
  $("#ocrStop").onclick = () => { if (OCR){ OCR.stop = true; setOcrBar("멈추는 중… (지금 조각까지만 읽고 멈춰요)", 0); } };
  let wake = null;
  try { wake = await navigator.wakeLock?.request("screen"); } catch {}
  let worker, done = 0, words = 0;
  try {
    setOcrBar("글자 인식 엔진 준비 중…", 0);
    const pdfjs = await getPdfjs();
    worker = await makeWorker(opts.mode);
    const blob = await tx(["blobs"], "readonly", t => req(t.objectStore("blobs").get(fileId)));
    const doc = await pdfjs.getDocument({data: new Uint8Array(await blob.arrayBuffer())}).promise;
    for (let i = 0; i < pages.length && !OCR.stop; i++){
      const pn = pages[i];
      const label = `${f.name} ${pn}쪽 (${i + 1}/${pages.length})`;
      const res = await ocrPage(doc, pn, worker, opts, (k, n) => setOcrBar(`글자 인식 중: ${label} · 조각 ${k}/${n}`, (i + k / n) / pages.length));
      if (!res) break;  // 중지
      await tx(["pages"], "readwrite", async t => {
        const st = t.objectStore("pages");
        const rec = await req(st.get([fileId, pn]));
        rec.ocr = {words: res, text: res.map(w => w.t).join(" "), at: Date.now(), mode: opts.mode, q: opts.q};
        st.put(rec);
      });
      done++; words += res.length;
    }
    await doc.destroy();
  } catch (err){
    console.error(err);
    toast("글자 인식 실패: " + err.message, 5000);
  } finally {
    if (worker) worker.terminate().catch(() => {});
    try { wake && wake.release(); } catch {}
    const stopped = OCR && OCR.stop;
    OCR = null;
    $("#ocrbar").hidden = true;
    await loadAll();
    if (done) toast(`${done}쪽 글자 인식 완료 · 글자 ${words}개${stopped ? " (중지됨)" : ""}`, 3500);
    if ($("#viewer").classList.contains("open") && V.fileId === fileId) renderPage(); else render();
  }
}

/* 한 쪽을 조각내어 읽고, 좌표를 쪽 크기 기준(0~1)으로 돌려준다 */
async function ocrPage(doc, pn, worker, opts, progress){
  const page = await doc.getPage(pn);
  const base = page.getViewport({scale: 1});
  const nat = await nativeScale(page, base);
  const scales = OCR_QUALITY[opts.q].scales;
  const found = [];
  let k = 0;
  const jobs = [];
  for (const m of scales){
    // 너무 큰 이미지는 기기 메모리와 시간 때문에 제한
    const scale = Math.min(nat * m, 11000 / Math.max(base.width, base.height));
    if (jobs.length && scale <= jobs[jobs.length - 1].scale * 1.15) continue;
    jobs.push({scale, tiles: tilesFor(page.getViewport({scale}))});
  }
  const passes = opts.rot ? 2 : 1, total = jobs.reduce((n, j) => n + j.tiles.length * passes, 0);
  for (const job of jobs){
    const r = await ocrTiles(page, job, worker, opts, () => progress(++k, total), passes, found);
    if (!r) return null;
  }
  page.cleanup();
  const W = base.width, H = base.height;
  // 조각 겹침과 여러 배율로 두 번 읽힌 글자는 확신도가 높은 쪽만 남긴다
  found.sort((a, b) => b.c - a.c);
  const keep = [];
  for (const w of found){
    if (!keep.some(o => overlap(o, w) > 0.5)) keep.push(w);
  }
  return keep.map(w => ({t: w.t, c: Math.round(w.c), x: w.x / W, y: w.y / H, w: w.w / W, h: w.h / H, ...(w.v ? {v: 1} : {})}));
}
/* 스캔 이미지의 원래 해상도에 맞는 배율 (이미지가 없으면 약 300dpi) */
async function nativeScale(page, base){
  try {
    const {OPS} = await getPdfjs();
    const ops = await page.getOperatorList();
    let best = 0;
    for (let i = 0; i < ops.fnArray.length; i++){
      if (ops.fnArray[i] !== OPS.paintImageXObject) continue;
      const id = ops.argsArray[i][0];
      const img = await new Promise(res => { try { page.objs.get(id, res); } catch { res(null); } setTimeout(() => res(null), 3000); });
      if (img && img.width) best = Math.max(best, img.width / base.width, img.height / base.height);
    }
    if (best) return Math.max(2, Math.min(best, 8));
  } catch (err){ console.warn(err); }
  return 300 / 72;
}
function tilesFor(vp){
  const W = Math.ceil(vp.width), H = Math.ceil(vp.height);
  const T = 1800, OV = 160;  // 조각 크기와 겹침 (경계에 걸린 글자를 놓치지 않게)
  const steps = len => { const o = []; for (let v = 0; ; v += T - OV){ o.push(v); if (v + T >= len) break; } return o; };
  const tiles = [];
  for (const y of steps(H)) for (const x of steps(W)) tiles.push({x, y, w: Math.min(T, W - x), h: Math.min(T, H - y)});
  return tiles;
}
/* 한 배율로 모든 조각을 읽어 found에 (배율 1 기준 좌표로) 추가 */
async function ocrTiles(page, job, worker, opts, tick, passes, found){
  const {scale, tiles} = job, s = 1 / scale;
  const add = (w, v) => found.push({t: w.t, c: w.c, x: w.x * s, y: w.y * s, w: w.w * s, h: w.h * s, ...(v ? {v: 1} : {})});
  const cv = document.createElement("canvas"), ctx = cv.getContext("2d", {willReadFrequently: true});
  const rc = document.createElement("canvas"), rctx = rc.getContext("2d");
  for (const t of tiles){
    if (OCR.stop) return false;
    cv.width = t.w; cv.height = t.h;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, t.w, t.h);
    await page.render({canvasContext: ctx, viewport: page.getViewport({scale, offsetX: -t.x, offsetY: -t.y})}).promise;
    if (isBlank(ctx, t.w, t.h)){ for (let i = 0; i < passes; i++) tick(); continue; }
    enhance(ctx, t.w, t.h);
    tick();
    for (const w of await readWords(worker, cv)) add({t: w.t, c: w.c, x: t.x + w.x0, y: t.y + w.y0, w: w.x1 - w.x0, h: w.y1 - w.y0});
    if (opts.rot){
      if (OCR.stop) return false;
      // 시계 방향으로 90° 돌려서 아래→위로 쓰인 세로 글자를 가로로 만든다
      rc.width = t.h; rc.height = t.w;
      rctx.setTransform(0, 1, -1, 0, t.h, 0); rctx.drawImage(cv, 0, 0); rctx.setTransform(1, 0, 0, 1, 0, 0);
      tick();
      for (const w of await readWords(worker, rc)) add({t: w.t, c: w.c, x: t.x + w.y0, y: t.y + (t.h - w.x1), w: w.y1 - w.y0, h: w.x1 - w.x0}, true);
    }
  }
  return true;
}
function overlap(a, b){
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / Math.min(a.w * a.h, b.w * b.h || 1);
}
function isBlank(ctx, w, h){
  const d = ctx.getImageData(0, 0, w, h).data;
  let dark = 0;
  for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] < 384) dark++;
  return dark < 3;
}
/* 회색조 → 3x3 중간값 필터(스캔 잡티 제거) → 대비 높이기 */
function enhance(ctx, w, h){
  const img = ctx.getImageData(0, 0, w, h), d = img.data, n = w * h;
  const g = new Uint8Array(n), m = new Uint8Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  m.set(g);
  const v = new Uint8Array(9);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++){
    const o = y * w + x;
    if (g[o] > 235 && g[o - 1] > 235 && g[o + 1] > 235) continue;  // 흰 바탕은 건너뛰어 빠르게
    let k = 0;
    for (let dy = -w; dy <= w; dy += w) for (let dx = -1; dx <= 1; dx++) v[k++] = g[o + dy + dx];
    v.sort(); m[o] = v[4];
  }
  const hist = new Uint32Array(256);
  for (let j = 0; j < n; j++) hist[m[j]]++;
  // 하위 1%는 검정, 밝은 쪽 40%는 흰색으로 늘림
  let acc = 0, lo = 0, hi = 255;
  for (let t = 0; t < 256; t++){ acc += hist[t]; if (acc > n * 0.01){ lo = t; break; } }
  acc = 0; for (let t = 255; t >= 0; t--){ acc += hist[t]; if (acc > n * 0.4){ hi = t; break; } }
  if (hi - lo < 40) hi = Math.min(255, lo + 40);
  const sc = 255 / (hi - lo);
  for (let i = 0, j = 0; j < n; i += 4, j++){ const val = Math.max(0, Math.min(255, (m[j] - lo) * sc)); d[i] = d[i + 1] = d[i + 2] = val; }
  ctx.putImageData(img, 0, 0);
}
async function readWords(worker, canvas){
  const {data} = await worker.recognize(canvas, {}, {blocks: true, text: false});
  const out = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words){
    const t = w.text.trim();
    if (!t) continue;
    // 확신도가 낮아도 선번호처럼 생긴 것(영문+숫자 조합)은 남긴다. 테스트에서 맞게 읽고도 확신도 0이 나오는 경우가 있었다
    if (w.confidence < 55 && !(/\d/.test(t) && /^[A-Z0-9][A-Z0-9\-\/._()+:#]{1,15}$/i.test(t))) continue;
    if (t.replace(/[^0-9A-Za-z가-힣]/g, "").length < 2) continue;  // 한 글자 잡음 제거
    if (/^[-_.\/|()]+$/.test(t)) continue;
    out.push({t, c: w.confidence, ...w.bbox});
  }
  return out;
}
