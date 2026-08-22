/* QuickTools - all processing happens in the browser */

(function () {
  'use strict';

  /* ---------------- Core helpers ---------------- */

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function fmtBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function baseName(name) {
    return name.replace(/\.[^/.]+$/, '');
  }

  function extFor(mime) {
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'bin';
  }

  function toast(msg, isErr) {
    const wrap = $('#toast-wrap');
    const el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  let busyCount = 0;
  function busy(text) {
    busyCount++;
    const ov = $('#busy-overlay');
    $('#busy-text').textContent = text || 'Working...';
    ov.hidden = false;
  }
  function setBusyText(text) {
    const el = $('#busy-text');
    if (el) el.textContent = text || 'Working...';
  }
  function setBusyPct(pct) {
    const bar = $('#busy-bar');
    const wrap = $('#busy-progress');
    if (!bar || !wrap) return;
    wrap.hidden = false;
    bar.style.width = Math.max(2, Math.min(100, Math.round(pct || 0))) + '%';
  }
  function unbusy() {
    busyCount = Math.max(0, busyCount - 1);
    if (busyCount === 0) {
      $('#busy-overlay').hidden = true;
      const wrap = $('#busy-progress');
      if (wrap) {
        wrap.hidden = true;
        $('#busy-bar').style.width = '0%';
      }
    }
  }

  function readBuffer(file) {
    return file.arrayBuffer();
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => reject(new Error('Could not read image: ' + file.name));
      img.src = url;
    });
  }

  function imageToCanvas(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return c;
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))),
        mime,
        quality
      );
    });
  }

  async function saveBlobsIndividually(blobs, delayMs) {
    const d = delayMs || 500;
    for (let i = 0; i < blobs.length; i++) {
      saveAs(blobs[i].blob, blobs[i].name);
      if (i < blobs.length - 1) await new Promise((r) => setTimeout(r, d));
    }
  }

  /* ---------------- PDF helpers ---------------- */

  async function loadPdfJs(buf) {
    const task = pdfjsLib.getDocument({ data: buf.slice(0) });
    return task.promise;
  }

  async function renderPageToCanvas(pdfJs, pageNum, scale, rotation) {
    const page = await pdfJs.getPage(pageNum);
    const vp1 = page.getViewport({ scale: 1 });
    const base = scale || Math.min(2, 2000 / Math.max(vp1.width, vp1.height));
    const viewport = page.getViewport({ scale: base, rotation: rotation || 0 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  async function thumbnailFor(pdfJs, pageNum, targetPx) {
    const page = await pdfJs.getPage(pageNum);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = targetPx / Math.max(vp1.width, vp1.height);
    return renderPageToCanvas(pdfJs, pageNum, scale, 0);
  }

  /* ---------------- Dropzone helper ---------------- */

  function setupDropzone(dzSel, inputSel, onFiles, acceptList) {
    const dz = $(dzSel);
    const input = $(inputSel);
    if (!dz || !input) return;

    dz.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files.length) onFiles(Array.from(input.files));
      input.value = '';
    });
    ['dragover', 'dragenter'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add('dragover');
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove('dragover');
      })
    );
    dz.addEventListener('drop', (e) => {
      let files = Array.from(e.dataTransfer.files);
      if (acceptList) files = files.filter((f) => acceptList.includes(f.type));
      if (files.length) onFiles(files);
      else toast('Unsupported file type', true);
    });
  }

  function renderChips(containerSel, items, opts) {
    const wrap = $(containerSel);
    wrap.innerHTML = '';
    items.forEach((it, idx) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      if (opts.numbers) chip.appendChild(mkEl('span', 'chip-num', String(idx + 1)));
      chip.appendChild(mkEl('span', 'chip-name', it.name));
      if (it.size != null) chip.appendChild(mkEl('span', 'chip-size', fmtBytes(it.size)));
      if (opts.meta) chip.appendChild(mkEl('span', 'chip-size', opts.meta(it)));
      const x = document.createElement('button');
      x.className = 'chip-x';
      x.textContent = '\u00d7';
      x.addEventListener('click', () => opts.onRemove && opts.onRemove(idx));
      chip.appendChild(x);
      if (opts.onUp && opts.onDown && items.length > 1) {
        const up = document.createElement('button');
        up.className = 'chip-x';
        up.textContent = '\u2191';
        up.addEventListener('click', () => opts.onUp(idx));
        const down = document.createElement('button');
        down.className = 'chip-x';
        down.textContent = '\u2193';
        down.addEventListener('click', () => opts.onDown(idx));
        chip.insertBefore(up, x);
        chip.insertBefore(down, x);
      }
      wrap.appendChild(chip);
    });
  }

  function mkEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  /* ---------------- Navigation ---------------- */

  function showView(name) {
    $$('.view').forEach((v) => v.classList.remove('active'));
    const target = $('#view-' + name);
    if (!target) return showView('home');
    target.classList.add('active');
    $$('.nav-link').forEach((b) =>
      b.classList.toggle('active', b.dataset.nav === name)
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-nav]');
    if (navBtn) showView(navBtn.dataset.nav);
  });

  /* ================================================================
     TOOL 1 - RESIZE IMAGE
     ================================================================ */

  const rz = {
    files: [],
    mode: 'percent',
    unit: 'px',
  };

  const IMG_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/svg+xml',
  ];

  setupDropzone('#rz-dropzone', '#rz-input', (files) => {
    rz.files.push(...files);
    renderResizeChips();
    syncResizeOptions();
  }, IMG_TYPES);

  function renderResizeChips() {
    renderChips('#rz-files', rz.files, {
      numbers: true,
      onRemove: (i) => {
        rz.files.splice(i, 1);
        renderResizeChips();
        syncResizeOptions();
      },
    });
  }

  function syncResizeOptions() {
    $('#rz-options').classList.toggle('show', rz.files.length > 0);
    $('#rz-run').disabled = rz.files.length === 0;
  }

  $('#rz-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    rz.mode = btn.dataset.mode;
    $$('#rz-mode .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    const v1 = $('#rz-value');
    const v2 = $('#rz-value2');
    const label = $('#rz-param-label');
    const unitRow = $('#rz-unit-row');
    if (rz.mode === 'percent') {
      label.textContent = 'Scale (%)';
      v1.value = 50;
      v2.style.display = 'none';
      unitRow.style.display = 'none';
    } else if (rz.mode === 'width') {
      label.textContent = 'Width';
      v1.value = rz.unit === 'px' ? 800 : rz.unit === 'in' ? 8 : rz.unit === 'cm' ? 21 : 800;
      v2.style.display = 'none';
      unitRow.style.display = '';
    } else if (rz.mode === 'height') {
      label.textContent = 'Height';
      v1.value = rz.unit === 'px' ? 800 : rz.unit === 'in' ? 8 : rz.unit === 'cm' ? 29 : 800;
      v2.style.display = 'none';
      unitRow.style.display = '';
    } else {
      label.textContent = 'Width \u00d7 Height';
      v1.value = rz.unit === 'px' ? 800 : rz.unit === 'in' ? 8 : rz.unit === 'cm' ? 21 : 800;
      v2.value = rz.unit === 'px' ? 600 : rz.unit === 'in' ? 6 : rz.unit === 'cm' ? 15 : 600;
      v2.style.display = 'inline-block';
      unitRow.style.display = '';
    }
  });

  $('#rz-unit').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    rz.unit = btn.dataset.unit;
    $$('#rz-unit .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
  });

  function unitToPx(v, unit) {
    if (unit === 'in') return v * 96;
    if (unit === 'cm') return v * 96 / 2.54;
    return v;
  }

  $('#rz-quality').addEventListener('input', () => {
    $('#rz-quality-val').textContent = $('#rz-quality').value + '%';
  });

  $('#rz-run').addEventListener('click', async () => {
    if (!rz.files.length) return;
    const mode = rz.mode;
    const value = Math.max(0.1, parseFloat($('#rz-value').value) || 0);
    const value2 = Math.max(0.1, parseFloat($('#rz-value2').value) || 0);
    const fmt = $('#rz-format').value;
    const quality = parseInt($('#rz-quality').value, 10) / 100;
    const vPx = unitToPx(value, rz.unit);
    const v2Px = unitToPx(value2, rz.unit);

    busy('Resizing ' + rz.files.length + ' image(s)...');
    try {
      const blobs = [];
      for (const f of rz.files) {
        const { img } = await loadImage(f);
        const baseW = img.naturalWidth;
        const baseH = img.naturalHeight;
        let w, h;
        if (mode === 'percent') {
          w = Math.max(1, Math.round((baseW * vPx) / 100));
          h = Math.max(1, Math.round((baseH * vPx) / 100));
        } else if (mode === 'width') {
          w = Math.max(1, Math.round(vPx));
          h = Math.max(1, Math.round((vPx / baseW) * baseH));
        } else if (mode === 'height') {
          h = Math.max(1, Math.round(vPx));
          w = Math.max(1, Math.round((vPx / baseH) * baseW));
        } else {
          w = Math.max(1, Math.round(vPx));
          h = Math.max(1, Math.round(v2Px));
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        let mime = fmt;
        if (mime === 'keep') {
          mime = ['image/jpeg', 'image/png', 'image/webp'].includes(f.type)
            ? f.type
            : 'image/png';
        }
        const blob = await canvasToBlob(canvas, mime, quality);
        blobs.push({ name: baseName(f.name) + '-' + w + 'x' + h + '.' + extFor(mime), blob });
      }
      await saveBlobsIndividually(blobs);
      toast('Downloaded ' + blobs.length + ' resized image(s)');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Resize failed', true);
    } finally {
      unbusy();
    }
  });

  /* ================================================================
     TOOL 2 - EDIT PDF
     ================================================================ */

  const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB

  function checkSize(files) {
    const big = files.find((f) => f.size > MAX_PDF_SIZE);
    if (big) {
      toast('"' + big.name + '" exceeds the 100 MB limit', true);
      return true;
    }
    return false;
  }

  const ed = {
    files: [], // {name, buf, lib, pdfJs, pageCount}
    pages: [], // {fi, pi, rot, textEdits}
    sel: -1,
  };

  function goEditor() {
    showView('editor');
    $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'edit'));
  }
  function goEditUpload() {
    showView('edit');
    $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'edit'));
  }

  async function addEditFiles(files) {
    const pdfs = files.filter((f) => f.type === 'application/pdf');
    if (!pdfs.length) return toast('Please add PDF files', true);
    if (checkSize(pdfs)) return;
    busy('Loading PDFs...');
    try {
      for (const f of pdfs) {
        const buf = await readBuffer(f);
        const lib = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
        const pdfJs = await loadPdfJs(buf);
        const entry = { name: f.name, buf, lib, pdfJs, pageCount: lib.getPageCount() };
        ed.files.push(entry);
        for (let p = 0; p < entry.pageCount; p++) {
          ed.pages.push({ fi: ed.files.length - 1, pi: p, rot: 0 });
        }
      }
      renderEditFileChips();
      resetVisualEditor();
      goEditor();
      buildEditGrid();
      toast('Loaded ' + pdfs.length + ' PDF(s)');
      openVisualEditor(0);
    } catch (err) {
      console.error(err);
      toast('Could not read one of the PDFs', true);
    } finally {
      unbusy();
    }
  }

  setupDropzone('#ed-dropzone', '#ed-input', addEditFiles);
  $('#ed-add').addEventListener('click', () => $('#ed-input').click());
  $('#ed-start').addEventListener('click', () => {
    if (!ed.files.length) return;
    goEditor();
    buildEditGrid();
    openVisualEditor(0);
  });
  $('#ed-back').addEventListener('click', () => {
    closeVisualEditor();
    goEditUpload();
    renderEditFileChips();
  });

  function renderEditFileChips() {
    renderChips('#ed-files', ed.files, {
      numbers: true,
      onRemove: (i) => {
        const oldFi = i;
        ed.files.splice(oldFi, 1);
        ed.pages = ed.pages.filter((p) => p.fi !== oldFi);
        ed.pages.forEach((p) => {
          if (p.fi > oldFi) p.fi--;
        });
        if (ed.sel >= ed.pages.length) ed.sel = ed.pages.length - 1;
        renderEditFileChips();
        buildEditGrid();
        if (!ed.files.length) {
          closeVisualEditor();
          goEditUpload();
        } else if (ve.curPage >= ed.pages.length) {
          openVisualEditor(Math.max(0, ed.pages.length - 1));
        }
      },
    });
    const has = ed.files.length > 0;
    $('#ed-start').disabled = !has;
    $('#ed-upload-options').classList.toggle('show', has);
  }

  function buildEditGrid() {
    const grid = $('#ed-pages');
    grid.innerHTML = '';
    if (!ed.pages.length) {
      grid.innerHTML = '<p class="empty-note">Add a PDF to start editing pages.</p>';
    }

    ed.pages.forEach((pg, idx) => {
      const card = mkEl('div', 'page-card' + (idx === ed.sel ? ' selected' : ''));
      card.dataset.idx = idx;
      const canvas = mkEl('canvas');
      card.appendChild(canvas);
      card.appendChild(mkEl('div', 'page-label', 'Page ' + (idx + 1)));
      const badge = mkEl('span', 'page-badge', String(idx + 1));
      if (pg.rot % 360 !== 0) {
        badge.className = 'page-badge rot';
        badge.textContent = 'R' + pg.rot;
      }
      if (pg.textEdits && pg.textEdits.length) {
        badge.className = 'page-badge rot';
        badge.textContent = 'T';
      }
      card.appendChild(badge);
      card.addEventListener('click', () => {
        ed.sel = idx;
        buildEditGrid();
      });
      grid.appendChild(card);
      const entry = ed.files[pg.fi];
      if (entry) {
        thumbnailFor(entry.pdfJs, pg.pi + 1, 120)
          .then((c) => {
            if (card.isConnected) canvas.replaceWith(c);
          })
          .catch(() => {});
      }
    });

    const has = ed.pages.length > 0;
    $('#ed-save').disabled = !has;
    $('#ed-text-open').disabled = !has;
    $('#ed-options').classList.toggle('show', has);
  }

  function getSel() {
    if (ed.sel < 0 || ed.sel >= ed.pages.length) return -1;
    return ed.sel;
  }

  $('#ed-rotate-l').addEventListener('click', () => {
    const i = getSel();
    if (i < 0) return toast('Select a page first', true);
    ed.pages[i].rot = (ed.pages[i].rot - 90 + 360) % 360;
    buildEditGrid();
  });
  $('#ed-rotate-r').addEventListener('click', () => {
    const i = getSel();
    if (i < 0) return toast('Select a page first', true);
    ed.pages[i].rot = (ed.pages[i].rot + 90) % 360;
    buildEditGrid();
  });
  $('#ed-delete').addEventListener('click', () => {
    const i = getSel();
    if (i < 0) return toast('Select a page first', true);
    ed.pages.splice(i, 1);
    ed.sel = Math.min(i, ed.pages.length - 1);
    buildEditGrid();
    if (ve.curPage === i) openVisualEditor(Math.max(0, ed.sel));
  });
  $('#ed-up').addEventListener('click', () => {
    const i = getSel();
    if (i <= 0) return;
    [ed.pages[i - 1], ed.pages[i]] = [ed.pages[i], ed.pages[i - 1]];
    ed.sel = i - 1;
    buildEditGrid();
  });
  $('#ed-down').addEventListener('click', () => {
    const i = getSel();
    if (i < 0 || i >= ed.pages.length - 1) return;
    [ed.pages[i + 1], ed.pages[i]] = [ed.pages[i], ed.pages[i + 1]];
    ed.sel = i + 1;
    buildEditGrid();
  });
  $('#ed-dup').addEventListener('click', () => {
    const i = getSel();
    if (i < 0) return;
    ed.pages.splice(i + 1, 0, { ...ed.pages[i] });
    buildEditGrid();
  });
  $('#ed-clear').addEventListener('click', () => {
    ed.files = [];
    ed.pages = [];
    ed.sel = -1;
    closeVisualEditor();
    goEditUpload();
    renderEditFileChips();
    buildEditGrid();
    toast('Cleared');
  });

  /* ================================================================
     VISUAL PDF EDITOR (text, shapes, move, undo/redo)
     ================================================================ */

  const ve = {
    curPage: -1,
    pages: {}, // key "fi_pi" -> { scale, elements: [] }
    els: [], // reference to current page elements array
    scale: 1,
    selId: null,
    activeTool: null,
    drag: null,
    drawing: null,
    editingId: null,
    history: [],
    histIdx: -1,
    nextId: 1,
    stage: null,
    canvas: null,
  };

  function resetVisualEditor() {
    ve.curPage = -1;
    ve.pages = {};
    ve.els = [];
    ve.selId = null;
    ve.activeTool = null;
    ve.drag = null;
    ve.drawing = null;
    ve.editingId = null;
    ve.history = [];
    ve.histIdx = -1;
    ve.nextId = 1;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function hexToRgb(hex) {
    let h = (hex || '#111111').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [
      Math.min(1, ((n >> 16) & 255) / 255),
      Math.min(1, ((n >> 8) & 255) / 255),
      Math.min(1, (n & 255) / 255),
    ];
  }

  function pageKey(pg) {
    return pg.fi + '_' + pg.pi;
  }

  function openVisualEditor(pageIdx) {
    if (!ed.pages.length) return;
    const target = pageIdx == null ? Math.max(0, ed.sel) : pageIdx;
    $('#visual-editor').hidden = false;
    document.body.classList.add('ve-open');
    veLoadPage(Math.min(Math.max(0, target), ed.pages.length - 1));
  }

  function closeVisualEditor() {
    $('#visual-editor').hidden = true;
    document.body.classList.remove('ve-open');
  }

  $('#ve-back').addEventListener('click', () => {
    closeVisualEditor();
    goEditor();
    buildEditGrid();
  });

  $('#ed-text-open').addEventListener('click', () => {
    const i = getSel();
    if (i < 0) return toast('Select a page first', true);
    openVisualEditor(i);
  });

  async function veLoadPage(idx) {
    if (idx < 0 || idx >= ed.pages.length) return;
    const pg = ed.pages[idx];
    const entry = ed.files[pg.fi];
    if (!entry) return;
    ve.curPage = idx;
    ve.selId = null;
    ve.editingId = null;
    ve.activeTool = null;
    updateToolbarActive();

    ve.stage = ve.stage || $('#ve-stage');
    ve.canvas = ve.canvas || $('#ve-canvas');

    const wrap = $('#ve-stage-wrap');
    const key = pageKey(pg);
    const page = await entry.pdfJs.getPage(pg.pi + 1);
    const vp1 = page.getViewport({ scale: 1 });
    let S;
    if (ve.pages[key]) {
      S = ve.pages[key].scale;
    } else {
      S = clamp((wrap.clientWidth - 24) / vp1.width, 0.4, 2);
      ve.pages[key] = { scale: S, elements: [] };
      snap();
    }
    const vp = page.getViewport({ scale: S });
    ve.canvas.width = Math.floor(vp.width);
    ve.canvas.height = Math.floor(vp.height);
    ve.scale = S;
    await page.render({ canvasContext: ve.canvas.getContext('2d'), viewport: vp }).promise;

    ve.els = ve.pages[key].elements;
    renderElements();
    updateThumbs();
    $('#ve-title').textContent =
      'Page ' + (idx + 1) + ' / ' + ed.pages.length + ' — ' + entry.name;
  }

  function updateThumbs() {
    const wrap = $('#ve-thumbs');
    wrap.innerHTML = '';
    ed.pages.forEach((pg, idx) => {
      const b = mkEl('button', 've-thumb' + (idx === ve.curPage ? ' active' : ''));
      b.textContent = 'Page ' + (idx + 1);
      b.addEventListener('click', () => veLoadPage(idx));
      wrap.appendChild(b);
    });
  }

  function getVeEl(id) {
    return (ve.els || []).find((e) => e.id === id);
  }

  function renderElements() {
    ve.stage.querySelectorAll('.ve-el').forEach((n) => n.remove());
    (ve.els || []).forEach((el) => {
      const d = document.createElement('div');
      d.className = 've-el' + (el.id === ve.selId ? ' selected' : '');
      d.dataset.id = el.id;
      if (el.type === 'text') {
        d.className += ' ve-el-text';
        d.contentEditable = 'false';
        d.spellcheck = false;
        d.textContent = el.text;
        d.addEventListener('dblclick', () => veStartEditText(el));
        d.addEventListener('input', () => {
          el.text = d.innerText;
        });
        d.addEventListener('blur', () => {
          if (ve.editingId === el.id) {
            ve.editingId = null;
            d.contentEditable = 'false';
            d.classList.remove('editing');
            snap();
          }
        });
      } else if (el.type === 'line') {
        d.className += ' ve-el-line';
      } else {
        d.className += ' ve-el-shape';
        if (el.type === 'ellipse') d.className += ' ve-el-ellipse';
      }
      ve.stage.appendChild(d);
      styleVeEl(d, el);
    });
  }

  function styleVeEl(d, el) {
    const S = ve.scale;
    if (el.type === 'text') {
      d.style.left = el.x * S + 'px';
      d.style.top = el.y * S + 'px';
      d.style.fontSize = el.sizePt * S + 'px';
      d.style.fontWeight = el.bold ? 'bold' : 'normal';
      d.style.fontStyle = el.italic ? 'italic' : 'normal';
      d.style.textDecoration = el.underline ? 'underline' : 'none';
      d.style.color = el.color;
      d.style.minHeight = el.sizePt * S * 1.2 + 'px';
    } else if (el.type === 'rect' || el.type === 'ellipse') {
      d.style.left = el.x * S + 'px';
      d.style.top = el.y * S + 'px';
      d.style.width = Math.max(2, el.w * S) + 'px';
      d.style.height = Math.max(2, el.h * S) + 'px';
      d.style.border = el.strokeWidth * S + 'px solid ' + el.color;
      if (el.fill) d.style.background = 'rgba(' + hexToRgb(el.color).map((c) => Math.round(c * 255)).join(',') + ',0.45)';
      if (el.type === 'ellipse') d.style.borderRadius = '50%';
    } else if (el.type === 'line') {
      const x1 = el.x1 * S, y1 = el.y1 * S, x2 = el.x2 * S, y2 = el.y2 * S;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      d.style.left = x1 + 'px';
      d.style.top = y1 + 'px';
      d.style.width = Math.max(1, len) + 'px';
      d.style.height = Math.max(1, el.strokeWidth * S) + 'px';
      d.style.transformOrigin = '0 0';
      d.style.transform = 'rotate(' + ang + 'rad)';
      d.style.background = el.color;
    }
  }

  function styleVeElById(id) {
    const d = ve.stage.querySelector('[data-id="' + id + '"]');
    const el = getVeEl(id);
    if (d && el) styleVeEl(d, el);
  }

  function selectVeEl(id) {
    ve.selId = id;
    ve.stage.querySelectorAll('.ve-el.selected').forEach((n) => n.classList.remove('selected'));
    const d = ve.stage.querySelector('[data-id="' + id + '"]');
    if (d) d.classList.add('selected');
    updateTextToolbar();
  }

  function deselectAll() {
    ve.selId = null;
    ve.stage.querySelectorAll('.ve-el.selected').forEach((n) => n.classList.remove('selected'));
    updateTextToolbar();
  }

  function updateTextToolbar() {
    const el = ve.selId != null ? getVeEl(ve.selId) : null;
    const isText = el && el.type === 'text';
    const isShape = el && (el.type === 'rect' || el.type === 'ellipse' || el.type === 'line');
    ['#ve-bold', '#ve-italic', '#ve-underline', '#ve-size'].forEach((s) => {
      $(s).disabled = !isText;
    });
    $('#ve-color').disabled = !(el && (isText || isShape));
    $('#ve-fill').disabled = !(el && (el.type === 'rect' || el.type === 'ellipse'));
    if (isText) {
      $('#ve-size').value = el.sizePt;
      $('#ve-color').value = el.color;
    } else if (isShape) {
      $('#ve-color').value = el.color;
      $('#ve-fill').checked = !!el.fill;
    }
  }

  function veStartEditText(el) {
    if (el.type !== 'text') return;
    snap();
    ve.editingId = el.id;
    const d = ve.stage.querySelector('[data-id="' + el.id + '"]');
    if (d) {
      d.contentEditable = 'true';
      d.classList.add('editing');
      d.focus();
      const range = document.createRange();
      range.selectNodeContents(d);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function veToPt(e) {
    const rect = ve.stage.getBoundingClientRect();
    const pw = ve.canvas.width / ve.scale;
    const ph = ve.canvas.height / ve.scale;
    return {
      x: clamp((e.clientX - rect.left) / ve.scale, 0, pw),
      y: clamp((e.clientY - rect.top) / ve.scale, 0, ph),
    };
  }

  function veCreateTextAt(e) {
    const pt = veToPt(e);
    snap();
    const el = {
      id: ve.nextId++,
      type: 'text',
      x: pt.x,
      y: pt.y,
      text: 'Text',
      sizePt: 16,
      bold: false,
      italic: false,
      underline: false,
      color: '#111111',
    };
    ve.els.push(el);
    renderElements();
    selectVeEl(el.id);
    veStartEditText(el);
  }

  function veStartDraw(e) {
    const pt = veToPt(e);
    snap();
    let el;
    if (ve.activeTool === 'line') {
      el = {
        id: ve.nextId++,
        type: 'line',
        x1: pt.x,
        y1: pt.y,
        x2: pt.x,
        y2: pt.y,
        color: $('#ve-color').value || '#111111',
        strokeWidth: 1.5,
      };
    } else {
      el = {
        id: ve.nextId++,
        type: ve.activeTool,
        x: pt.x,
        y: pt.y,
        w: 0,
        h: 0,
        color: $('#ve-color').value || '#111111',
        fill: false,
        strokeWidth: 1.5,
      };
    }
    ve.els.push(el);
    renderElements();
    ve.drawing = { id: el.id, x0: pt.x, y0: pt.y };
  }

  function veRemoveEl(id, pushSnap) {
    const i = (ve.els || []).findIndex((e) => e.id === id);
    if (i < 0) return;
    if (pushSnap) snap();
    ve.els.splice(i, 1);
    ve.selId = null;
    renderElements();
    updateTextToolbar();
  }

  /* ---- history ---- */

  function snap() {
    ve.history = ve.history.slice(0, ve.histIdx + 1);
    ve.history.push(JSON.stringify(ve.pages));
    if (ve.history.length > 80) ve.history.shift();
    ve.histIdx = ve.history.length - 1;
    updateUndoRedo();
  }

  function updateUndoRedo() {
    $('#ve-undo').disabled = ve.histIdx <= 0;
    $('#ve-redo').disabled = ve.histIdx >= ve.history.length - 1;
  }

  function restoreHistory() {
    ve.pages = JSON.parse(ve.history[ve.histIdx]);
    if (ve.curPage >= 0 && ve.curPage < ed.pages.length) {
      const key = pageKey(ed.pages[ve.curPage]);
      ve.els = ve.pages[key] ? ve.pages[key].elements : [];
      ve.scale = ve.pages[key] ? ve.pages[key].scale : ve.scale;
    } else {
      ve.els = [];
    }
    ve.selId = null;
    ve.editingId = null;
    renderElements();
    updateUndoRedo();
  }

  function veUndo() {
    if (ve.histIdx <= 0) return;
    ve.histIdx--;
    restoreHistory();
  }

  function veRedo() {
    if (ve.histIdx >= ve.history.length - 1) return;
    ve.histIdx++;
    restoreHistory();
  }

  $('#ve-undo').addEventListener('click', veUndo);
  $('#ve-redo').addEventListener('click', veRedo);
  $('#ve-delete').addEventListener('click', () => {
    if (ve.selId != null) veRemoveEl(ve.selId, true);
  });

  /* ---- toolbar ---- */

  $$('#ve-toolbar .ve-tool[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (ve.activeTool === btn.dataset.tool) ve.activeTool = null;
      else {
        ve.activeTool = btn.dataset.tool;
        deselectAll();
      }
      updateToolbarActive();
    });
  });

  function updateToolbarActive() {
    $$('#ve-toolbar .ve-tool[data-tool]').forEach((b) =>
      b.classList.toggle('active', b.dataset.tool === ve.activeTool)
    );
    if (ve.stage) ve.stage.style.cursor = ve.activeTool ? 'crosshair' : 'default';
  }

  function applyTextStyle(mutate) {
    const el = ve.selId != null ? getVeEl(ve.selId) : null;
    if (!el || el.type !== 'text') return;
    snap();
    mutate(el);
    renderElements();
    updateTextToolbar();
  }

  $('#ve-bold').addEventListener('click', () => applyTextStyle((el) => (el.bold = !el.bold)));
  $('#ve-italic').addEventListener('click', () => applyTextStyle((el) => (el.italic = !el.italic)));
  $('#ve-underline').addEventListener('click', () => applyTextStyle((el) => (el.underline = !el.underline)));

  $('#ve-size').addEventListener('change', () => {
    const el = ve.selId != null ? getVeEl(ve.selId) : null;
    if (!el || el.type !== 'text') return;
    snap();
    el.sizePt = clamp(parseFloat($('#ve-size').value) || 16, 6, 200);
    renderElements();
  });

  $('#ve-color').addEventListener('input', () => {
    const el = ve.selId != null ? getVeEl(ve.selId) : null;
    if (!el) return;
    snap();
    el.color = $('#ve-color').value;
    renderElements();
  });

  $('#ve-fill').addEventListener('change', () => {
    const el = ve.selId != null ? getVeEl(ve.selId) : null;
    if (!el || (el.type !== 'rect' && el.type !== 'ellipse')) return;
    snap();
    el.fill = $('#ve-fill').checked;
    renderElements();
  });

  /* ---- stage pointer interactions ---- */

  ve.stage = $('#ve-stage');
  ve.canvas = $('#ve-canvas');

  ve.stage.addEventListener('pointerdown', (e) => {
    const div = e.target.closest('.ve-el');
    if (div) {
      const id = Number(div.dataset.id);
      const el = getVeEl(id);
      if (!el) return;
      if (el.type === 'text' && ve.editingId === el.id) return;
      selectVeEl(id);
      if (el.type === 'text' && ve.editingId === el.id) return;
      snap();
      ve.drag = { id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y };
      e.preventDefault();
      return;
    }
    if (ve.activeTool) {
      if (ve.activeTool === 'text') veCreateTextAt(e);
      else veStartDraw(e);
      return;
    }
    deselectAll();
  });

  ve.stage.addEventListener('pointermove', (e) => {
    if (ve.drag) {
      const el = getVeEl(ve.drag.id);
      if (el) {
        const pw = ve.canvas.width / ve.scale;
        const ph = ve.canvas.height / ve.scale;
        const dx = (e.clientX - ve.drag.sx) / ve.scale;
        const dy = (e.clientY - ve.drag.sy) / ve.scale;
        if (el.type === 'line') {
          const ow = el.x2 - el.x1;
          const oh = el.y2 - el.y1;
          el.x1 = clamp(ve.drag.ox + dx, 0, pw);
          el.y1 = clamp(ve.drag.oy + dy, 0, ph);
          el.x2 = clamp(ve.drag.ox + dx + ow, 0, pw);
          el.y2 = clamp(ve.drag.oy + dy + oh, 0, ph);
        } else {
          el.x = clamp(ve.drag.ox + dx, 0, pw);
          el.y = clamp(ve.drag.oy + dy, 0, ph);
        }
        styleVeElById(el.id);
      }
      return;
    }
    if (ve.drawing) {
      const el = getVeEl(ve.drawing.id);
      if (el) {
        const pt = veToPt(e);
        if (el.type === 'line') {
          el.x2 = pt.x;
          el.y2 = pt.y;
        } else {
          const x = Math.min(ve.drawing.x0, pt.x);
          const y = Math.min(ve.drawing.y0, pt.y);
          el.x = x;
          el.y = y;
          el.w = Math.abs(pt.x - ve.drawing.x0);
          el.h = Math.abs(pt.y - ve.drawing.y0);
        }
        styleVeElById(el.id);
      }
    }
  });

  ve.stage.addEventListener('pointerup', (e) => {
    if (ve.drag) {
      ve.drag = null;
      return;
    }
    if (ve.drawing) {
      const el = getVeEl(ve.drawing.id);
      if (el) {
        const tooSmall =
          el.type === 'line'
            ? Math.hypot(el.x2 - el.x1, el.y2 - el.y1) < 2
            : el.w < 2 || el.h < 2;
        if (tooSmall) veRemoveEl(el.id, false);
        else selectVeEl(el.id);
      }
      ve.drawing = null;
    }
  });

  document.addEventListener('keydown', (e) => {
    if ($('#visual-editor').hidden) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) veRedo();
      else veUndo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      veRedo();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !ve.editingId) {
      if (ve.selId != null) {
        e.preventDefault();
        veRemoveEl(ve.selId, true);
      }
    }
  });

  /* ---- save (shared by editor + workspace) ---- */

  async function drawVeElOnPage(out, page, el, pw, ph, fonts) {
    const C = PDFLib.rgb.apply(null, hexToRgb(el.color || '#111111'));
    try {
      if (el.type === 'text') {
        let key = 'H';
        let std = PDFLib.StandardFonts.Helvetica;
        if (el.bold && el.italic) {
          key = 'HBO';
          std = PDFLib.StandardFonts.HelveticaBoldOblique;
        } else if (el.bold) {
          key = 'HB';
          std = PDFLib.StandardFonts.HelveticaBold;
        } else if (el.italic) {
          key = 'HO';
          std = PDFLib.StandardFonts.HelveticaOblique;
        }
        if (!fonts[key]) fonts[key] = await out.embedFont(std);
        const size = Math.max(1, el.sizePt);
        const yBase = ph - el.y - size * 0.8;
        page.drawText(el.text || '', { x: el.x, y: yBase, size, font: fonts[key], color: C });
        if (el.underline) {
          const w = fonts[key].widthOfTextAtSize(el.text || '', size);
          page.drawLine({
            start: { x: el.x, y: yBase - size * 0.1 },
            end: { x: el.x + w, y: yBase - size * 0.1 },
            thickness: Math.max(0.6, size * 0.05),
            color: C,
          });
        }
      } else if (el.type === 'rect') {
        page.drawRectangle({
          x: el.x,
          y: ph - el.y - el.h,
          width: el.w,
          height: el.h,
          borderColor: C,
          borderWidth: Math.max(0.5, el.strokeWidth),
          color: el.fill ? C : undefined,
          opacity: el.fill ? 0.45 : 1,
        });
      } else if (el.type === 'ellipse') {
        page.drawEllipse({
          x: el.x + el.w / 2,
          y: ph - el.y - el.h / 2,
          xScale: Math.max(0.1, el.w / 2),
          yScale: Math.max(0.1, el.h / 2),
          borderColor: C,
          borderWidth: Math.max(0.5, el.strokeWidth),
          color: el.fill ? C : undefined,
          opacity: el.fill ? 0.45 : 1,
        });
      } else if (el.type === 'line') {
        page.drawLine({
          start: { x: el.x1, y: ph - el.y1 },
          end: { x: el.x2, y: ph - el.y2 },
          thickness: Math.max(0.6, el.strokeWidth),
          color: C,
        });
      }
    } catch (err) {
      console.warn('Skipped an element', err);
    }
  }

  async function savePdf() {
    busy('Building PDF...');
    try {
      const out = await PDFLib.PDFDocument.create();
      const fonts = {};
      for (let i = 0; i < ed.pages.length; i++) {
        const pg = ed.pages[i];
        const src = ed.files[pg.fi].lib;
        const [cp] = await out.copyPages(src, [pg.pi]);
        if (pg.rot % 360 !== 0) {
          const cur = cp.getRotation().angle;
          cp.setRotation(PDFLib.degrees((cur + pg.rot) % 360));
        }
        const pw = cp.getWidth();
        const ph = cp.getHeight();
        const st = ve.pages[pageKey(pg)];
        if (st && st.elements && st.elements.length) {
          for (const el of st.elements) await drawVeElOnPage(out, cp, el, pw, ph, fonts);
        }
        out.addPage(cp);
      }
      const bytes = await out.save();
      saveAs(new Blob([bytes], { type: 'application/pdf' }), 'edited.pdf');
      toast('PDF saved');
    } catch (err) {
      console.error(err);
      toast('Save failed', true);
    } finally {
      unbusy();
    }
  }

  $('#ve-save').addEventListener('click', savePdf);
  $('#ed-save').addEventListener('click', savePdf);



    /* ================================================================
     TOOL 3 - MERGE PDF
     ================================================================ */

  const mg = {
    files: [], // {name, size, file, buf}
  };

  setupDropzone('#mg-dropzone', '#mg-input', (files) => {
    const pdfs = files.filter((f) => f.type === 'application/pdf');
    if (!pdfs.length) return toast('Please add PDF files', true);
    mg.files.push(...pdfs.map((f) => ({ name: f.name, size: f.size, file: f, buf: null })));
    renderMergeChips();
  });

  function renderMergeChips() {
    renderChips('#mg-files', mg.files, {
      numbers: true,
      onRemove: (i) => {
        mg.files.splice(i, 1);
        renderMergeChips();
      },
      onUp: (i) => {
        if (i === 0) return;
        [mg.files[i - 1], mg.files[i]] = [mg.files[i], mg.files[i - 1]];
        renderMergeChips();
      },
      onDown: (i) => {
        if (i >= mg.files.length - 1) return;
        [mg.files[i + 1], mg.files[i]] = [mg.files[i], mg.files[i + 1]];
        renderMergeChips();
      },
    });
    $('#mg-run').disabled = mg.files.length < 2;
    $('#mg-options').classList.toggle('show', mg.files.length > 0);
  }

  $('#mg-run').addEventListener('click', async () => {
    if (mg.files.length < 2) return toast('Add at least 2 PDFs', true);
    busy('Merging PDFs...');
    try {
      const out = await PDFLib.PDFDocument.create();
      for (const item of mg.files) {
        const buf = item.buf || (item.buf = await item.file.arrayBuffer());
        const src = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      const bytes = await out.save();
      saveAs(new Blob([bytes], { type: 'application/pdf' }), 'merged.pdf');
      toast('Merged ' + mg.files.length + ' PDFs');
    } catch (err) {
      console.error(err);
      toast('Merge failed', true);
    } finally {
      unbusy();
    }
  });

  /* ================================================================
     TOOL 4 - JPG TO PDF
     ================================================================ */

  const j2p = {
    files: [],
    orient: 'auto',
  };

  setupDropzone('#j2p-dropzone', '#j2p-input', (files) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return toast('Please add image files', true);
    j2p.files.push(...imgs);
    renderJ2pChips();
  }, IMG_TYPES);

  function renderJ2pChips() {
    renderChips('#j2p-files', j2p.files, {
      numbers: true,
      onRemove: (i) => {
        j2p.files.splice(i, 1);
        renderJ2pChips();
      },
    });
    $('#j2p-options').classList.toggle('show', j2p.files.length > 0);
    $('#j2p-run').disabled = j2p.files.length === 0;
  }

  $('#j2p-orient').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    j2p.orient = btn.dataset.orient;
    $$('#j2p-orient .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
  });

  $('#j2p-margin').addEventListener('input', () => {
    $('#j2p-margin-val').textContent = $('#j2p-margin').value + ' pt';
  });

  $('#j2p-run').addEventListener('click', async () => {
    if (!j2p.files.length) return;
    const sizeOpt = $('#j2p-size').value;
    const margin = parseInt($('#j2p-margin').value, 10);

    busy('Creating PDF from ' + j2p.files.length + ' image(s)...');
    try {
      const pdf = await PDFLib.PDFDocument.create();
      const pageSizes = { A4: [595.28, 841.89], LETTER: [612, 792], A3: [841.89, 1191.18] };

      for (const f of j2p.files) {
        let embedded;
        if (f.type === 'image/jpeg') {
          embedded = await pdf.embedJpg(new Uint8Array(await f.arrayBuffer()));
        } else if (f.type === 'image/png') {
          embedded = await pdf.embedPng(new Uint8Array(await f.arrayBuffer()));
        } else {
          const { img } = await loadImage(f);
          const canvas = imageToCanvas(img);
          const png = await canvasToBlob(canvas, 'image/png');
          embedded = await pdf.embedPng(new Uint8Array(await png.arrayBuffer()));
        }
        const iw = embedded.width;
        const ih = embedded.height;

        let pw, ph;
        if (sizeOpt === 'fit') {
          pw = Math.min(Math.max(iw, 50), 1440);
          ph = Math.min(Math.max(ih, 50), 1440);
        } else {
          [pw, ph] = pageSizes[sizeOpt] || pageSizes.A4;
        }

        if (j2p.orient === 'portrait' && pw > ph) [pw, ph] = [ph, pw];
        if (j2p.orient === 'landscape' && ph > pw) [pw, ph] = [ph, pw];

        const page = pdf.addPage([pw, ph]);
        const availW = pw - margin * 2;
        const availH = ph - margin * 2;
        const scale = Math.min(availW / iw, availH / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        page.drawImage(embedded, {
          x: (pw - dw) / 2,
          y: (ph - dh) / 2,
          width: dw,
          height: dh,
        });
      }

      const bytes = await pdf.save();
      saveAs(new Blob([bytes], { type: 'application/pdf' }), 'images.pdf');
      toast('PDF created');
    } catch (err) {
      console.error(err);
      toast('Conversion failed', true);
    } finally {
      unbusy();
    }
  });

  /* ================================================================
     TOOL 5 - PDF TO JPG
     ================================================================ */

  const p2j = {
    file: null,
    pdfJs: null,
    pageCount: 0,
  };

  setupDropzone('#p2j-dropzone', '#p2j-input', async (files) => {
    const pdf = files.find((f) => f.type === 'application/pdf');
    if (!pdf) return toast('Please add a PDF file', true);
    busy('Reading PDF...');
    try {
      const buf = await readBuffer(pdf);
      const doc = await loadPdfJs(buf);
      p2j.file = pdf;
      p2j.pdfJs = doc;
      p2j.pageCount = doc.numPages;
      renderChips('#p2j-files', [pdf], {
        numbers: false,
        onRemove: () => {
          p2j.file = null;
          p2j.pdfJs = null;
          renderChips('#p2j-files', [], {});
          $('#p2j-run').disabled = true;
          $('#p2j-options').classList.remove('show');
          $('#p2j-result').innerHTML = '';
        },
      });
      $('#p2j-run').disabled = false;
      $('#p2j-options').classList.add('show');
      $('#p2j-result').innerHTML = '';
    } catch (err) {
      console.error(err);
      toast('Could not read PDF', true);
    } finally {
      unbusy();
    }
  });

  $('#p2j-quality').addEventListener('input', () => {
    $('#p2j-quality-val').textContent = $('#p2j-quality').value + '%';
  });

  $('#p2j-run').addEventListener('click', async () => {
    if (!p2j.pdfJs) return;
    const dpi = parseInt($('#p2j-dpi').value, 10);
    const scale = dpi / 72;
    const quality = parseInt($('#p2j-quality').value, 10) / 100;
    const base = baseName(p2j.file.name);

    busy('Converting ' + p2j.pageCount + ' page(s)...');
    try {
      const blobs = [];
      for (let p = 1; p <= p2j.pageCount; p++) {
        const canvas = await renderPageToCanvas(p2j.pdfJs, p, scale, 0);
        const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        blobs.push({ name: base + '-page-' + p + '.jpg', blob });
      }

      await saveBlobsIndividually(blobs);

      const grid = $('#p2j-result');
      grid.innerHTML = '';
      for (const { name, blob } of blobs) {
        const item = mkEl('div', 'preview-item');
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        img.alt = name;
        item.appendChild(img);
        item.appendChild(mkEl('div', 'pv-name', name));
        const link = mkEl('a', null, 'Download');
        link.href = img.src;
        link.download = name;
        item.appendChild(link);
        grid.appendChild(item);
      }
      toast('Converted ' + p2j.pageCount + ' page(s)');
    } catch (err) {
      console.error(err);
      toast('Conversion failed', true);
    } finally {
      unbusy();
    }
  });

  /* ================================================================
     TOOL 6 - COMPRESS PDF
     ================================================================ */

  const cp = {
    files: [], // {name, size, buf}
    level: 'fast',
  };

  setupDropzone('#cp-dropzone', '#cp-input', async (files) => {
    const pdfs = files.filter((f) => f.type === 'application/pdf');
    if (!pdfs.length) return toast('Please add PDF files', true);
    if (checkSize(pdfs)) return;
    busy('Reading PDFs...');
    try {
      for (const f of pdfs) {
        if (cp.files.some((x) => x.name === f.name)) continue;
        cp.files.push({ name: f.name, size: f.size, buf: await readBuffer(f) });
      }
      renderCompressChips();
    } catch (err) {
      toast('Could not read a PDF', true);
    } finally {
      unbusy();
    }
  });

  function renderCompressChips() {
    renderChips('#cp-files', cp.files, {
      numbers: true,
      onRemove: (i) => {
        cp.files.splice(i, 1);
        renderCompressChips();
      },
    });
    $('#cp-run').disabled = cp.files.length === 0;
    $('#cp-options').classList.toggle('show', cp.files.length > 0);
  }

  $('#cp-level').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    cp.level = btn.dataset.level;
    $$('#cp-level .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
  });
  const CP_LEVELS = {
    fast: { quality: 0.5 },
    balanced: { quality: 0.4 },
    strong: { quality: 0.3 },
    extreme: { quality: 0.12, maxDim: 1800 },
  };

  $('#cp-run').addEventListener('click', async () => {
    if (!cp.files.length) return;
    busy('Compressing...');
    const results = [];
    try {
      const level = CP_LEVELS[cp.level] || CP_LEVELS.strong;
      for (let fi = 0; fi < cp.files.length; fi++) {
        const item = cp.files[fi];
        setBusyText(
          'Compressing "' + item.name + '" (' + (fi + 1) + '/' + cp.files.length + ')...'
        );
        const outBytes = await smartCompress(
          item.buf,
          level,
          (done, total) => {
            if (total > 0) {
              const pct = (fi / cp.files.length) * 100 + (done / total) * (100 / cp.files.length);
              setBusyPct(pct);
            }
            setBusyText(
              'Compressing "' + item.name + '" images ' + done + '/' + total + '...'
            );
          }
        );
        results.push({
          name: item.name,
          before: item.size,
          after: outBytes.length,
          bytes: outBytes,
        });
      }
      const downloads = results.map((r) => ({
        name: r.name.replace(/\.pdf$/i, '') + '-compressed.pdf',
        blob: new Blob([r.bytes], { type: 'application/pdf' }),
      }));
      await saveBlobsIndividually(downloads, 700);
      renderCompressResults(results);
    } catch (err) {
      console.error(err);
      toast('Compression failed', true);
    } finally {
      unbusy();
    }
  });

  async function smartCompress(buf, level, onProgress) {
    const doc = await PDFLib.PDFDocument.load(buf, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    try {
      doc.setProducer('');
      doc.setCreator('');
    } catch (e) {
      /* ignore metadata errors */
    }

    const images = [];
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFLib.PDFRawStream)) continue;
      const dict = obj.dict;
      const subtype = dict && dict.lookup(PDFLib.PDFName.of('Subtype'));
      if (subtype && String(subtype) === '/Image') images.push(obj);
    }

    let done = 0;
    for (const stream of images) {
      try {
        await recompressImage(stream, level);
      } catch (e) {
        /* keep the image as-is */
      }
      done++;
      if (onProgress) onProgress(done, images.length);
    }

    const bytes = await doc.save({ useObjectStreams: true });
    return bytes.length < buf.byteLength ? bytes : new Uint8Array(buf);
  }

  function isDctDecode(dict) {
    const filter = dict.lookup(PDFLib.PDFName.of('Filter'));
    if (filter instanceof PDFLib.PDFArray) {
      return filter.asArray().some((f) => String(f) === '/DCTDecode');
    }
    return !!filter && String(filter) === '/DCTDecode';
  }

  async function recompressImage(stream, level) {
    const dict = stream.dict;
    if (!dict) return;
    const mask = dict.lookup(PDFLib.PDFName.of('ImageMask'));
    if (mask instanceof PDFLib.PDFBool && mask.value === true) return;
    if (dict.get(PDFLib.PDFName.of('DecodeParms'))) return;
    if (!isDctDecode(dict)) return;

    const cs = dict.lookup(PDFLib.PDFName.of('ColorSpace'));
    if (cs instanceof PDFLib.PDFArray) return;
    if (cs instanceof PDFLib.PDFName) {
      const s = String(cs);
      if (s === '/DeviceCMYK' || s === '/CalRGB' || s === '/CalGray' || s === '/Indexed') return;
    }

    const orig = stream.getContents();
    if (!orig || orig.length < 4096) return;

    let bmp;
    try {
      bmp = await decodeJpeg(orig);
    } catch (e) {
      return;
    }
    const w = bmp.naturalWidth || bmp.width;
    const h = bmp.naturalHeight || bmp.height;
    if (!w || !h || w > 16000 || h > 16000 || w * h > 100000000) {
      if (bmp.close) bmp.close();
      return;
    }

    let cw = w;
    let ch = h;
    const maxDim = level.maxDim;
    if (maxDim && Math.max(w, h) > maxDim) {
      const scale = maxDim / Math.max(w, h);
      cw = Math.max(1, Math.round(w * scale));
      ch = Math.max(1, Math.round(h * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, cw, ch);
    if (bmp.close) bmp.close();

    const blob = await canvasToBlob(canvas, 'image/jpeg', level.quality);
    if (!blob) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length >= orig.length) return;

    stream.contents = bytes;
    dict.set(PDFLib.PDFName.of('Filter'), PDFLib.PDFName.of('DCTDecode'));
    dict.set(PDFLib.PDFName.of('ColorSpace'), PDFLib.PDFName.of('DeviceRGB'));
    dict.set(PDFLib.PDFName.of('BitsPerComponent'), PDFLib.PDFNumber.of(8));
    dict.delete(PDFLib.PDFName.of('DecodeParms'));
  }

  async function decodeJpeg(bytes) {
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    try {
      if ('createImageBitmap' in window) return await createImageBitmap(blob);
    } catch (e) {
      /* fall through to Image element */
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not decode JPEG'));
      };
      img.src = url;
    });
  }

  function renderCompressResults(results) {
    const wrap = $('#cp-result');
    wrap.innerHTML = '';
    results.forEach((r) => {
      const item = mkEl('div', 'cr-item');
      const info = mkEl('div', 'cr-info');
      info.appendChild(mkEl('div', 'cr-name', r.name));
      info.appendChild(mkEl('div', 'cr-meta', fmtBytes(r.before) + ' \u2192 ' + fmtBytes(r.after)));
      const bar = mkEl('div', 'cr-bar');
      const fill = mkEl('div', 'cr-bar-fill');
      fill.style.width = '100%';
      if (r.before > 0 && r.after < r.before) {
        fill.style.width = Math.max(4, Math.round((r.after / r.before) * 100)) + '%';
      }
      bar.appendChild(fill);
      info.appendChild(bar);
      item.appendChild(info);
      const pct = r.before > 0 ? Math.round(((r.before - r.after) / r.before) * 100) : 0;
      const p = mkEl('div', 'cr-pct' + (pct > 0 ? ' smaller' : ' bigger'));
      p.textContent = pct > 0 ? '-' + pct + '%' : pct === 0 ? '0%' : 'larger';
      item.appendChild(p);
      const dl = document.createElement('button');
      dl.className = 'btn small';
      dl.textContent = 'Download';
      dl.addEventListener('click', () =>
        saveAs(new Blob([r.bytes], { type: 'application/pdf' }), r.name)
      );
      item.appendChild(dl);
      wrap.appendChild(item);
    });
  }

  /* ================================================================
     TOOL 7 - SIGN PDF
     ================================================================ */

  const sg = {
    files: [], // {name, size, file}
    method: 'draw',
    sig: null,
    uploadCanvas: null,
    buf: null,
    lib: null,
    pdfJs: null,
    pageCount: 0,
    pages: [], // per-page normalized sig pos {x, y, w, h} or null
    curPage: 0,
    scale: 1,
    drag: null,
    resize: null,
  };

  function canvasPngBytes(canvas) {
    const b64 = canvas.toDataURL('image/png').split(',')[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function sgResetUpload() {
    sg.files = [];
    sg.buf = null;
    sg.lib = null;
    sg.pdfJs = null;
    sg.pageCount = 0;
    sg.sig = null;
    sg.pages = [];
    sg.curPage = 0;
    renderChips('#sg-files', [], {});
    $('#sg-upload-options').classList.remove('show');
  }

  setupDropzone('#sg-dropzone', '#sg-input', async (files) => {
    const pdf = files.find((f) => f.type === 'application/pdf');
    if (!pdf) return toast('Please add a PDF file', true);
    if (checkSize([pdf])) return;
    busy('Reading PDF...');
    try {
      const buf = await readBuffer(pdf);
      sg.buf = buf;
      sg.lib = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
      sg.pdfJs = await loadPdfJs(buf);
      sg.pageCount = sg.lib.getPageCount();
      sg.files = [pdf];
      sg.pages = Array.from({ length: sg.pageCount }, () => null);
      sg.curPage = 0;
      renderChips('#sg-files', sg.files, {
        numbers: false,
        onRemove: () => sgResetUpload(),
      });
      showView('sign-work');
      $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'sign'));
      buildSignThumbs();
      await loadSignPage(0);
    } catch (err) {
      console.error(err);
      toast('Could not read the PDF', true);
    } finally {
      unbusy();
    }
  });

  $('#sg-upload-remove').addEventListener('click', sgResetUpload);

  $('#sg-start').addEventListener('click', () => {
    if (!sg.files.length) return toast('Add a PDF first', true);
    sg.pages = Array.from({ length: sg.pageCount }, () => null);
    sg.curPage = 0;
    showView('sign-work');
    $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'sign'));
    buildSignThumbs();
    loadSignPage(0);
  });

  $('#sg-back').addEventListener('click', () => {
    showView('sign');
    $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'sign'));
    renderChips('#sg-files', sg.files, {
      numbers: false,
      onRemove: () => sgResetUpload(),
    });
    $('#sg-upload-options').classList.add('show');
  });

  function buildSignThumbs() {
    const wrap = $('#sg-thumbs');
    wrap.innerHTML = '';
    for (let i = 0; i < sg.pageCount; i++) {
      const b = mkEl('button', 'sw-thumb' + (i === sg.curPage ? ' active' : ''));
      b.textContent = 'Page ' + (i + 1);
      b.dataset.idx = i;
      b.addEventListener('click', () => {
        sg.curPage = i;
        $$('#sg-thumbs .sw-thumb').forEach((x) => x.classList.toggle('active', +x.dataset.idx === i));
        loadSignPage(i);
      });
      wrap.appendChild(b);
    }
  }

  async function loadSignPage(idx) {
    if (idx < 0 || idx >= sg.pageCount) return;
    const page = await sg.pdfJs.getPage(idx + 1);
    const vp1 = page.getViewport({ scale: 1 });
    const wrap = $('#sg-stage-wrap');
    const targetW = Math.min(680, Math.max(300, (wrap.clientWidth || 680) - 40));
    const scale = targetW / vp1.width;
    const vp = page.getViewport({ scale });
    const canvas = $('#sg-stage-canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    sg.scale = scale;
    sg.stagePageW = vp1.width;
    sg.stagePageH = vp1.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    drawSignOverlay();
  }

  function sgPosToStyle(el, pos) {
    const canvas = $('#sg-stage-canvas');
    el.style.width = pos.w * canvas.width + 'px';
    el.style.height = pos.h * canvas.height + 'px';
    el.style.left = pos.x * canvas.width + 'px';
    el.style.top = pos.y * canvas.height + 'px';
  }

  function drawSignOverlay() {
    const stage = $('#sg-stage');
    let el = stage.querySelector('.sw-sig');
    const pos = sg.pages[sg.curPage];
    stage.querySelectorAll('.sw-hint').forEach((n) => n.remove());
    if (!pos || !sg.sig) {
      if (el) el.remove();
    } else {
      if (!el) {
        el = mkEl('div', 'sw-sig');
        el.style.backgroundSize = '100% 100%';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';

        const rm = mkEl('button', 'sw-sig-rm');
        rm.type = 'button';
        rm.title = 'Remove signature';
        rm.innerHTML = '&times;';
        rm.addEventListener('pointerdown', (e) => e.stopPropagation());
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          sg.pages[sg.curPage] = null;
          drawSignOverlay();
          updateSignThumbs();
          toast('Removed signature from page ' + (sg.curPage + 1));
        });

        const corners = ['nw', 'ne', 'sw', 'se'];
        corners.forEach((c) => {
          const hd = mkEl('span', 'sw-sig-hd sw-sig-hd-' + c);
          hd.title = 'Drag to resize';
          hd.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const p = sg.pages[sg.curPage];
            if (!p) return;
            sg.resize = {
              sx: e.clientX,
              sy: e.clientY,
              w: p.w,
              h: p.h,
              ox: p.x,
              oy: p.y,
              pos: p,
              corner: c,
            };
            hd.setPointerCapture(e.pointerId);
          });
          el.appendChild(hd);
        });

        el.appendChild(rm);
        stage.appendChild(el);
      }
      el.style.backgroundImage = 'url(' + sg.sig.canvas.toDataURL('image/png') + ')';
      sgPosToStyle(el, pos);
    }
    updateDragChip();
  }

  function updateDragChip() {
    const chip = $('#sg-drag-chip');
    const inner = chip.querySelector('span');
    if (sg.sig) {
      chip.style.backgroundImage = 'url(' + sg.sig.canvas.toDataURL('image/png') + ')';
      chip.style.backgroundSize = 'contain';
      chip.style.backgroundRepeat = 'no-repeat';
      chip.style.backgroundPosition = 'center';
      chip.classList.add('has-sig');
      inner.textContent = 'Drag me onto the page';
    } else {
      chip.style.backgroundImage = '';
      chip.classList.remove('has-sig');
      inner.textContent = 'Drag me onto the page';
    }
  }

  $('#sg-stage').addEventListener('pointerdown', (e) => {
    const div = e.target.closest('.sw-sig');
    if (!div) return;
    const pos = sg.pages[sg.curPage];
    if (!pos) return;
    e.preventDefault();
    sg.drag = {
      sx: e.clientX,
      sy: e.clientY,
      ox: pos.x,
      oy: pos.y,
    };
    div.setPointerCapture(e.pointerId);
  });

  $('#sg-stage').addEventListener('pointermove', (e) => {
    if (sg.resize) {
      const canvas = $('#sg-stage-canvas');
      const r = canvas.getBoundingClientRect();
      const dx = (e.clientX - sg.resize.sx) / r.width;
      const dy = (e.clientY - sg.resize.sy) / r.height;
      const pos = sg.resize.pos;
      const iw = sg.sig ? (sg.sig.canvas.width || 1) : 1;
      const ih = sg.sig ? (sg.sig.canvas.height || 1) : 1;
      const ratio = ih / iw;
      const ow = sg.resize.w;
      const oh = sg.resize.h;
      const minW = 0.03;
      const maxW = 0.9;
      const dhW = dy / ratio;
      const dominant = Math.abs(dx) >= Math.abs(dhW) ? dx : dhW;
      let w;
      switch (sg.resize.corner) {
        case 'sw':
        case 'nw':
          w = clamp(ow - dominant, minW, maxW);
          break;
        default:
          w = clamp(ow + dominant, minW, maxW);
      }
      let h = w * ratio;
      if (h > 0.9) {
        h = 0.9;
        w = h / ratio;
      }
      let x = sg.resize.ox;
      let y = sg.resize.oy;
      if (sg.resize.corner === 'sw' || sg.resize.corner === 'nw') x = sg.resize.ox + ow - w;
      if (sg.resize.corner === 'ne' || sg.resize.corner === 'nw') y = sg.resize.oy + oh - h;
      pos.w = w;
      pos.h = h;
      pos.x = clamp(x, 0, 1 - w);
      pos.y = clamp(y, 0, 1 - h);
      const el = $('#sg-stage').querySelector('.sw-sig');
      if (el) sgPosToStyle(el, pos);
      const newSize = Math.round(w * sg.stagePageW);
      $('#sg-size').value = clamp(newSize, 40, 240);
      $('#sg-size-val').textContent = $('#sg-size').value + ' pt';
      return;
    }
    if (!sg.drag) return;
    const canvas = $('#sg-stage-canvas');
    const r = canvas.getBoundingClientRect();
    const dx = (e.clientX - sg.drag.sx) / r.width;
    const dy = (e.clientY - sg.drag.sy) / r.height;
    const pos = sg.pages[sg.curPage];
    pos.x = clamp(sg.drag.ox + dx, 0, 1 - pos.w);
    pos.y = clamp(sg.drag.oy + dy, 0, 1 - pos.h);
    const el = $('#sg-stage').querySelector('.sw-sig');
    if (el) sgPosToStyle(el, pos);
  });

  $('#sg-stage').addEventListener('pointerup', () => {
    sg.drag = null;
    sg.resize = null;
  });

  /* --- drag & drop placement --- */
  const sgStageEl = $('#sg-stage');
  const sgCanvasEl = $('#sg-stage-canvas');

  function sgDropPos(e) {
    const r = sgCanvasEl.getBoundingClientRect();
    const iw = sg.sig ? (sg.sig.canvas.width || 1) : 1;
    const ih = sg.sig ? (sg.sig.canvas.height || 1) : 1;
    let w = sgCurSize() / sg.stagePageW;
    w = clamp(w, 0.05, 0.9);
    const h = w * (ih / iw);
    const x = clamp((e.clientX - r.left) / r.width - w / 2, 0, 1 - w);
    const y = clamp((e.clientY - r.top) / r.height - h / 2, 0, 1 - h);
    return { x, y, w, h };
  }

  function sgPlaceAt(e) {
    if (!sg.sig) return toast('Create a signature first', true);
    const p = sgDropPos(e);
    sg.pages[sg.curPage] = p;
    drawSignOverlay();
    updateSignThumbs();
    toast('Signature placed on page ' + (sg.curPage + 1));
  }

  sgStageEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    sgStageEl.classList.add('drag-over');
  });
  sgStageEl.addEventListener('dragleave', () => {
    sgStageEl.classList.remove('drag-over');
  });
  sgStageEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    sgStageEl.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length) {
      const f = files[0];
      const isPdf = f.type === 'application/pdf';
      const isImg = (f.type || '').startsWith('image/');
      if (!isPdf && !isImg) return toast('Drop a JPG / PNG / PDF signature', true);
      busy('Reading signature...');
      try {
        const c = isPdf ? await sigFromPdfFile(f) : await sigFromImageFile(f);
        sg.uploadCanvas = c;
        sg.sig = { canvas: c };
        const pv = $('#sg-upload-preview');
        pv.src = c.toDataURL('image/png');
        pv.hidden = false;
        sg.method = 'upload';
        $$('#sg-method .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.method === 'upload'));
        $('#sg-draw-wrap').style.display = 'none';
        $('#sg-type-wrap').style.display = 'none';
        $('#sg-upload-wrap').style.display = '';
        sgPlaceAt(e);
      } catch (err) {
        console.error(err);
        toast('Could not read signature file', true);
      } finally {
        unbusy();
      }
      return;
    }
    sgPlaceAt(e);
  });

  $('#sg-drag-chip').addEventListener('dragstart', (e) => {
    if (!sg.sig) {
      e.preventDefault();
      toast('Create a signature first', true);
      return;
    }
    e.dataTransfer.setData('text/plain', 'signature');
    e.dataTransfer.effectAllowed = 'copy';
  });

  /* --- signature creation (draw / type / upload) --- */

  $('#sg-method').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    sg.method = btn.dataset.method;
    $$('#sg-method .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    $('#sg-draw-wrap').style.display = sg.method === 'draw' ? '' : 'none';
    $('#sg-type-wrap').style.display = sg.method === 'type' ? '' : 'none';
    $('#sg-upload-wrap').style.display = sg.method === 'upload' ? '' : 'none';
    sgSetSigFromMethod();
    drawSignOverlay();
  });

  const sgDrawCanvas = $('#sg-draw');
  sgDrawCanvas.width = 640;
  sgDrawCanvas.height = 240;
  const sgCtx = sgDrawCanvas.getContext('2d');
  sgCtx.lineWidth = 3;
  sgCtx.lineCap = 'round';
  sgCtx.lineJoin = 'round';
  sgCtx.strokeStyle = $('#sg-color').value;

  let sgDrawing = null;
  sgDrawCanvas.addEventListener('pointerdown', (e) => {
    const r = sgDrawCanvas.getBoundingClientRect();
    sgDrawing = {
      x: ((e.clientX - r.left) * sgDrawCanvas.width) / r.width,
      y: ((e.clientY - r.top) * sgDrawCanvas.height) / r.height,
    };
    sgDrawCanvas.setPointerCapture(e.pointerId);
  });
  sgDrawCanvas.addEventListener('pointermove', (e) => {
    if (!sgDrawing) return;
    const r = sgDrawCanvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) * sgDrawCanvas.width) / r.width;
    const y = ((e.clientY - r.top) * sgDrawCanvas.height) / r.height;
    sgCtx.beginPath();
    sgCtx.moveTo(sgDrawing.x, sgDrawing.y);
    sgCtx.lineTo(x, y);
    sgCtx.stroke();
    sgDrawing = { x, y };
  });
  const sgStopDraw = () => {
    if (!sgDrawing) return;
    sgDrawing = null;
    sg.sig = { canvas: sgDrawCanvas };
    sgAutoPlace();
    drawSignOverlay();
  };
  sgDrawCanvas.addEventListener('pointerup', sgStopDraw);
  sgDrawCanvas.addEventListener('pointercancel', sgStopDraw);

  $('#sg-clear').addEventListener('click', () => {
    sgCtx.clearRect(0, 0, sgDrawCanvas.width, sgDrawCanvas.height);
    sg.sig = null;
    drawSignOverlay();
  });

  $('#sg-color').addEventListener('input', () => {
    sgCtx.strokeStyle = $('#sg-color').value;
    if (sg.method === 'draw') sgSetSigFromMethod();
    drawSignOverlay();
  });

  const sgTypeCanvas = $('#sg-type-preview');
  sgTypeCanvas.width = 320;
  sgTypeCanvas.height = 90;

  function sgDrawType() {
    const text = $('#sg-type-text').value.trim();
    const tctx = sgTypeCanvas.getContext('2d');
    tctx.clearRect(0, 0, sgTypeCanvas.width, sgTypeCanvas.height);
    sgTypeCanvas.hidden = !text;
    if (!text) {
      sg.sig = null;
      drawSignOverlay();
      return;
    }
    tctx.font = '500 56px "Segoe Script","Brush Script MT","Apple Chancery",cursive';
    tctx.fillStyle = $('#sg-color').value;
    tctx.textBaseline = 'middle';
    tctx.fillText(text, 10, sgTypeCanvas.height / 2);
    sg.sig = { canvas: sgTypeCanvas };
    sgAutoPlace();
    drawSignOverlay();
  }

  $('#sg-type-text').addEventListener('input', sgDrawType);
  $('#sg-type-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sgDrawType();
  });

  $('#sg-upload-btn').addEventListener('click', () => $('#sg-upload').click());

  async function sigFromImageFile(f) {
    const { img } = await loadImage(f);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }

  async function sigFromPdfFile(f) {
    const buf = await readBuffer(f);
    const doc = await loadPdfJs(buf);
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 900 / Math.max(vp1.width, vp1.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.floor(vp.width);
    c.height = Math.floor(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c;
  }

  $('#sg-upload').addEventListener('change', async () => {
    const f = $('#sg-upload').files[0];
    if (!f) return;
    busy('Reading signature...');
    try {
      const c =
        f.type === 'application/pdf' ? await sigFromPdfFile(f) : await sigFromImageFile(f);
      sg.uploadCanvas = c;
      const pv = $('#sg-upload-preview');
      pv.src = c.toDataURL('image/png');
      pv.hidden = false;
      sg.sig = { canvas: c };
      sgAutoPlace();
      drawSignOverlay();
      toast('Signature loaded');
    } catch (err) {
      console.error(err);
      toast('Could not read signature file', true);
    } finally {
      unbusy();
    }
  });

  function sgSetSigFromMethod() {
    if (sg.method === 'draw') {
      sg.sig = { canvas: sgDrawCanvas };
    } else if (sg.method === 'type') {
      sgDrawType();
    } else if (sg.method === 'upload' && sg.uploadCanvas) {
      sg.sig = { canvas: sg.uploadCanvas };
    }
    drawSignOverlay();
  }

  function sgCurSize() {
    return parseInt($('#sg-size').value, 10) || 120;
  }

  function sgApplySizeToCurrent() {
    const pos = sg.pages[sg.curPage];
    if (!pos || !sg.sig) return;
    const iw = sg.sig.canvas.width || 1;
    const ih = sg.sig.canvas.height || 1;
    let w = sgCurSize() / sg.stagePageW;
    w = clamp(w, 0.05, 0.9);
    const h = w * (ih / iw);
    pos.w = w;
    pos.h = h;
  }

  $('#sg-size').addEventListener('input', () => {
    $('#sg-size-val').textContent = sgCurSize() + ' pt';
    sgApplySizeToCurrent();
    drawSignOverlay();
  });

  function sgNormPos() {
    if (!sg.sig) return null;
    const iw = sg.sig.canvas.width || 1;
    const ih = sg.sig.canvas.height || 1;
    let w = sgCurSize() / sg.stagePageW;
    w = clamp(w, 0.05, 0.9);
    const h = w * (ih / iw);
    return { x: 0.5 - w / 2, y: 0.88 - h / 2, w, h };
  }

  $('#sg-add-all').addEventListener('click', () => {
    const pos = sg.pages[sg.curPage];
    if (!pos) return toast('Place a signature on this page first', true);
    for (let i = 0; i < sg.pageCount; i++) sg.pages[i] = { ...pos };
    drawSignOverlay();
    updateSignThumbs();
    toast('Signature applied to all ' + sg.pageCount + ' page(s)');
  });

  $('#sg-remove-page').addEventListener('click', () => {
    const any = sg.pages.some(Boolean);
    if (!any) return toast('No signatures to remove', true);
    sg.pages = Array.from({ length: sg.pageCount }, () => null);
    drawSignOverlay();
    updateSignThumbs();
    toast('Removed signatures from all pages');
  });

  function sgAutoPlace() {
    if (!sg.sig || sg.pages[sg.curPage]) return;
    const p = sgNormPos();
    if (p) {
      sg.pages[sg.curPage] = p;
      drawSignOverlay();
      updateSignThumbs();
    }
  }

  function updateSignThumbs() {
    $$('#sg-thumbs .sw-thumb').forEach((b) => {
      const i = +b.dataset.idx;
      b.classList.toggle('signed', !!sg.pages[i]);
    });
  }

  $('#sg-download').addEventListener('click', async () => {
    if (!sg.files.length) return;
    busy('Signing PDF...');
    try {
      const out = await PDFLib.PDFDocument.load(sg.buf, { ignoreEncryption: true });
      let sigImg = null;
      const drawn = sg.pages.some(Boolean);
      if (drawn && sg.sig) sigImg = await out.embedPng(canvasPngBytes(sg.sig.canvas));
      const iw = sg.sig ? sg.sig.canvas.width || 1 : 1;
      const ih = sg.sig ? sg.sig.canvas.height || 1 : 1;
      for (let i = 0; i < sg.pageCount; i++) {
        const p = sg.pages[i];
        if (!p || !sigImg) continue;
        const page = out.getPage(i);
        const pw = page.getWidth();
        const ph = page.getHeight();
        const w = p.w * pw;
        const h = w * (ih / iw);
        page.drawImage(sigImg, {
          x: p.x * pw,
          y: ph - p.y * ph - h,
          width: w,
          height: h,
        });
      }
      const bytes = await out.save();
      saveAs(
        new Blob([bytes], { type: 'application/pdf' }),
        baseName(sg.files[0].name) + '-signed.pdf'
      );
      toast('Signed PDF saved');
    } catch (err) {
      console.error(err);
      toast('Signing failed', true);
    } finally {
      unbusy();
    }
  });

  /* ================================================================
     TOOL 8 - UNLOCK / PROTECT PDF
     ================================================================ */

  const sc = {
    files: [], // {name, size, buf}
    mode: 'unlock',
  };

  function scResetUpload() {
    sc.files = [];
    renderChips('#sc-files', [], {});
    $('#sc-upload-options').classList.remove('show');
  }

  setupDropzone('#sc-dropzone', '#sc-input', async (files) => {
    const pdfs = files.filter((f) => f.type === 'application/pdf');
    if (!pdfs.length) return toast('Please add PDF files', true);
    if (checkSize(pdfs)) return;
    busy('Reading PDFs...');
    try {
      for (const f of pdfs) {
        if (sc.files.some((x) => x.name === f.name)) continue;
        sc.files.push({ name: f.name, size: f.size, buf: await readBuffer(f) });
      }
      renderSecureChips();
      showView('secure-work');
      $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'secure'));
      $('#sc-result').innerHTML = '';
    } catch (err) {
      toast('Could not read a PDF', true);
    } finally {
      unbusy();
    }
  });

  $('#sc-upload-remove').addEventListener('click', scResetUpload);

  function renderSecureChips() {
    renderChips('#sc-files', sc.files, {
      numbers: true,
      onRemove: (i) => {
        sc.files.splice(i, 1);
        renderSecureChips();
      },
    });
    $('#sc-start').disabled = sc.files.length === 0;
    $('#sc-upload-options').classList.toggle('show', sc.files.length > 0);
  }

  $('#sc-start').addEventListener('click', () => {
    if (!sc.files.length) return toast('Add a PDF first', true);
    showView('secure-work');
    $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'secure'));
    $('#sc-result').innerHTML = '';
  });

  $('#sc-back').addEventListener('click', () => {
    showView('secure');
    $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'secure'));
    renderSecureChips();
  });

  $('#sc-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    sc.mode = btn.dataset.mode;
    $$('#sc-mode .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    const protect = sc.mode === 'protect';
    $('#sc-unlock-row').style.display = protect ? 'none' : '';
    $('#sc-protect-row').style.display = protect ? '' : 'none';
    $('#sc-protect-row2').style.display = protect ? '' : 'none';
    $('#sc-perm-row').style.display = protect ? '' : 'none';
  });

  $('#sc-run').addEventListener('click', async () => {
    if (!sc.files.length) return;
    busy('Processing ' + sc.files.length + ' PDF(s)...');
    const results = [];
    try {
      if (sc.mode === 'unlock') {
        const pass = $('#sc-unlock-pass').value || '';
        for (let i = 0; i < sc.files.length; i++) {
          const item = sc.files[i];
          setBusyText('Unlocking "' + item.name + '" (' + (i + 1) + '/' + sc.files.length + ')...');
          let doc;
          try {
            doc = await PDFLib.PDFDocument.load(
              item.buf,
              pass ? { password: pass } : { ignoreEncryption: true }
            );
          } catch (err) {
            toast('Wrong password for "' + item.name + '"', true);
            continue;
          }
          const bytes = await doc.save();
          results.push({
            name: item.name.replace(/\.pdf$/i, '') + '-unlocked.pdf',
            before: item.size,
            after: bytes.length,
            bytes,
          });
        }
        $('#sc-result').innerHTML = '';
        renderCompressResults(results);
        if (results.length) toast('Unlocked ' + results.length + ' PDF(s)');
      } else {
        const p1 = $('#sc-pass1').value;
        const p2 = $('#sc-pass2').value;
        if (!p1) return toast('Enter a password', true);
        if (p1 !== p2) return toast('Passwords do not match', true);
        const perms = {
          allowPrint: $('#sc-perm-print').checked,
          allowCopy: $('#sc-perm-copy').checked,
          allowModify: $('#sc-perm-modify').checked,
        };
        for (let i = 0; i < sc.files.length; i++) {
          const item = sc.files[i];
          setBusyText('Protecting "' + item.name + '" (' + (i + 1) + '/' + sc.files.length + ')...');
          const src = await PDFLib.PDFDocument.load(item.buf, { ignoreEncryption: true });
          const out = await PDFLib.PDFDocument.create();
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach((p) => out.addPage(p));
          const bytes = await out.save({
            userPassword: p1,
            ownerPassword: p1,
            allowPrint: perms.allowPrint,
            allowCopy: perms.allowCopy,
            allowModify: perms.allowModify,
          });
          results.push({
            name: item.name.replace(/\.pdf$/i, '') + '-protected.pdf',
            before: item.size,
            after: bytes.length,
            bytes,
          });
        }
        $('#sc-result').innerHTML = '';
        renderCompressResults(results);
        if (results.length) toast('Protected ' + results.length + ' PDF(s)');
      }
    } catch (err) {
      console.error(err);
      toast('Processing failed', true);
    } finally {
      unbusy();
    }
  });

  /* ================================================================
     TOOL 9 - ORGANISE PAGES
     ================================================================ */

  const og = {
    file: null,
    buf: null,
    lib: null,
    pdfJs: null,
    pages: [], // {src, rot}
    sel: -1,
    del: new Set(),
  };

  function ogResetUpload() {
    og.file = null;
    og.buf = null;
    og.lib = null;
    og.pdfJs = null;
    og.pages = [];
    og.sel = -1;
    og.del = new Set();
    renderChips('#og-files', [], {});
    $('#og-upload-options').classList.remove('show');
  }

  setupDropzone('#og-dropzone', '#og-input', async (files) => {
    const pdf = files.find((f) => f.type === 'application/pdf');
    if (!pdf) return toast('Please add a PDF file', true);
    if (checkSize([pdf])) return;
    busy('Reading PDF...');
    try {
      const buf = await readBuffer(pdf);
      og.file = pdf;
      og.buf = buf;
      og.lib = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
      og.pdfJs = await loadPdfJs(buf);
      og.pages = Array.from({ length: og.lib.getPageCount() }, (_, i) => ({ src: i, rot: 0 }));
      og.sel = -1;
      og.del = new Set();
      renderChips('#og-files', [og.file], {
        numbers: false,
        onRemove: () => ogResetUpload(),
      });
      showView('organise-work');
      $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'organise'));
      renderOrganiseGrid();
      toast('Loaded ' + og.pages.length + ' page(s)');
    } catch (err) {
      console.error(err);
      toast('Could not read the PDF', true);
    } finally {
      unbusy();
    }
  });

  $('#og-upload-remove').addEventListener('click', ogResetUpload);

  $('#og-start').addEventListener('click', () => {
    if (!og.file) return toast('Add a PDF first', true);
    showView('organise-work');
    $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'organise'));
    renderOrganiseGrid();
    toast('Loaded ' + og.pages.length + ' page(s)');
  });

  $('#og-back').addEventListener('click', () => {
    showView('organise');
    $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'organise'));
    renderChips('#og-files', [og.file], {
      numbers: false,
      onRemove: () => ogResetUpload(),
    });
    $('#og-upload-options').classList.add('show');
  });

  let ogDragIdx = -1;
  let ogDragging = false;

  function ogReorder(from, to) {
    if (from === to || from < 0 || to < 0 || to >= og.pages.length) return;
    const selObj = og.sel >= 0 ? og.pages[og.sel] : null;
    const delObjs = new Set([...og.del].map((i) => og.pages[i]).filter(Boolean));
    const [moved] = og.pages.splice(from, 1);
    og.pages.splice(to, 0, moved);
    const newDel = new Set();
    og.pages.forEach((pg, i) => {
      if (delObjs.has(pg)) newDel.add(i);
    });
    og.del = newDel;
    og.sel = selObj ? og.pages.indexOf(selObj) : -1;
  }

  function ogClearDragClasses() {
    $$('#og-pages .dragging, #og-pages .drop-before, #og-pages .drop-after').forEach((c) =>
      c.classList.remove('dragging', 'drop-before', 'drop-after')
    );
  }

  function renderOrganiseGrid() {
    const grid = $('#og-pages');
    grid.innerHTML = '';
    const has = og.pages.length > 0;
    $('#og-save').disabled = !has;
    if (!has) {
      grid.innerHTML = '<p class="empty-note">Add a PDF to start organising pages.</p>';
    }
    og.pages.forEach((pg, idx) => {
      const card = mkEl('div', 'page-card' + (idx === og.sel ? ' selected' : ''));
      card.dataset.idx = idx;
      card.draggable = true;
      card.addEventListener('dragstart', (e) => {
        ogDragIdx = idx;
        ogDragging = true;
        og.sel = idx;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
      });
      card.addEventListener('dragend', () => {
        ogDragIdx = -1;
        ogDragging = false;
        ogClearDragClasses();
      });
      card.addEventListener('dragenter', (e) => e.preventDefault());
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (ogDragIdx < 0 || ogDragIdx === idx) return;
        const r = card.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        ogClearDragClasses();
        card.classList.add(after ? 'drop-after' : 'drop-before');
      });
      card.addEventListener('dragleave', (e) => {
        if (!card.contains(e.relatedTarget)) {
          card.classList.remove('drop-before', 'drop-after');
        }
      });
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const from = ogDragIdx;
        const to = idx;
        if (from >= 0 && from !== to) {
          const after = card.classList.contains('drop-after');
          let dest = after ? (from < to ? to : to + 1) : (from < to ? to - 1 : to);
          if (dest >= 0 && dest < og.pages.length) {
            ogReorder(from, dest);
          }
        }
        ogDragIdx = -1;
        ogDragging = false;
        ogClearDragClasses();
        renderOrganiseGrid();
      });
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'page-check';
      chk.checked = og.del.has(idx);
      chk.addEventListener('change', (e) => {
        if (e.target.checked) og.del.add(idx);
        else og.del.delete(idx);
      });
      card.appendChild(chk);
      const canvas = mkEl('canvas');
      card.appendChild(canvas);
      card.appendChild(mkEl('div', 'page-label', 'Page ' + (idx + 1)));
      const badge = mkEl('span', 'page-badge', String(idx + 1));
      if (pg.rot % 360 !== 0) {
        badge.className = 'page-badge rot';
        badge.textContent = 'R' + pg.rot;
      }
      card.appendChild(badge);
      card.addEventListener('click', (e) => {
        if (e.target === chk) return;
        if (ogDragging) return;
        og.sel = idx;
        renderOrganiseGrid();
      });
      grid.appendChild(card);
      thumbnailFor(og.pdfJs, pg.src + 1, 120)
        .then((c) => {
          if (card.isConnected) canvas.replaceWith(c);
        })
        .catch(() => {});
    });
    $('#og-count').textContent = og.pages.length + ' page(s)';
  }

  $('#og-del').addEventListener('click', () => {
    if (!og.del.size) return toast('Tick pages to delete first', true);
    og.pages = og.pages.filter((_, i) => !og.del.has(i));
    og.del = new Set();
    og.sel = -1;
    renderOrganiseGrid();
  });

  $('#og-up').addEventListener('click', () => {
    if (og.sel <= 0) return;
    [og.pages[og.sel - 1], og.pages[og.sel]] = [og.pages[og.sel], og.pages[og.sel - 1]];
    og.sel--;
    renderOrganiseGrid();
  });

  $('#og-down').addEventListener('click', () => {
    if (og.sel < 0 || og.sel >= og.pages.length - 1) return;
    [og.pages[og.sel + 1], og.pages[og.sel]] = [og.pages[og.sel], og.pages[og.sel + 1]];
    og.sel++;
    renderOrganiseGrid();
  });

  $('#og-rot').addEventListener('click', () => {
    if (og.sel < 0) return toast('Select a page first', true);
    og.pages[og.sel].rot = (og.pages[og.sel].rot + 90) % 360;
    renderOrganiseGrid();
  });

  $('#og-reverse').addEventListener('click', () => {
    og.pages.reverse();
    og.del = new Set();
    og.sel = og.sel >= 0 ? og.pages.length - 1 - og.sel : -1;
    renderOrganiseGrid();
  });

  $('#og-clear').addEventListener('click', () => {
    if (!og.file) return;
    og.pages = Array.from({ length: og.lib.getPageCount() }, (_, i) => ({ src: i, rot: 0 }));
    og.sel = -1;
    og.del = new Set();
    renderOrganiseGrid();
  });

  $('#og-save').addEventListener('click', async () => {
    if (!og.pages.length) return;
    busy('Building PDF...');
    try {
      const out = await PDFLib.PDFDocument.create();
      for (const pg of og.pages) {
        const [cp] = await out.copyPages(og.lib, [pg.src]);
        if (pg.rot % 360 !== 0) {
          const cur = cp.getRotation().angle;
          cp.setRotation(PDFLib.degrees((cur + pg.rot) % 360));
        }
        out.addPage(cp);
      }
      const bytes = await out.save();
      saveAs(
        new Blob([bytes], { type: 'application/pdf' }),
        baseName(og.file.name) + '-organised.pdf'
      );
      toast('Saved ' + og.pages.length + ' page(s)');
    } catch (err) {
      console.error(err);
      toast('Save failed', true);
    } finally {
      unbusy();
    }
  });

  /* ---------------- init ---------------- */

  $('#rz-run').disabled = true;
  $('#mg-run').disabled = true;
  $('#j2p-run').disabled = true;
  $('#p2j-run').disabled = true;
  $('#cp-run').disabled = true;
  $('#sg-start').disabled = true;
  $('#sc-start').disabled = true;
  $('#og-start').disabled = true;
  $('#og-save').disabled = true;
  $('#ed-save').disabled = true;
  $('#ed-start').disabled = true;
  $('#ed-text-open').disabled = true;
  $('#ed-text-apply').disabled = true;
  $('#ed-text-page').disabled = true;

  $('#mg-options').classList.remove('show');

  window.QuickTools = { showView };
})();
