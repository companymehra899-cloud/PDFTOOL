/* ePDFConverter - JPG to PDF (standalone page).
   Conversion logic reused from js/app.js so behaviour matches the homepage tool. */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var IMG_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/svg+xml',
  ];

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

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { reject(new Error('Could not read image: ' + file.name)); };
      img.src = url;
    });
  }

  function imageToCanvas(img) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return c;
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (b) { return b ? resolve(b) : reject(new Error('Canvas export failed')); },
        mime,
        quality
      );
    });
  }

  function setupDropzone(dzSel, inputSel, onFiles, acceptList) {
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
      if (acceptList) files = files.filter(function (f) { return acceptList.indexOf(f.type) !== -1; });
      if (files.length) onFiles(files);
      else toast('Unsupported file type', true);
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
      if (opts.meta) chip.appendChild(mkEl('span', 'chip-size', opts.meta(it)));
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

  var j2p = {
    files: [],
    orient: 'auto',
  };

  setupDropzone('#j2p-dropzone', '#j2p-input', function (files) {
    var imgs = files.filter(function (f) { return f.type.indexOf('image/') === 0; });
    if (!imgs.length) return toast('Please add image files', true);
    j2p.files = j2p.files.concat(imgs);
    renderJ2pChips();
  }, IMG_TYPES);

  function j2pResetUpload() {
    j2p.files = [];
    renderJ2pChips();
  }

  function renderJ2pChips() {
    renderChips('#j2p-files', j2p.files, {
      numbers: true,
      onRemove: function (i) {
        j2p.files.splice(i, 1);
        renderJ2pChips();
      },
    });
    $('#j2p-options').classList.toggle('show', j2p.files.length > 0);
    $('#j2p-run').disabled = j2p.files.length === 0;
  }

  $('#j2p-orient').addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) return;
    j2p.orient = btn.dataset.orient;
    $$('#j2p-orient .seg-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
  });

  $('#j2p-margin').addEventListener('input', function () {
    $('#j2p-margin-val').textContent = $('#j2p-margin').value + ' pt';
  });

  $('#j2p-run').addEventListener('click', async function () {
    if (!j2p.files.length) return;
    var sizeOpt = $('#j2p-size').value;
    var margin = parseInt($('#j2p-margin').value, 10);

    busy('Creating PDF from ' + j2p.files.length + ' image(s)...');
    try {
      var pdf = await PDFLib.PDFDocument.create();
      var pageSizes = { A4: [595.28, 841.89], LETTER: [612, 792], A3: [841.89, 1191.18] };

      for (var i = 0; i < j2p.files.length; i++) {
        var f = j2p.files[i];
        var embedded;
        if (f.type === 'image/jpeg') {
          embedded = await pdf.embedJpg(new Uint8Array(await f.arrayBuffer()));
        } else if (f.type === 'image/png') {
          embedded = await pdf.embedPng(new Uint8Array(await f.arrayBuffer()));
        } else {
          var loaded = await loadImage(f);
          var canvas = imageToCanvas(loaded.img);
          var png = await canvasToBlob(canvas, 'image/png');
          embedded = await pdf.embedPng(new Uint8Array(await png.arrayBuffer()));
        }
        var iw = embedded.width;
        var ih = embedded.height;

        var pw, ph;
        if (sizeOpt === 'fit') {
          pw = Math.min(Math.max(iw, 50), 1440);
          ph = Math.min(Math.max(ih, 50), 1440);
        } else {
          pw = (pageSizes[sizeOpt] || pageSizes.A4)[0];
          ph = (pageSizes[sizeOpt] || pageSizes.A4)[1];
        }

        if (j2p.orient === 'portrait' && pw > ph) { var t = pw; pw = ph; ph = t; }
        if (j2p.orient === 'landscape' && ph > pw) { var t2 = pw; pw = ph; ph = t2; }

        var page = pdf.addPage([pw, ph]);
        var availW = pw - margin * 2;
        var availH = ph - margin * 2;
        var scale = Math.min(availW / iw, availH / ih);
        var dw = iw * scale;
        var dh = ih * scale;
        page.drawImage(embedded, {
          x: (pw - dw) / 2,
          y: (ph - dh) / 2,
          width: dw,
          height: dh,
        });
      }

      var bytes = await pdf.save();
      saveAs(new Blob([bytes], { type: 'application/pdf' }), 'images.pdf');
      toast('PDF created');
      j2pResetUpload();
    } catch (err) {
      console.error(err);
      toast('Conversion failed', true);
    } finally {
      unbusy();
    }
  });

  $('#j2p-run').disabled = true;
})();
