/* QuickTools - Edit PDF (standalone page).
   Edit + visual editor logic reused from js/app.js so behaviour matches the homepage tool. */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  function fmtBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function baseName(name) {
    return name.replace(/\.[^/.]+$/, '');
  }

  function toast(msg, isErr) {
    var wrap = $('#toast-wrap');
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  var busyCount = 0;
  function busy(text) {
    busyCount++;
    var ov = $('#busy-overlay');
    var t = $('#busy-text');
    if (t) t.textContent = text || 'Working...';
    if (ov) ov.hidden = false;
  }
  function unbusy() {
    busyCount = Math.max(0, busyCount - 1);
    if (busyCount === 0) {
      var ov = $('#busy-overlay');
      if (ov) ov.hidden = true;
    }
  }

  function readBuffer(file) {
    return file.arrayBuffer();
  }

  async function loadPdfJs(buf) {
    var task = pdfjsLib.getDocument({ data: buf.slice(0) });
    return task.promise;
  }

  async function renderPageToCanvas(pdfJs, pageNum, scale, rotation) {
    var page = await pdfJs.getPage(pageNum);
    var vp1 = page.getViewport({ scale: 1 });
    var base = scale || Math.min(2, 2000 / Math.max(vp1.width, vp1.height));
    var viewport = page.getViewport({ scale: base, rotation: rotation || 0 });
    var canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    var ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    return canvas;
  }

  async function thumbnailFor(pdfJs, pageNum, targetPx) {
    var page = await pdfJs.getPage(pageNum);
    var vp1 = page.getViewport({ scale: 1 });
    var scale = targetPx / Math.max(vp1.width, vp1.height);
    return renderPageToCanvas(pdfJs, pageNum, scale, 0);
  }

  function setupDropzone(dzSel, inputSel, onFiles) {
    var dz = $(dzSel);
    var input = $(inputSel);
    if (!dz || !input) return;

    dz.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (input.files.length) onFiles(Array.prototype.slice.call(input.files));
      input.value = '';
    });
    ['dragover', 'dragenter'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        dz.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        dz.classList.remove('dragover');
      });
    });
    dz.addEventListener('drop', function (e) {
      var files = Array.prototype.slice.call(e.dataTransfer.files);
      if (files.length) onFiles(files);
    });
  }

  function renderChips(containerSel, items, opts) {
    var wrap = $(containerSel);
    if (!wrap) return;
    wrap.innerHTML = '';
    items.forEach(function (it, idx) {
      var chip = document.createElement('div');
      chip.className = 'chip';
      if (opts.numbers) chip.appendChild(mkEl('span', 'chip-num', String(idx + 1)));
      chip.appendChild(mkEl('span', 'chip-name', it.name));
      if (it.size != null) chip.appendChild(mkEl('span', 'chip-size', fmtBytes(it.size)));
      var x = document.createElement('button');
      x.className = 'chip-x';
      x.textContent = '\u00d7';
      x.addEventListener('click', function () { opts.onRemove && opts.onRemove(idx); });
      chip.appendChild(x);
      if (opts.onUp && opts.onDown && items.length > 1) {
        var up = document.createElement('button');
        up.className = 'chip-x';
        up.textContent = '\u2191';
        up.addEventListener('click', function () { opts.onUp(idx); });
        var down = document.createElement('button');
        down.className = 'chip-x';
        down.textContent = '\u2193';
        down.addEventListener('click', function () { opts.onDown(idx); });
        chip.insertBefore(up, x);
        chip.insertBefore(down, x);
      }
      wrap.appendChild(chip);
    });
  }

  function mkEl(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  /* ---------------- view switching (upload <-> editor) ---------------- */

  function showView(name) {
    $$('.view').forEach(function (v) { v.classList.remove('active'); });
    var target = $('#view-' + name);
    if (!target) return showView('edit');
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goEditor() {
    showView('editor');
  }
  function goEditUpload() {
    showView('edit');
  }

  /* ---------------- Edit PDF ---------------- */

  var MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB

  function checkSize(files) {
    var big = files.find(function (f) { return f.size > MAX_PDF_SIZE; });
    if (big) {
      toast('"' + big.name + '" exceeds the 100 MB limit', true);
      return true;
    }
    return false;
  }

  var ed = {
    files: [], // {name, buf, lib, pdfJs, pageCount}
    pages: [], // {fi, pi, rot, textEdits}
    sel: -1,
  };

  async function addEditFiles(files) {
    var pdfs = files.filter(function (f) { return f.type === 'application/pdf'; });
    if (!pdfs.length) return toast('Please add PDF files', true);
    if (checkSize(pdfs)) return;
    busy('Loading PDFs...');
    try {
      for (var i = 0; i < pdfs.length; i++) {
        var f = pdfs[i];
        var buf = await readBuffer(f);
        var lib = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
        var pdfJs = await loadPdfJs(buf);
        var entry = { name: f.name, buf: buf, lib: lib, pdfJs: pdfJs, pageCount: lib.getPageCount() };
        ed.files.push(entry);
        for (var p = 0; p < entry.pageCount; p++) {
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
  $('#ed-add').addEventListener('click', function () { $('#ed-input').click(); });
  $('#ed-start').addEventListener('click', function () {
    if (!ed.files.length) return;
    goEditor();
    buildEditGrid();
    openVisualEditor(0);
  });
  $('#ed-back').addEventListener('click', function () {
    closeVisualEditor();
    goEditUpload();
    renderEditFileChips();
  });

  function renderEditFileChips() {
    renderChips('#ed-files', ed.files, {
      numbers: true,
      onRemove: function (i) {
        var oldFi = i;
        ed.files.splice(oldFi, 1);
        ed.pages = ed.pages.filter(function (p) { return p.fi !== oldFi; });
        ed.pages.forEach(function (p) {
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
    var has = ed.files.length > 0;
    $('#ed-start').disabled = !has;
    $('#ed-upload-options').classList.toggle('show', has);
  }

  function buildEditGrid() {
    var grid = $('#ed-pages');
    grid.innerHTML = '';
    if (!ed.pages.length) {
      grid.innerHTML = '<p class="empty-note">Add a PDF to start editing pages.</p>';
    }

    ed.pages.forEach(function (pg, idx) {
      var card = mkEl('div', 'page-card' + (idx === ed.sel ? ' selected' : ''));
      card.dataset.idx = idx;
      var canvas = mkEl('canvas');
      card.appendChild(canvas);
      card.appendChild(mkEl('div', 'page-label', 'Page ' + (idx + 1)));
      var badge = mkEl('span', 'page-badge', String(idx + 1));
      if (pg.rot % 360 !== 0) {
        badge.className = 'page-badge rot';
        badge.textContent = 'R' + pg.rot;
      }
      if (pg.textEdits && pg.textEdits.length) {
        badge.className = 'page-badge rot';
        badge.textContent = 'T';
      }
      card.appendChild(badge);
      card.addEventListener('click', function () {
        ed.sel = idx;
        buildEditGrid();
      });
      grid.appendChild(card);
      var entry = ed.files[pg.fi];
      if (entry) {
        thumbnailFor(entry.pdfJs, pg.pi + 1, 120)
          .then(function (c) {
            if (card.isConnected) canvas.replaceWith(c);
          })
          .catch(function () {});
      }
    });

    var has = ed.pages.length > 0;
    $('#ed-save').disabled = !has;
    $('#ed-text-open').disabled = !has;
    $('#ed-options').classList.toggle('show', has);
  }

  function getSel() {
    if (ed.sel < 0 || ed.sel >= ed.pages.length) return -1;
    return ed.sel;
  }

  $('#ed-rotate-l').addEventListener('click', function () {
    var i = getSel();
    if (i < 0) return toast('Select a page first', true);
    ed.pages[i].rot = (ed.pages[i].rot - 90 + 360) % 360;
    buildEditGrid();
  });
  $('#ed-rotate-r').addEventListener('click', function () {
    var i = getSel();
    if (i < 0) return toast('Select a page first', true);
    ed.pages[i].rot = (ed.pages[i].rot + 90) % 360;
    buildEditGrid();
  });
  $('#ed-delete').addEventListener('click', function () {
    var i = getSel();
    if (i < 0) return toast('Select a page first', true);
    ed.pages.splice(i, 1);
    ed.sel = Math.min(i, ed.pages.length - 1);
    buildEditGrid();
    if (ve.curPage === i) openVisualEditor(Math.max(0, ed.sel));
  });
  $('#ed-up').addEventListener('click', function () {
    var i = getSel();
    if (i <= 0) return;
    var t = ed.pages[i - 1];
    ed.pages[i - 1] = ed.pages[i];
    ed.pages[i] = t;
    ed.sel = i - 1;
    buildEditGrid();
  });
  $('#ed-down').addEventListener('click', function () {
    var i = getSel();
    if (i < 0 || i >= ed.pages.length - 1) return;
    var t = ed.pages[i + 1];
    ed.pages[i + 1] = ed.pages[i];
    ed.pages[i] = t;
    ed.sel = i + 1;
    buildEditGrid();
  });
  $('#ed-dup').addEventListener('click', function () {
    var i = getSel();
    if (i < 0) return;
    ed.pages.splice(i + 1, 0, Object.assign({}, ed.pages[i]));
    buildEditGrid();
  });
  $('#ed-clear').addEventListener('click', function () {
    ed.files = [];
    ed.pages = [];
    ed.sel = -1;
    closeVisualEditor();
    goEditUpload();
    renderEditFileChips();
    buildEditGrid();
    toast('Cleared');
  });

  /* ---------------- Visual PDF editor ---------------- */

  var ve = {
    curPage: -1,
    pages: {}, // key "fi_pi" -> { scale, elements: [] }
    els: [],
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
    var h = (hex || '#111111').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
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
    var target = pageIdx == null ? Math.max(0, ed.sel) : pageIdx;
    $('#visual-editor').hidden = false;
    document.body.classList.add('ve-open');
    veLoadPage(Math.min(Math.max(0, target), ed.pages.length - 1));
  }

  function closeVisualEditor() {
    $('#visual-editor').hidden = true;
    document.body.classList.remove('ve-open');
  }

  $('#ve-back').addEventListener('click', function () {
    closeVisualEditor();
    goEditor();
    buildEditGrid();
  });

  $('#ed-text-open').addEventListener('click', function () {
    var i = getSel();
    if (i < 0) return toast('Select a page first', true);
    openVisualEditor(i);
  });

  async function veLoadPage(idx) {
    if (idx < 0 || idx >= ed.pages.length) return;
    var pg = ed.pages[idx];
    var entry = ed.files[pg.fi];
    if (!entry) return;
    ve.curPage = idx;
    ve.selId = null;
    ve.editingId = null;
    ve.activeTool = null;
    updateToolbarActive();

    ve.stage = ve.stage || $('#ve-stage');
    ve.canvas = ve.canvas || $('#ve-canvas');

    var wrap = $('#ve-stage-wrap');
    var key = pageKey(pg);
    var page = await entry.pdfJs.getPage(pg.pi + 1);
    var vp1 = page.getViewport({ scale: 1 });
    var S;
    if (ve.pages[key]) {
      S = ve.pages[key].scale;
    } else {
      S = clamp((wrap.clientWidth - 24) / vp1.width, 0.4, 2);
      ve.pages[key] = { scale: S, elements: [] };
      snap();
    }
    var vp = page.getViewport({ scale: S });
    ve.canvas.width = Math.floor(vp.width);
    ve.canvas.height = Math.floor(vp.height);
    ve.scale = S;
    await page.render({ canvasContext: ve.canvas.getContext('2d'), viewport: vp }).promise;

    ve.els = ve.pages[key].elements;
    renderElements();
    updateThumbs();
    $('#ve-title').textContent =
      'Page ' + (idx + 1) + ' / ' + ed.pages.length + ' \u2014 ' + entry.name;
  }

  function updateThumbs() {
    var wrap = $('#ve-thumbs');
    wrap.innerHTML = '';
    ed.pages.forEach(function (pg, idx) {
      var b = mkEl('button', 've-thumb' + (idx === ve.curPage ? ' active' : ''));
      b.textContent = 'Page ' + (idx + 1);
      b.addEventListener('click', function () { veLoadPage(idx); });
      wrap.appendChild(b);
    });
  }

  function getVeEl(id) {
    var found = null;
    (ve.els || []).forEach(function (e) { if (e.id === id) found = e; });
    return found;
  }

  function renderElements() {
    ve.stage.querySelectorAll('.ve-el').forEach(function (n) { n.remove(); });
    (ve.els || []).forEach(function (el) {
      var d = document.createElement('div');
      d.className = 've-el' + (el.id === ve.selId ? ' selected' : '');
      d.dataset.id = el.id;
      if (el.type === 'text') {
        d.className += ' ve-el-text';
        d.contentEditable = 'false';
        d.spellcheck = false;
        d.textContent = el.text;
        d.addEventListener('dblclick', function () { veStartEditText(el); });
        d.addEventListener('input', function () {
          el.text = d.innerText;
        });
        d.addEventListener('blur', function () {
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
    var S = ve.scale;
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
      if (el.fill) d.style.background = 'rgba(' + hexToRgb(el.color).map(function (c) { return Math.round(c * 255); }).join(',') + ',0.45)';
      if (el.type === 'ellipse') d.style.borderRadius = '50%';
    } else if (el.type === 'line') {
      var x1 = el.x1 * S, y1 = el.y1 * S, x2 = el.x2 * S, y2 = el.y2 * S;
      var len = Math.hypot(x2 - x1, y2 - y1);
      var ang = Math.atan2(y2 - y1, x2 - x1);
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
    var d = ve.stage.querySelector('[data-id="' + id + '"]');
    var el = getVeEl(id);
    if (d && el) styleVeEl(d, el);
  }

  function selectVeEl(id) {
    ve.selId = id;
    ve.stage.querySelectorAll('.ve-el.selected').forEach(function (n) { n.classList.remove('selected'); });
    var d = ve.stage.querySelector('[data-id="' + id + '"]');
    if (d) d.classList.add('selected');
    updateTextToolbar();
  }

  function deselectAll() {
    ve.selId = null;
    ve.stage.querySelectorAll('.ve-el.selected').forEach(function (n) { n.classList.remove('selected'); });
    updateTextToolbar();
  }

  function updateTextToolbar() {
    var el = ve.selId != null ? getVeEl(ve.selId) : null;
    var isText = el && el.type === 'text';
    var isShape = el && (el.type === 'rect' || el.type === 'ellipse' || el.type === 'line');
    ['#ve-bold', '#ve-italic', '#ve-underline', '#ve-size'].forEach(function (s) {
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
    var d = ve.stage.querySelector('[data-id="' + el.id + '"]');
    if (d) {
      d.contentEditable = 'true';
      d.classList.add('editing');
      d.focus();
      var range = document.createRange();
      range.selectNodeContents(d);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function veToPt(e) {
    var rect = ve.stage.getBoundingClientRect();
    var pw = ve.canvas.width / ve.scale;
    var ph = ve.canvas.height / ve.scale;
    return {
      x: clamp((e.clientX - rect.left) / ve.scale, 0, pw),
      y: clamp((e.clientY - rect.top) / ve.scale, 0, ph),
    };
  }

  function veCreateTextAt(e) {
    var pt = veToPt(e);
    snap();
    var el = {
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
    var pt = veToPt(e);
    snap();
    var el;
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
    var i = -1;
    (ve.els || []).forEach(function (e, idx) { if (e.id === id) i = idx; });
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
      var key = pageKey(ed.pages[ve.curPage]);
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
  $('#ve-delete').addEventListener('click', function () {
    if (ve.selId != null) veRemoveEl(ve.selId, true);
  });

  /* ---- toolbar ---- */

  $$('#ve-toolbar .ve-tool[data-tool]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (ve.activeTool === btn.dataset.tool) ve.activeTool = null;
      else {
        ve.activeTool = btn.dataset.tool;
        deselectAll();
      }
      updateToolbarActive();
    });
  });

  function updateToolbarActive() {
    $$('#ve-toolbar .ve-tool[data-tool]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tool === ve.activeTool);
    });
    if (ve.stage) ve.stage.style.cursor = ve.activeTool ? 'crosshair' : 'default';
  }

  function applyTextStyle(mutate) {
    var el = ve.selId != null ? getVeEl(ve.selId) : null;
    if (!el || el.type !== 'text') return;
    snap();
    mutate(el);
    renderElements();
    updateTextToolbar();
  }

  $('#ve-bold').addEventListener('click', function () { applyTextStyle(function (el) { el.bold = !el.bold; }); });
  $('#ve-italic').addEventListener('click', function () { applyTextStyle(function (el) { el.italic = !el.italic; }); });
  $('#ve-underline').addEventListener('click', function () { applyTextStyle(function (el) { el.underline = !el.underline; }); });

  $('#ve-size').addEventListener('change', function () {
    var el = ve.selId != null ? getVeEl(ve.selId) : null;
    if (!el || el.type !== 'text') return;
    snap();
    el.sizePt = clamp(parseFloat($('#ve-size').value) || 16, 6, 200);
    renderElements();
  });

  $('#ve-color').addEventListener('input', function () {
    var el = ve.selId != null ? getVeEl(ve.selId) : null;
    if (!el) return;
    snap();
    el.color = $('#ve-color').value;
    renderElements();
  });

  $('#ve-fill').addEventListener('change', function () {
    var el = ve.selId != null ? getVeEl(ve.selId) : null;
    if (!el || (el.type !== 'rect' && el.type !== 'ellipse')) return;
    snap();
    el.fill = $('#ve-fill').checked;
    renderElements();
  });

  /* ---- stage pointer interactions ---- */

  ve.stage = $('#ve-stage');
  ve.canvas = $('#ve-canvas');

  ve.stage.addEventListener('pointerdown', function (e) {
    var div = e.target.closest('.ve-el');
    if (div) {
      var id = Number(div.dataset.id);
      var el = getVeEl(id);
      if (!el) return;
      if (el.type === 'text' && ve.editingId === el.id) return;
      selectVeEl(id);
      if (el.type === 'text' && ve.editingId === el.id) return;
      snap();
      ve.drag = { id: id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y };
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

  ve.stage.addEventListener('pointermove', function (e) {
    if (ve.drag) {
      var dragEl = getVeEl(ve.drag.id);
      if (dragEl) {
        var pw = ve.canvas.width / ve.scale;
        var ph = ve.canvas.height / ve.scale;
        var dx = (e.clientX - ve.drag.sx) / ve.scale;
        var dy = (e.clientY - ve.drag.sy) / ve.scale;
        if (dragEl.type === 'line') {
          var ow = dragEl.x2 - dragEl.x1;
          var oh = dragEl.y2 - dragEl.y1;
          dragEl.x1 = clamp(ve.drag.ox + dx, 0, pw);
          dragEl.y1 = clamp(ve.drag.oy + dy, 0, ph);
          dragEl.x2 = clamp(ve.drag.ox + dx + ow, 0, pw);
          dragEl.y2 = clamp(ve.drag.oy + dy + oh, 0, ph);
        } else {
          dragEl.x = clamp(ve.drag.ox + dx, 0, pw);
          dragEl.y = clamp(ve.drag.oy + dy, 0, ph);
        }
        styleVeElById(dragEl.id);
      }
      return;
    }
    if (ve.drawing) {
      var drawEl = getVeEl(ve.drawing.id);
      if (drawEl) {
        var pt = veToPt(e);
        if (drawEl.type === 'line') {
          drawEl.x2 = pt.x;
          drawEl.y2 = pt.y;
        } else {
          var x = Math.min(ve.drawing.x0, pt.x);
          var y = Math.min(ve.drawing.y0, pt.y);
          drawEl.x = x;
          drawEl.y = y;
          drawEl.w = Math.abs(pt.x - ve.drawing.x0);
          drawEl.h = Math.abs(pt.y - ve.drawing.y0);
        }
        styleVeElById(drawEl.id);
      }
    }
  });

  ve.stage.addEventListener('pointerup', function (e) {
    if (ve.drag) {
      ve.drag = null;
      return;
    }
    if (ve.drawing) {
      var el = getVeEl(ve.drawing.id);
      if (el) {
        var tooSmall =
          el.type === 'line'
            ? Math.hypot(el.x2 - el.x1, el.y2 - el.y1) < 2
            : el.w < 2 || el.h < 2;
        if (tooSmall) veRemoveEl(el.id, false);
        else selectVeEl(el.id);
      }
      ve.drawing = null;
    }
  });

  document.addEventListener('keydown', function (e) {
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

  /* ---- save ---- */

  async function drawVeElOnPage(out, page, el, pw, ph, fonts) {
    var C = PDFLib.rgb.apply(null, hexToRgb(el.color || '#111111'));
    try {
      if (el.type === 'text') {
        var key = 'H';
        var std = PDFLib.StandardFonts.Helvetica;
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
        var size = Math.max(1, el.sizePt);
        var yBase = ph - el.y - size * 0.8;
        page.drawText(el.text || '', { x: el.x, y: yBase, size: size, font: fonts[key], color: C });
        if (el.underline) {
          var w = fonts[key].widthOfTextAtSize(el.text || '', size);
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
      var out = await PDFLib.PDFDocument.create();
      var fonts = {};
      for (var i = 0; i < ed.pages.length; i++) {
        var pg = ed.pages[i];
        var src = ed.files[pg.fi].lib;
        var cpList = await out.copyPages(src, [pg.pi]);
        var cp = cpList[0];
        if (pg.rot % 360 !== 0) {
          var cur = cp.getRotation().angle;
          cp.setRotation(PDFLib.degrees((cur + pg.rot) % 360));
        }
        var pw = cp.getWidth();
        var ph = cp.getHeight();
        var st = ve.pages[pageKey(pg)];
        if (st && st.elements && st.elements.length) {
          for (var j = 0; j < st.elements.length; j++) {
            await drawVeElOnPage(out, cp, st.elements[j], pw, ph, fonts);
          }
        }
        out.addPage(cp);
      }
      var bytes = await out.save();
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

  /* ---------------- init ---------------- */

  $('#ed-save').disabled = true;
  $('#ed-start').disabled = true;
  $('#ed-text-open').disabled = true;
})();
