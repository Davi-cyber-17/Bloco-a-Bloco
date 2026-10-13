(() => {
  const N = 8;

  // ---------- Formas ----------
  const BASE = [
    ["#"],
    ["##"],
    ["###"],
    ["####"],
    ["#####"],
    ["##", "##"],
    ["###", "###"],
    ["###", "###", "###"],
    ["#.", "##"],
    ["###", "#..", "#.."],
    [".#.", "###"],
    [".##", "##."],
    ["#.", "#.", "##"],
    ["##", "##", "##"]
  ];

  const toMatrix = (rows) => rows.map((r) => [...r].map((ch) => (ch === "#" ? 1 : 0)));
  const rotate = (m) => {
    const h = m.length, w = m[0].length, out = [];
    for (let c = 0; c < w; c++) {
      const row = [];
      for (let r = h - 1; r >= 0; r--) row.push(m[r][c]);
      out.push(row);
    }
    return out;
  };

  const SHAPES = [];
  const seen = new Set();
  BASE.forEach((rows, i) => {
    let m = toMatrix(rows);
    for (let k = 0; k < 4; k++) {
      const key = JSON.stringify(m);
      if (!seen.has(key)) {
        seen.add(key);
        SHAPES.push({ m, color: i % 7 });
      }
      m = rotate(m);
    }
  });

  // ---------- Estado ----------
  let grid, pieces, score, best, busy, drag;
  try { best = parseInt(localStorage.getItem("bp_best")) || 0; } catch (e) { best = 0; }

  const $ = (id) => document.getElementById(id);
  const boardEl = $("board");
  const trayEl = $("tray");
  const slots = [...trayEl.querySelectorAll(".slot")];
  const cells = [];

  for (let i = 0; i < N * N; i++) {
    const d = document.createElement("div");
    d.className = "cell";
    boardEl.appendChild(d);
    cells.push(d);
  }

  const pitch = () => boardEl.clientWidth / N;
  const rand = (n) => Math.floor(Math.random() * n);

  function canPlace(m, r, c) {
    for (let i = 0; i < m.length; i++)
      for (let j = 0; j < m[0].length; j++)
        if (m[i][j]) {
          const rr = r + i, cc = c + j;
          if (rr < 0 || cc < 0 || rr >= N || cc >= N || grid[rr][cc] !== null) return false;
        }
    return true;
  }
  function fits(m) {
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) if (canPlace(m, r, c)) return true;
    return false;
  }

  function newPieces() {
    let tries = 0, set;
    do {
      set = [0, 1, 2].map(() => SHAPES[rand(SHAPES.length)]);
      tries++;
    } while (tries < 40 && !set.some((p) => fits(p.m)));
    pieces = set.map((p) => ({ m: p.m, color: p.color }));
  }

  // ---------- Render ----------
  function paintBoard(ghost) {
    // ghost = {m, r, c, color}
    const ghostCells = new Map();
    const hl = new Set();
    if (ghost) {
      ghost.m.forEach((row, i) => row.forEach((v, j) => {
        if (v) ghostCells.set((ghost.r + i) * N + ghost.c + j, ghost.color);
      }));
      // linhas/colunas que seriam completadas
      const filled = (r, c) => grid[r][c] !== null || ghostCells.has(r * N + c);
      for (let r = 0; r < N; r++) {
        if ([...Array(N).keys()].every((c) => filled(r, c)))
          for (let c = 0; c < N; c++) hl.add(r * N + c);
      }
      for (let c = 0; c < N; c++) {
        if ([...Array(N).keys()].every((r) => filled(r, c)))
          for (let r = 0; r < N; r++) hl.add(r * N + c);
      }
    }
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const idx = r * N + c, el = cells[idx], v = grid[r][c];
        let cls = "cell";
        if (v !== null) cls += " blk c" + v;
        else if (ghostCells.has(idx)) cls += " blk ghost c" + ghostCells.get(idx);
        if (hl.has(idx)) cls += " hl";
        el.className = cls;
      }
    }
  }

  function buildPiece(p, size, extraClass) {
    const el = document.createElement("div");
    el.className = extraClass;
    el.style.setProperty("--w", p.m[0].length);
    el.style.setProperty("--s", size + "px");
    p.m.forEach((row) => row.forEach((v) => {
      const b = document.createElement("div");
      b.className = v ? "blk c" + p.color : "e";
      el.appendChild(b);
    }));
    return el;
  }

  function paintTray() {
    const stacked = getComputedStyle(trayEl).gridTemplateColumns.trim().split(/\s+/).length === 1;
    const size = Math.floor(pitch() * (stacked ? 0.36 : 0.5));
    trayEl.style.setProperty("--s", size + "px");
    slots.forEach((s, i) => {
      s.style.setProperty("--s", size + "px");
      s.innerHTML = "";
      const p = pieces[i];
      if (!p) return;
      const el = buildPiece(p, size, "piece");
      el.dataset.i = i;
      s.appendChild(el);
    });
  }

  function paintScore() {
    $("score").textContent = score;
    $("best").textContent = best;
  }

  // ---------- Arrastar ----------
  trayEl.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".piece");
    if (!el || busy || drag) return;
    e.preventDefault();
    const i = +el.dataset.i;
    const p = pieces[i];
    const pt = pitch();
    const fl = buildPiece(p, pt - 0, "");
    fl.id = "floating";
    fl.style.setProperty("--s", pt + "px");
    fl.style.gridTemplateColumns = `repeat(${p.m[0].length}, ${pt}px)`;
    fl.style.gridAutoRows = pt + "px";
    document.body.appendChild(fl);
    el.classList.add("dragging");
    drag = { i, p, el, fl, pt, pid: e.pointerId, pos: null };
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    moveDrag(e);
  });

  function moveDrag(e) {
    if (!drag) return;
    const { p, fl, pt } = drag;
    const w = p.m[0].length * pt, h = p.m.length * pt;
    const lift = pt * 1.6;
    const left = e.clientX - w / 2;
    const top = e.clientY - h - lift + pt * 0.4;
    fl.style.left = left + "px";
    fl.style.top = top + "px";

    const br = boardEl.getBoundingClientRect();
    const c = Math.round((left - br.left) / pt);
    const r = Math.round((top - br.top) / pt);
    if (canPlace(p.m, r, c)) {
      drag.pos = { r, c };
      paintBoard({ m: p.m, r, c, color: p.color });
    } else {
      drag.pos = null;
      paintBoard();
    }
  }

  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.fl.remove();
    d.el.classList.remove("dragging");
    if (d.pos) place(d.i, d.pos.r, d.pos.c);
    else paintBoard();
  }

  // ---------- Jogada ----------
  function place(i, r, c) {
    const p = pieces[i];
    let count = 0;
    p.m.forEach((row, a) => row.forEach((v, b) => {
      if (v) { grid[r + a][c + b] = p.color; count++; }
    }));
    pieces[i] = null;
    addScore(count);
    paintBoard();
    paintTray();
    clearLines();
  }

  function addScore(n) {
    score += n;
    if (score > best) {
      best = score;
      try { localStorage.setItem("bp_best", best); } catch (_) {}
    }
    paintScore();
  }

  function clearLines() {
    const rows = [], cols = [];
    for (let r = 0; r < N; r++) if (grid[r].every((v) => v !== null)) rows.push(r);
    for (let c = 0; c < N; c++) if (grid.every((row) => row[c] !== null)) cols.push(c);
    const total = rows.length + cols.length;

    if (!total) return afterMove();

    busy = true;
    const toClear = new Set();
    rows.forEach((r) => { for (let c = 0; c < N; c++) toClear.add(r * N + c); });
    cols.forEach((c) => { for (let r = 0; r < N; r++) toClear.add(r * N + c); });
    toClear.forEach((idx) => cells[idx].classList.add("clear"));

    const gained = total * total * 10;
    addScore(gained);
    showPop(total > 1 ? `Combo x${total}! +${gained}` : `+${gained}`);

    setTimeout(() => {
      toClear.forEach((idx) => { grid[Math.floor(idx / N)][idx % N] = null; });
      paintBoard();
      busy = false;
      afterMove();
    }, 300);
  }

  function afterMove() {
    if (pieces.every((p) => p === null)) {
      newPieces();
      paintTray();
    }
    const alive = pieces.filter(Boolean);
    if (alive.every((p) => !fits(p.m))) gameOver();
  }

  function showPop(text) {
    const el = $("pop");
    el.textContent = text;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  function gameOver() {
    $("final").textContent = score;
    let isBest = false;
    try { isBest = score > 0 && score >= (parseInt(localStorage.getItem("bp_best")) || 0) && score === best; } catch (_) {}
    $("newbest").classList.toggle("hidden", !isBest);
    setTimeout(() => $("over").classList.remove("hidden"), 400);
  }

  function start() {
    grid = Array.from({ length: N }, () => Array(N).fill(null));
    score = 0;
    busy = false;
    drag = null;
    $("over").classList.add("hidden");
    newPieces();
    paintBoard();
    paintTray();
    paintScore();
  }

  $("restart").addEventListener("click", start);
  $("again").addEventListener("click", start);
  window.addEventListener("resize", paintTray);
  window.addEventListener("orientationchange", () => setTimeout(paintTray, 150));

  start();
})();
