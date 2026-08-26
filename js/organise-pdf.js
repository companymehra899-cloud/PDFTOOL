/* ePDFConverter - Organise PDF pages (standalone page). All processing happens in the browser. */

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

  /* ================================================================
     ORGANISE PAGES
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
    renderOrganiseGrid();
    toast('Loaded ' + og.pages.length + ' page(s)');
  });

  $('#og-back').addEventListener('click', () => {
    showView('organise');
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
      card.appendChild(mkEl('div', 'page-label', 'Page ' + (pg.src + 1)));
      const badge = mkEl('span', 'page-badge', String(pg.src + 1));
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
      ogResetUpload();
      showView('organise');
    } catch (err) {
      console.error(err);
      toast('Save failed', true);
    } finally {
      unbusy();
    }
  });

  $('#og-start').disabled = true;
  $('#og-save').disabled = true;
})();
