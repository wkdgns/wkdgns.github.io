/* ---------- 글자 인식 (OCR, 기기 안에서만 실행) ---------- */
// 스캔 도면은 PDF 안에 글자가 없어서, 페이지를 고해상도 조각으로 그려 Tesseract로 읽는다.
// 엔진과 학습 데이터는 앱과 같은 폴더(ocr/)에서 불러오며 인터넷으로 아무것도 보내지 않는다.
const ocrCount = fileId => PAGES.filter(p => p.fileId === fileId && p.ocr).length;
const OCR_MODES = {
  wire: {label: "선번호·계전기 번호만 (영문 대문자·숫자)", langs: "eng",
    whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/._()+:#,"},
  all: {label: "한글 포함 전체 글자", langs: "kor+eng", whitelist: ""},
  // 다른 도면 연결 표시(490.8B)만 노린 방식: 표시에 닿거나 지나가는 긴 선을 지우고, 숫자·점·칸 글자만 읽는다
  ref: {label: "다른 도면 연결 표시만 (490.8B 같은 것)", langs: "eng", whitelist: "0123456789.ABCDEFGHIJKL"}
};
// 스캔 해상도 그대로 한 번 읽고, 정밀 모드는 1.7배 확대해서 한 번 더 읽어 작은 글자를 보완한다
const OCR_QUALITY = {fast: {label: "빠르게 (한 번만 읽음)", scales: [1]}, fine: {label: "정밀하게 (글자 크기에 맞춰 한 번 더 읽음, 약 2배 느림)", scales: [1, 1.7]},
  cross: {label: "교차 인식 (이미 인식한 쪽을 다른 배율·조각 위치로 다시 읽어 놓친 글자 보충)", scales: [1.3]}};
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
  openSheet(`<h3 style="margin-top:0">글자 인식</h3>
    <div class="muted">${esc(f.name)} · 전체 ${f.pages}쪽 · 인식 완료 ${ocrCount(fileId)}쪽</div>
    <label class="f" for="oPages">인식할 쪽 (비우면 전체)</label>
    <input class="t" id="oPages" inputmode="text" placeholder="예: 3-7, 12" value="${esc(presetPages || "")}">
    <div class="chips">
      <span class="chip x" data-pp="">전체</span>
      ${scanPages.length && scanPages.length < f.pages ? `<span class="chip x" data-pp="${compactPages(scanPages)}">스캔된 쪽만 (${scanPages.length})</span>` : ""}
      ${V.fileId === fileId && $("#viewer").classList.contains("open") ? `<span class="chip x" data-pp="${V.page}">지금 보는 ${V.page}쪽</span>` : ""}
    </div>
    ${ocrOptionsHtml()}
    ${ocrCount(fileId) ? `<label class="opt"><input type="checkbox" id="oMerge" checked><span>이전 인식 결과에 더하기<br><span class="muted">끄면 이전 결과를 지우고 새로 읽어요. 설정을 바꿔 여러 번 돌리면 더 많이 찾을 수 있어요</span></span></label>` : ""}
    <div class="muted" style="margin-top:6px">한 쪽에 1~3분 정도 걸려요. 인식이 끝난 쪽은 바로 저장되니 중간에 멈춰도 됩니다. 인식하는 동안 화면을 켜 두세요. 화면이 꺼지면 멈춰요.</div>
    <div class="row" style="margin-top:16px"><span class="grow"></span>
      <button class="btn" id="oCancel">취소</button><button class="btn primary" id="oStart">인식 시작</button></div>`);
  $("#sheetPanel").querySelectorAll("[data-pp]").forEach(c => c.onclick = () => $("#oPages").value = c.dataset.pp);
  $("#oCancel").onclick = () => history.back();
  $("#oStart").onclick = () => {
    let pages;
    try { pages = parsePages($("#oPages").value, f.pages); } catch (err){ toast(err.message); return; }
    const opts = {...readOcrOptions(), merge: !!($("#oMerge") && $("#oMerge").checked)};
    history.back();
    runOcrJobs([{fileId, pages}], opts);
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

async function runOcrJobs(jobs, opts){
  OCR = {stop: false};
  $("#ocrStop").onclick = () => { if (OCR){ OCR.stop = true; setOcrBar("멈추는 중… (지금 조각까지만 읽고 멈춰요)", 0); } };
  await keepAwake();
  const totalPages = jobs.reduce((n, j) => n + j.pages.length, 0), started = Date.now();
  let worker, done = 0, words = 0, failed = [];
  try {
    setOcrBar("글자 인식 엔진 준비 중…", 0);
    const pdfjs = await getPdfjs();
    worker = await makeWorker(opts.mode);
    for (let fi = 0; fi < jobs.length && !OCR.stop; fi++){
      const {fileId, pages} = jobs[fi], f = fileById(fileId);
      let doc;
      try {
        const blob = await tx(["blobs"], "readonly", t => req(t.objectStore("blobs").get(fileId)));
        doc = await pdfjs.getDocument({data: new Uint8Array(await blob.arrayBuffer())}).promise;
        for (let i = 0; i < pages.length && !OCR.stop; i++){
          const pn = pages[i];
          const eta = done ? ` · 남은 시간 약 ${fmtDur((Date.now() - started) / done * (totalPages - done))}` : "";
          const label = (jobs.length > 1 ? `도면 ${fi + 1}/${jobs.length} ` : "") + `${f.name} ${pn}쪽 · 전체 ${done + 1}/${totalPages}쪽${eta}`;
          const res = await ocrPage(doc, pn, worker, opts, (k, n) => {
            setOcrBar(`글자 인식 중: ${label} · 조각 ${k}/${n}`, (done + k / n) / totalPages);
            const bo = $("#boMsg"); if (bo && !$("#blackout").hidden) bo.textContent = $("#ocrMsg").textContent;
          });
          if (!res) break;  // 중지
          await tx(["pages"], "readwrite", async t => {
            const st = t.objectStore("pages");
            const rec = await req(st.get([fileId, pn]));
            const merged = opts.merge && rec.ocr ? unionWords(rec.ocr.words, res) : res;
            rec.ocr = {words: merged, text: merged.map(w => w.t).join(" "), at: Date.now(), mode: opts.mode, q: opts.q, runs: (opts.merge && rec.ocr ? rec.ocr.runs || 1 : 0) + 1};
            st.put(rec);
          });
          done++; words += res.length;
        }
      } catch (err){
        // 한 도면이 망가져 있어도 나머지는 계속한다
        console.error(err); failed.push(f.name);
        if (jobs.length === 1) throw err;
      } finally {
        if (doc) await doc.destroy().catch(() => {});
      }
    }
  } catch (err){
    console.error(err);
    toast("글자 인식 실패: " + err.message, 5000);
  } finally {
    if (worker) worker.terminate().catch(() => {});
    try { wakeLock && wakeLock.release(); } catch {}
    wakeLock = null;
    const stopped = OCR && OCR.stop;
    OCR = null;
    $("#ocrbar").hidden = true; blackout(false);
    await loadAll();
    if (done || failed.length) toast(`${done}쪽 글자 인식 완료 · 글자 ${words}개${stopped ? " (중지됨)" : ""}${failed.length ? ` · 읽지 못한 도면 ${failed.length}개: ${failed.slice(0, 3).join(", ")}` : ""}`, 6000);
    if ($("#viewer").classList.contains("open")) renderPage(); else render();
  }
}
function fmtDur(ms){
  const m = Math.round(ms / 60000);
  return m < 60 ? `${Math.max(1, m)}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

/* 인식 설정 (읽을 글자, 해상도, 세로 글자) — 한 도면용과 전체용 창이 같이 쓴다 */
function ocrOptionsHtml(){
  const mode = getPref("mode", "wire"), q = getPref("q", "fine"), rot = getPref("rot", "1");
  return `<label class="f">읽을 글자</label>
    ${Object.entries(OCR_MODES).map(([k, m]) => `<label class="opt"><input type="radio" name="oMode" value="${k}" ${k === mode ? "checked" : ""}><span>${m.label}${k === "wire" ? '<br><span class="muted">헷갈리는 글자(O/0, l/1)가 줄어 선번호가 더 정확해요</span>' : ""}</span></label>`).join("")}
    <label class="f">해상도</label>
    ${Object.entries(OCR_QUALITY).map(([k, m]) => `<label class="opt"><input type="radio" name="oQ" value="${k}" ${k === q ? "checked" : ""}><span>${m.label}</span></label>`).join("")}
    <label class="opt"><input type="checkbox" id="oRot" ${rot === "1" ? "checked" : ""}><span>세로로 쓰인 선번호도 읽기<br><span class="muted">시간이 약 2배 걸려요</span></span></label>`;
}
function readOcrOptions(){
  const opts = {mode: document.querySelector('input[name="oMode"]:checked').value,
    q: document.querySelector('input[name="oQ"]:checked').value, rot: $("#oRot").checked};
  setPref("mode", opts.mode); setPref("q", opts.q); setPref("rot", opts.rot ? "1" : "0");
  return opts;
}

/* 등록된 도면 전체를 차례로 인식. 쪽마다 바로 저장되므로, 멈췄다가 "아직 안 한 쪽만"으로 다시 돌리면 이어서 한다 */
function batchOcrDialog(){
  if (OCR){ toast("이미 글자 인식이 진행 중입니다"); return; }
  // PDF 안에 글자가 이미 들어 있는 쪽은 인식할 필요가 없어서 뺀다
  const needs = p => p.text.replace(/\s/g, "").length <= 15;
  const total = PAGES.filter(needs).length, todo = PAGES.filter(p => needs(p) && !p.ocr).length;
  openSheet(`<h3 style="margin-top:0">전체 도면 글자 인식</h3>
    <div class="muted">도면 ${FILES.length}개 · 인식이 필요한 쪽 ${total}쪽 · 그중 아직 안 한 쪽 ${todo}쪽<br>PDF 안에 글자가 이미 있는 쪽은 건너뛰어요</div>
    <label class="f">인식할 쪽</label>
    <label class="opt"><input type="radio" name="bTarget" value="todo" checked><span>아직 인식 안 한 쪽만 (${todo}쪽)<br><span class="muted">중간에 멈췄을 때도 이걸로 다시 누르면 이어서 해요</span></span></label>
    <label class="opt"><input type="radio" name="bTarget" value="all"><span>모든 쪽 다시 (${total}쪽)<br><span class="muted">이전 결과는 지우지 않고 새로 찾은 글자만 더해요. 교차 인식을 돌릴 때 쓰세요</span></span></label>
    ${ocrOptionsHtml()}
    <div class="warn">쪽당 탭에서 대략 2~5분 걸려요. 아직 안 한 ${todo}쪽이면 약 ${fmtDur(todo * 2 * 60000)}~${fmtDur(todo * 5 * 60000)} 걸려서, 충전기를 꽂고 밤새 돌리는 걸 추천해요.
      화면이 꺼지면 멈추니 진행 중에 <b>화면 검게</b>를 눌러 두세요. 화면은 켜진 채로 검게만 보여서 배터리를 아껴요.</div>
    <div class="row" style="margin-top:16px"><span class="grow"></span>
      <button class="btn" id="bCancel">취소</button><button class="btn primary" id="bStart">전체 인식 시작</button></div>`);
  $("#bCancel").onclick = () => history.back();
  $("#bStart").onclick = () => {
    const target = document.querySelector('input[name="bTarget"]:checked').value;
    const opts = {...readOcrOptions(), merge: target === "all"};
    const jobs = FILES.map(f => ({fileId: f.id, pages: PAGES.filter(p => p.fileId === f.id && needs(p) && (target === "all" || !p.ocr)).map(p => p.page).sort((a, b) => a - b)}))
      .filter(j => j.pages.length);
    if (!jobs.length){ toast("인식할 쪽이 없습니다"); return; }
    history.back();
    runOcrJobs(jobs, opts);
  };
}

/* 화면 검게: 화면 꺼짐 방지(Wake Lock)는 유지한 채 검은 화면만 보여 준다. 누르면 돌아옴 */
function blackout(on){
  let b = $("#blackout");
  if (!b){
    b = document.createElement("div"); b.id = "blackout";
    b.innerHTML = '<div id="boMsg"></div><div class="bohint">화면을 누르면 돌아가요 · 인식은 계속 진행 중</div>';
    b.onclick = () => blackout(false);
    document.body.appendChild(b);
  }
  b.hidden = !on;
  if (on) $("#boMsg").textContent = $("#ocrMsg").textContent;
}
let wakeLock = null;
async function keepAwake(){
  try { if (navigator.wakeLock && !wakeLock && document.visibilityState === "visible") wakeLock = await navigator.wakeLock.request("screen"); wakeLock && wakeLock.addEventListener("release", () => wakeLock = null); } catch {}
}
// 다른 앱을 보고 돌아오면 화면 꺼짐 방지를 다시 건다
document.addEventListener("visibilitychange", () => { if (OCR && document.visibilityState === "visible") keepAwake(); });

/* 한 쪽을 조각내어 읽고, 좌표를 쪽 크기 기준(0~1)으로 돌려준다 */
// 글자 높이가 30px 안팎일 때 가장 잘 읽혀서, 첫 번째로 읽은 글자 크기를 보고 정밀 모드의 두 번째 배율을 정한다
const OCR_TARGET_PX = 30, OCR_MAX_SIDE = 12000;
async function ocrPage(doc, pn, worker, opts, progress){
  const page = await doc.getPage(pn);
  const base = page.getViewport({scale: 1});
  const longSide = Math.max(base.width, base.height), maxScale = OCR_MAX_SIDE / longSide;
  const src = await pageSource(page, base);
  const passes = opts.rot ? 2 : 1;
  const found = [];
  // 교차 인식: 배율을 바꾸고 조각 경계를 반 칸 밀고 전처리도 바꿔서, 처음과 다른 조건으로 읽는다
  const cross = opts.q === "cross";
  const job1 = {scale: Math.min(src.scale * (cross ? 1.3 : 1), maxScale), vector: src.vector, alt: cross, ref: opts.mode === "ref"};
  job1.tiles = tilesFor(page.getViewport({scale: job1.scale}), cross ? 900 : 0);
  // 정밀 모드는 두 번째 배율을 아직 모르므로 첫 번째와 같은 양으로 어림잡아 진행률을 보여준다
  let total = job1.tiles.length * passes * (opts.q === "fine" ? 2 : 1), k = 0;
  const tick = () => progress(Math.min(++k, total), total);
  if (!await ocrTiles(page, job1, worker, opts, tick, passes, found)) return null;
  if (opts.q === "fine"){
    const hs = found.filter(w => w.c >= 70 && !w.v).map(w => w.h * job1.scale).sort((a, b) => a - b);
    const med = hs.length >= 5 ? hs[hs.length >> 1] : 0;
    let scale2 = job1.scale * 1.6, alt = false;
    if (med) scale2 = job1.scale * OCR_TARGET_PX / med;
    if (Math.abs(scale2 / job1.scale - 1) < 0.3){ scale2 = job1.scale; alt = true; }  // 크기가 이미 알맞으면 같은 배율에서 처리만 바꿔 한 번 더
    scale2 = Math.max(job1.scale * 0.5, Math.min(scale2, maxScale));
    const job2 = {scale: scale2, vector: src.vector, alt, ref: opts.mode === "ref"};
    job2.tiles = tilesFor(page.getViewport({scale: scale2}));
    total = k + job2.tiles.length * passes;
    if (!await ocrTiles(page, job2, worker, opts, tick, passes, found)) return null;
  }
  page.cleanup();
  return mergeWords([], found.map(w => ({t: w.t, c: Math.round(w.c), x: w.x / base.width, y: w.y / base.height, w: w.w / base.width, h: w.h / base.height, ...(w.v ? {v: 1} : {})})));
}
/* 따로 돌린 인식 결과 합치기: 예전에 읽은 글자는 그대로 두고, 같은 자리에서 같은 글자를 다시 읽은 것만 빼고 더한다
   (확신도로 고르면 다른 방식이 자신 있게 잘못 읽은 글자가 맞게 읽은 글자를 지울 수 있다) */
function unionWords(old, add){
  const out = old.slice();
  for (const w of add){
    const n = norm(w.t);
    if (!out.some(o => overlap(o, w) > 0.3 && norm(o.t).includes(n))) out.push(w);
  }
  return out;
}
/* 조각 겹침, 여러 배율, 여러 번 인식으로 같은 자리를 두 번 읽으면 확신도가 높은 쪽만 남긴다 */
function mergeWords(old, add){
  const all = old.concat(add).sort((a, b) => b.c - a.c), keep = [];
  // 같은 글자면 조금만 겹쳐도 하나로, 다른 글자면 거의 같은 자리일 때만 하나로 본다
  // (확대해서 읽을 때 옆 줄까지 한 덩어리로 읽힌 결과가 제대로 읽은 글자를 지우지 않도록)
  for (const w of all) if (!keep.some(o => o.t === w.t ? overlap(o, w) > 0.3 : iou(o, w) > 0.6)) keep.push(w);
  return keep;
}
/* 스캔 이미지면 원래 해상도, CAD에서 나온 선 도면(글자가 선으로 된 것)이면 긴 변 6000px */
async function pageSource(page, base){
  try {
    const {OPS} = await getPdfjs();
    const ops = await page.getOperatorList();
    let best = 0;
    for (let i = 0; i < ops.fnArray.length; i++){
      if (ops.fnArray[i] !== OPS.paintImageXObject) continue;
      const id = ops.argsArray[i][0];
      const img = await new Promise(res => { try { page.objs.get(id, res); } catch { res(null); } setTimeout(() => res(null), 3000); });
      // 로고 같은 작은 그림은 무시: 쪽 전체를 덮을 만큼 큰 그림만 스캔으로 본다
      if (img && img.width * img.height > 1.5e6) best = Math.max(best, img.width / base.width, img.height / base.height);
    }
    if (best >= 1.5) return {scale: Math.max(2, Math.min(best, 8)), vector: false};
  } catch (err){ console.warn(err); }
  return {scale: 6000 / Math.max(base.width, base.height), vector: true};
}
function tilesFor(vp, shift = 0){
  const W = Math.ceil(vp.width), H = Math.ceil(vp.height);
  const T = 1800, OV = 160;  // 조각 크기와 겹침 (경계에 걸린 글자를 놓치지 않게)
  const steps = len => { const o = [0]; for (let v = shift || T - OV; v < len - OV; v += T - OV) o.push(v); return o; };
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
    enhance(ctx, t.w, t.h, job);
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
function iou(a, b){
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / (a.w * a.h + b.w * b.h - ix * iy || 1);
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
/* 회색조 → (스캔) 3x3 중간값 필터로 잡티 제거, (선 도면) 가는 선을 굵게 → 대비 높이기
   선 도면은 글자가 1px 실선으로 그려져서 그대로는 잘 안 읽힌다. 중간값 필터를 쓰면 아예 지워진다 */
function enhance(ctx, w, h, job){
  const img = ctx.getImageData(0, 0, w, h), d = img.data, n = w * h;
  let g = new Uint8Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  if (job.vector){
    // 글자 높이에 맞춰 선 굵기를 늘림: 배율이 크면 더 굵게, 두 번째 처리에서는 한 단계 더
    const r = Math.max(1, Math.round(job.scale / 7)) + (job.alt ? 1 : 0);
    g = minFilter(g, w, h, Math.min(r, 3));
  } else if (!job.alt){
    const m = new Uint8Array(g), v = new Uint8Array(9);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++){
      const o = y * w + x;
      if (g[o] > 235 && g[o - 1] > 235 && g[o + 1] > 235) continue;  // 흰 바탕은 건너뛰어 빠르게
      let k = 0;
      for (let dy = -w; dy <= w; dy += w) for (let dx = -1; dx <= 1; dx++) v[k++] = g[o + dy + dx];
      v.sort(); m[o] = v[4];
    }
    g = m;
  }
  if (job.ref) removeLines(g, w, h);
  const hist = new Uint32Array(256);
  for (let j = 0; j < n; j++) hist[g[j]]++;
  // 하위 1%는 검정, 밝은 쪽 40%는 흰색으로 늘림
  let acc = 0, lo = 0, hi = 255;
  for (let t = 0; t < 256; t++){ acc += hist[t]; if (acc > n * 0.01){ lo = t; break; } }
  acc = 0; for (let t = 255; t >= 0; t--){ acc += hist[t]; if (acc > n * 0.4){ hi = t; break; } }
  if (hi - lo < 40) hi = Math.min(255, lo + 40);
  const sc = 255 / (hi - lo);
  for (let i = 0, j = 0; j < n; i += 4, j++){ const val = Math.max(0, Math.min(255, (g[j] - lo) * sc)); d[i] = d[i + 1] = d[i + 2] = val; }
  ctx.putImageData(img, 0, 0);
}
/* 글자보다 훨씬 긴 가로·세로 선을 흰색으로 지운다. 연결 표시는 배선이나 접점에 붙어 있는 경우가 많아서
   선이 붙은 채로는 글자 덩어리로 읽히지 않는다 */
function removeLines(g, w, h){
  const L = 70, dark = v => v < 140, kill = new Uint8Array(w * h);
  for (let y = 0; y < h; y++){
    let s = -1;
    for (let x = 0; x <= w; x++){
      const d = x < w && dark(g[y * w + x]);
      if (d && s < 0) s = x;
      if (!d && s >= 0){ if (x - s >= L) for (let k = s; k < x; k++) kill[y * w + k] = 1; s = -1; }
    }
  }
  for (let x = 0; x < w; x++){
    let s = -1;
    for (let y = 0; y <= h; y++){
      const d = y < h && dark(g[y * w + x]);
      if (d && s < 0) s = y;
      if (!d && s >= 0){ if (y - s >= L) for (let k = s; k < y; k++) kill[k * w + x] = 1; s = -1; }
    }
  }
  for (let i = 0; i < w * h; i++) if (kill[i]) g[i] = 255;
}
/* 가로, 세로로 나눠 하는 최솟값 필터 (어두운 선을 r픽셀씩 굵게) */
function minFilter(src, w, h, r){
  const tmp = new Uint8Array(src.length), out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++){
    const row = y * w;
    for (let x = 0; x < w; x++){
      let m = 255;
      for (let k = Math.max(0, x - r), e = Math.min(w - 1, x + r); k <= e; k++) if (src[row + k] < m) m = src[row + k];
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++){
    let m = 255;
    for (let k = Math.max(0, y - r), e = Math.min(h - 1, y + r); k <= e; k++) if (tmp[k * w + x] < m) m = tmp[k * w + x];
    out[y * w + x] = m;
  }
  return out;
}
async function readWords(worker, canvas){
  const {data} = await worker.recognize(canvas, {}, {blocks: true, text: false});
  const out = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words){
    const t = w.text.trim();
    if (!t) continue;
    // 확신도가 낮아도 선번호처럼 생긴 것(영문+숫자 조합)은 남긴다. 테스트에서 맞게 읽고도 확신도 0이 나오는 경우가 있었다
    if (w.confidence < 55 && !(/\d/.test(t) && /^[A-Z0-9][A-Z0-9\-\/._()+:#,]{1,60}$/i.test(t))) continue;
    if (t.replace(/[^0-9A-Za-z가-힣]/g, "").length < 2) continue;  // 한 글자 잡음 제거
    if (/^[-_.\/|()]+$/.test(t)) continue;
    out.push({t, c: w.confidence, ...w.bbox});
  }
  return out;
}
