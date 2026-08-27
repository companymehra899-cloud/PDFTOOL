/* ePDFConverter - Merge PDF (standalone page).
   Merge logic reused from js/app.js so behaviour matches the homepage tool. */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };

  function fmtBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
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

  var mg = {
    files: [], // {name, size, file, buf}
  };

  var MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB

  function checkSize(files) {
    var big = files.find(function (f) { return f.size > MAX_PDF_SIZE; });
    if (big) {
      toast('"' + big.name + '" exceeds the 100 MB limit', true);
      return true;
    }
    return false;
  }

  setupDropzone('#mg-dropzone', '#mg-input', function (files) {
    var pdfs = files.filter(function (f) { return f.type === 'application/pdf'; });
    if (!pdfs.length) return toast('Please add PDF files', true);
    if (checkSize(pdfs)) return;
    mg.files.push.apply(mg.files, pdfs.map(function (f) {
      return { name: f.name, size: f.size, file: f, buf: null };
    }));
    renderMergeChips();
  });

  function mgResetUpload() {
    mg.files = [];
    renderMergeChips();
  }

  function renderMergeChips() {
    renderChips('#mg-files', mg.files, {
      numbers: true,
      onRemove: function (i) {
        mg.files.splice(i, 1);
        renderMergeChips();
      },
      onUp: function (i) {
        if (i === 0) return;
        var t = mg.files[i - 1];
        mg.files[i - 1] = mg.files[i];
        mg.files[i] = t;
        renderMergeChips();
      },
      onDown: function (i) {
        if (i >= mg.files.length - 1) return;
        var t = mg.files[i + 1];
        mg.files[i + 1] = mg.files[i];
        mg.files[i] = t;
        renderMergeChips();
      },
    });
    $('#mg-run').disabled = mg.files.length < 2;
    $('#mg-options').classList.toggle('show', mg.files.length > 0);
  }

  $('#mg-run').addEventListener('click', async function () {
    if (mg.files.length < 2) return toast('Add at least 2 PDFs', true);
    busy('Merging PDFs...');
    try {
      var out = await PDFLib.PDFDocument.create();
      for (var i = 0; i < mg.files.length; i++) {
        var item = mg.files[i];
        var buf = item.buf || (item.buf = await item.file.arrayBuffer());
        var src = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
        var pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(function (p) { out.addPage(p); });
      }
      var bytes = await out.save();
      saveAs(new Blob([bytes], { type: 'application/pdf' }), 'merged.pdf');
      toast('Merged ' + mg.files.length + ' PDFs');
      mgResetUpload();
    } catch (err) {
      console.error(err);
      toast('Merge failed', true);
    } finally {
      unbusy();
    }
  });

  $('#mg-run').disabled = true;
})();
