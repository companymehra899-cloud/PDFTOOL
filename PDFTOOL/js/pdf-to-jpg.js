/* QuickTools - PDF to JPG (standalone page).
   Conversion logic reused from js/app.js so behaviour matches the homepage tool. */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };

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

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (b) { return b ? resolve(b) : reject(new Error('Canvas export failed')); },
        mime,
        quality
      );
    });
  }

  async function saveBlobsIndividually(blobs, delayMs) {
    var d = delayMs || 500;
    for (var i = 0; i < blobs.length; i++) {
      saveAs(blobs[i].blob, blobs[i].name);
      if (i < blobs.length - 1) await new Promise(function (r) { setTimeout(r, d); });
    }
  }

  function loadPdfJs(buf) {
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
      wrap.appendChild(chip);
    });
  }

  function mkEl(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  var p2j = {
    file: null,
    pdfJs: null,
    pageCount: 0,
  };

  setupDropzone('#p2j-dropzone', '#p2j-input', async function (files) {
    var pdf = files.find(function (f) { return f.type === 'application/pdf'; });
    if (!pdf) return toast('Please add a PDF file', true);
    busy('Reading PDF...');
    try {
      var buf = await readBuffer(pdf);
      var doc = await loadPdfJs(buf);
      p2j.file = pdf;
      p2j.pdfJs = doc;
      p2j.pageCount = doc.numPages;
      renderChips('#p2j-files', [pdf], {
        numbers: false,
        onRemove: function () {
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

  $('#p2j-quality').addEventListener('input', function () {
    $('#p2j-quality-val').textContent = $('#p2j-quality').value + '%';
  });

  $('#p2j-run').addEventListener('click', async function () {
    if (!p2j.pdfJs) return;
    var dpi = parseInt($('#p2j-dpi').value, 10);
    var scale = dpi / 72;
    var quality = parseInt($('#p2j-quality').value, 10) / 100;
    var base = baseName(p2j.file.name);

    busy('Converting ' + p2j.pageCount + ' page(s)...');
    try {
      var blobs = [];
      for (var p = 1; p <= p2j.pageCount; p++) {
        var canvas = await renderPageToCanvas(p2j.pdfJs, p, scale, 0);
        var blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        blobs.push({ name: base + '-page-' + p + '.jpg', blob: blob });
      }

      await saveBlobsIndividually(blobs);

      var grid = $('#p2j-result');
      grid.innerHTML = '';
      for (var i = 0; i < blobs.length; i++) {
        var item = mkEl('div', 'preview-item');
        var img = document.createElement('img');
        img.src = URL.createObjectURL(blobs[i].blob);
        img.alt = blobs[i].name;
        item.appendChild(img);
        item.appendChild(mkEl('div', 'pv-name', blobs[i].name));
        var link = mkEl('a', null, 'Download');
        link.href = img.src;
        link.download = blobs[i].name;
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

  $('#p2j-run').disabled = true;
})();
