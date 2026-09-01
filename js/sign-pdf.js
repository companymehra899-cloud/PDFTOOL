/* ePDFConverter - Sign PDF (standalone page). All processing happens in the browser. */

(function () {
  'use strict';

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

  async function loadPdfJs(buf) {
    const task = pdfjsLib.getDocument({ data: buf.slice(0) });
    return task.promise;
  }

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

  function showView(name) {
    $$('.view').forEach((v) => v.classList.remove('active'));
    const target = $('#view-' + name);
    if (!target) return;
    target.classList.add('active');
    document.body.classList.toggle('sg-work-on', name === 'sign-work');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB

  function checkSize(files) {
    const big = files.find((f) => f.size > MAX_PDF_SIZE);
    if (big) {
      toast('"' + big.name + '" exceeds the 100 MB limit', true);
      return true;
    }
    return false;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function canvasPngBytes(canvas) {
    const b64 = canvas.toDataURL('image/png').split(',')[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  /* ================================================================
     SIGN PDF
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
    zoom: 1,
    rotation: 0,
  };

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
      sgFillFileCard();
      showView('sign-work');
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
    sgFillFileCard();
    showView('sign-work');
    buildSignThumbs();
    loadSignPage(0);
  });

  function sgLeaveWorkspace() {
    showView('sign');
    renderChips('#sg-files', sg.files, {
      numbers: false,
      onRemove: () => sgResetUpload(),
    });
    if (sg.files.length) $('#sg-upload-options').classList.add('show');
  }

  $('#sg-back').addEventListener('click', sgLeaveWorkspace);

  function sgFillFileCard() {
    const f = sg.files[0];
    const nameEl = $('#sg-file-name');
    const metaEl = $('#sg-file-meta');
    if (!nameEl || !metaEl) return;
    nameEl.textContent = f ? f.name : 'Document.pdf';
    metaEl.textContent = f
      ? fmtBytes(f.size) + ' | ' + sg.pageCount + ' Page' + (sg.pageCount === 1 ? '' : 's')
      : '0 MB | 0 Pages';
  }

  function sgGoPage(i) {
    if (i < 0 || i >= sg.pageCount) return;
    sg.curPage = i;
    $$('#sg-thumbs .sw-thumb').forEach((x) => x.classList.toggle('active', +x.dataset.idx === i));
    loadSignPage(i);
  }

  function buildSignThumbs() {
    const wrap = $('#sg-thumbs');
    wrap.innerHTML = '';
    for (let i = 0; i < sg.pageCount; i++) {
      const b = mkEl('button', 'sw-thumb' + (i === sg.curPage ? ' active' : ''));
      b.type = 'button';
      b.dataset.idx = i;
      const img = document.createElement('img');
      img.alt = 'Page ' + (i + 1);
      b.appendChild(img);
      b.appendChild(document.createTextNode(String(i + 1)));
      b.addEventListener('click', () => sgGoPage(i));
      wrap.appendChild(b);
      sg.pdfJs.getPage(i + 1).then((page) => {
        const vp = page.getViewport({ scale: 0.18 });
        const c = document.createElement('canvas');
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        return page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(() => {
          img.src = c.toDataURL('image/jpeg', 0.7);
        });
      }).catch(() => {});
    }
    sgUpdatePageLabel();
  }

  function sgUpdatePageLabel() {
    const el = $('#sg-page-label');
    if (el) el.textContent = (sg.curPage + 1) + ' / ' + Math.max(1, sg.pageCount);
  }

  async function loadSignPage(idx) {
    if (idx < 0 || idx >= sg.pageCount) return;
    sgUpdatePageLabel();
    const page = await sg.pdfJs.getPage(idx + 1);
    const vp1 = page.getViewport({ scale: 1 });
    const wrap = $('#sg-stage-wrap');
    const targetW = Math.min(680, Math.max(300, (wrap.clientWidth || 680) - 40)) * (sg.zoom || 1);
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
        const art = mkEl('div', 'sw-sig-art');
        el.appendChild(art);

        const rm = mkEl('button', 'sw-sig-rm');
        rm.type = 'button';
        rm.title = 'Remove signature';
        rm.innerHTML = '&times;';
        const removeSig = (e) => {
          if (e) e.stopPropagation();
          sg.pages[sg.curPage] = null;
          drawSignOverlay();
          updateSignThumbs();
          toast('Removed signature from page ' + (sg.curPage + 1));
        };
        rm.addEventListener('pointerdown', (e) => e.stopPropagation());
        rm.addEventListener('click', removeSig);

        const rot = mkEl('button', 'sw-sig-rot');
        rot.type = 'button';
        rot.title = 'Rotate';
        rot.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M3 12a9 9 0 1 0 3-6.7"/><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M3 4v5h5"/></svg>';
        rot.addEventListener('pointerdown', (e) => e.stopPropagation());
        rot.addEventListener('click', (e) => {
          e.stopPropagation();
          sg.rotation = ((sg.rotation || 0) + 90) % 360;
          drawSignOverlay();
        });
        el.appendChild(rot);

        const tools = mkEl('div', 'sw-sig-tools');
        const mkTool = (cls, title, svg, fn) => {
          const b = mkEl('button', cls);
          b.type = 'button';
          b.title = title;
          b.innerHTML = svg;
          b.addEventListener('pointerdown', (e) => e.stopPropagation());
          b.addEventListener('click', fn);
          tools.appendChild(b);
        };
        mkTool('sg-edit', 'Edit', '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" d="m3 21 4-1L18 9a2.1 2.1 0 0 0-3-3L4 17l-1 4Z"/></svg>', (e) => { e.stopPropagation(); toast('Edit the signature in the right panel'); });
        mkTool('sg-del', 'Delete', '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 7h16M9 7V5h6v2m-7 0v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7"/></svg>', removeSig);
        mkTool('sg-move', 'Move', '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg>', (e) => e.stopPropagation());
        el.appendChild(tools);

        const label = mkEl('span', 'sw-sig-label', 'Signature');
        el.appendChild(label);

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
      const art = el.querySelector('.sw-sig-art');
      if (art) {
        art.style.backgroundImage = 'url(' + sg.sig.canvas.toDataURL('image/png') + ')';
        art.style.transform = 'rotate(' + (sg.rotation || 0) + 'deg)';
      }
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

  function sgApplyColor(color) {
    $('#sg-color').value = color;
    sgCtx.strokeStyle = color;
    if (sg.method === 'draw') sgSetSigFromMethod();
    if (sg.method === 'type') sgDrawType();
    drawSignOverlay();
  }

  $('#sg-color').addEventListener('input', () => sgApplyColor($('#sg-color').value));

  $$('#sg-swatches button').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('#sg-swatches button').forEach((b) => b.classList.toggle('active', b === btn));
      sgApplyColor(btn.dataset.color);
    });
  });

  const sgThick = $('#sg-thick');
  if (sgThick) {
    sgThick.addEventListener('input', () => {
      const v = parseInt(sgThick.value, 10) || 3;
      sgCtx.lineWidth = v;
      const lab = $('#sg-thick-val');
      if (lab) lab.textContent = v + 'px';
    });
  }

  const sgZoomSel = $('#sg-zoom');
  function sgSetZoom(z) {
    sg.zoom = clamp(z, 0.5, 2);
    if (sgZoomSel) sgZoomSel.value = String(sg.zoom);
    if (sg.pdfJs) loadSignPage(sg.curPage);
  }
  if (sgZoomSel) sgZoomSel.addEventListener('change', () => sgSetZoom(parseFloat(sgZoomSel.value) || 1));
  const zoomIn = $('#sg-zoom-in');
  const zoomOut = $('#sg-zoom-out');
  if (zoomIn) zoomIn.addEventListener('click', () => sgSetZoom((sg.zoom || 1) + 0.25));
  if (zoomOut) zoomOut.addEventListener('click', () => sgSetZoom((sg.zoom || 1) - 0.25));
  const prevBtn = $('#sg-page-prev');
  const nextBtn = $('#sg-page-next');
  if (prevBtn) prevBtn.addEventListener('click', () => sgGoPage(sg.curPage - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => sgGoPage(sg.curPage + 1));
  const fsBtn = $('#sg-fs');
  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      const wrap = $('#sg-stage-wrap');
      if (!wrap) return;
      if (!document.fullscreenElement) wrap.requestFullscreen && wrap.requestFullscreen();
      else document.exitFullscreen && document.exitFullscreen();
    });
  }
  const startOver = $('#sg-start-over');
  if (startOver) startOver.addEventListener('click', () => {
    sgResetUpload();
    sgLeaveWorkspace();
  });
  const fileRemove = $('#sg-file-remove');
  if (fileRemove) fileRemove.addEventListener('click', () => {
    sgResetUpload();
    sgLeaveWorkspace();
  });
  const addMore = $('#sg-add-more');
  if (addMore) addMore.addEventListener('click', () => {
    $('#sg-input').click();
  });
  const placeBtn = $('#sg-place');
  if (placeBtn) {
    placeBtn.addEventListener('click', () => {
      if (!sg.sig) return toast('Create a signature first', true);
      if (!sg.pages[sg.curPage]) sgAutoPlace();
      else toast('Signature already on this page — drag to move it');
    });
  }
  const saveSig = $('#sg-save-sig');
  if (saveSig) {
    saveSig.addEventListener('click', () => {
      if (!sg.sig) return toast('Create a signature first', true);
      try {
        localStorage.setItem('epdf-saved-sig', sg.sig.canvas.toDataURL('image/png'));
        toast('Signature saved');
      } catch (err) {
        toast('Could not save signature', true);
      }
    });
  }

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
      sgResetUpload();
      sgCtx.clearRect(0, 0, sgDrawCanvas.width, sgDrawCanvas.height);
      $('#sg-type-text').value = '';
      sgTypeCanvas.getContext('2d').clearRect(0, 0, sgTypeCanvas.width, sgTypeCanvas.height);
      sgTypeCanvas.hidden = true;
      const pv = $('#sg-upload-preview');
      pv.hidden = true;
      pv.src = '';
      $('#sg-upload').value = '';
      const stage = $('#sg-stage');
      stage.querySelectorAll('.sw-sig, .sw-hint').forEach((n) => n.remove());
      showView('sign');
      $('#sg-upload-options').classList.add('show');
    } catch (err) {
      console.error(err);
      toast('Signing failed', true);
    } finally {
      unbusy();
    }
  });
})();
