/* ePDFConverter - Image & Signature Resizer (standalone page).
   Resize and compress photos/signatures to an exact KB target with
   optional width/height in cm or px. All processing is local. */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };

  var ACCEPT_TYPES = ['image/jpeg', 'image/png'];

  var CM_TO_PX = 96 / 2.54;

  var state = {
    files: [],
    targetKB: 20,
  };

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

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read image: ' + file.name)); };
      img.src = url;
    });
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

  function drawOnCanvas(img, w, h) {
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function encodeJpegAtQuality(canvas, quality) {
    return canvasToBlob(canvas, 'image/jpeg', quality / 100);
  }

  async function compressToTargetKB(canvas, targetBytes) {
    var qHigh = 100;
    var qLow = 1;
    var best = null;
    for (var i = 0; i < 10; i++) {
      var q = Math.round((qHigh + qLow) / 2);
      var blob = await encodeJpegAtQuality(canvas, q);
      if (blob.size <= targetBytes) {
        best = { blob: blob, quality: q };
        qLow = q + 1;
      } else {
        qHigh = q - 1;
      }
      if (qHigh < qLow) break;
    }
    return best;
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
      files = files.filter(function (f) { return ACCEPT_TYPES.indexOf(f.type) !== -1; });
      if (files.length) onFiles(files);
      else toast('Please drop a JPG or PNG image', true);
    });
  }

  function mkEl(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function renderChips() {
    var wrap = $('#ir-files');
    wrap.innerHTML = '';
    state.files.forEach(function (file, idx) {
      var chip = document.createElement('div');
      chip.className = 'chip';
      chip.appendChild(mkEl('span', 'chip-num', String(idx + 1)));
      chip.appendChild(mkEl('span', 'chip-name', file.name));
      chip.appendChild(mkEl('span', 'chip-size', fmtBytes(file.size)));
      var x = document.createElement('button');
      x.className = 'chip-x';
      x.textContent = '\u00d7';
      x.addEventListener('click', function () {
        state.files.splice(idx, 1);
        renderChips();
        syncOptions();
      });
      chip.appendChild(x);
      wrap.appendChild(chip);
    });
  }

  function syncOptions() {
    $('#ir-options').classList.toggle('show', state.files.length > 0);
    $('#ir-run').disabled = state.files.length === 0;
    if (state.files.length === 0) $('#ir-result').hidden = true;
  }

  function selectKb(kb) {
    state.targetKB = kb;
    $('#ir-kb-custom').value = '';
    var pills = document.querySelectorAll('#ir-kb-pills .kb-pill');
    Array.prototype.forEach.call(pills, function (p) {
      p.classList.toggle('active', parseInt(p.dataset.kb, 10) === kb);
    });
  }

  $('#ir-kb-pills').addEventListener('click', function (e) {
    var pill = e.target.closest('.kb-pill');
    if (!pill || !pill.dataset.kb) return;
    selectKb(parseInt(pill.dataset.kb, 10));
  });

  $('#ir-kb-custom').addEventListener('input', function () {
    var v = parseInt(this.value, 10);
    if (!isNaN(v) && v > 0) {
      state.targetKB = v;
      var pills = document.querySelectorAll('#ir-kb-pills .kb-pill');
      Array.prototype.forEach.call(pills, function (p) {
        p.classList.remove('active');
      });
    }
  });

  $('#ir-unit').addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) return;
    var buttons = Array.prototype.slice.call(document.querySelectorAll('#ir-unit .seg-btn'));
    buttons.forEach(function (b) { b.classList.toggle('active', b === btn); });
  });

  function currentUnit() {
    return document.querySelector('#ir-unit .seg-btn.active').dataset.unit;
  }

  $('#ir-options').addEventListener('click', function (e) {
    var pill = e.target.closest('.kb-pill[data-preset]');
    if (!pill) return;
    var p = pill.dataset.preset;
    var unitRow = $('#ir-unit');
    if (p === 'sig') {
      $('#ir-width').value = '6';
      $('#ir-height').value = '2';
      setUnit('cm');
    } else if (p === 'sig140') {
      $('#ir-width').value = '140';
      $('#ir-height').value = '60';
      setUnit('px');
    } else if (p === 'photo') {
      $('#ir-width').value = '200';
      $('#ir-height').value = '230';
      setUnit('px');
    } else if (p === 'passport') {
      $('#ir-width').value = '3.5';
      $('#ir-height').value = '4.5';
      setUnit('cm');
    }
    void unitRow;
  });

  function setUnit(unit) {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('#ir-unit .seg-btn'));
    buttons.forEach(function (b) {
      b.classList.toggle('active', b.dataset.unit === unit);
    });
  }

  function targetDimPx(img) {
    var wInput = $('#ir-width').value;
    var hInput = $('#ir-height').value;
    var unit = currentUnit();
    if (!wInput || !hInput) return null;
    var scale = unit === 'cm' ? CM_TO_PX : 1;
    var w = Math.max(1, parseFloat(wInput) * scale);
    var h = Math.max(1, parseFloat(hInput) * scale);
    return { w: Math.round(w), h: Math.round(h) };
  }

  async function processFile(file) {
    var img = await loadImage(file);
    var baseW = img.naturalWidth;
    var baseH = img.naturalHeight;
    var w = baseW;
    var h = baseH;
    var dims = targetDimPx(img);
    if (dims) {
      w = dims.w;
      h = dims.h;
    }

    var targetBytes = state.targetKB * 1024;
    var canvas = drawOnCanvas(img, w, h);
    var best = await compressToTargetKB(canvas, targetBytes);
    var outW = canvas.width;
    var outH = canvas.height;

    if (!best) {
      var scale = 0.9;
      while (scale > 0.3) {
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var sc = drawOnCanvas(img, cw, ch);
        var res = await compressToTargetKB(sc, targetBytes);
        if (res) { best = res; outW = sc.width; outH = sc.height; break; }
        scale -= 0.15;
      }
    }

    if (!best) {
      throw new Error('Could not compress "' + file.name + '" under ' + state.targetKB + ' KB. Try a higher target size.');
    }

    return {
      blob: best.blob,
      w: outW,
      h: outH,
      size: best.blob.size,
      name: baseName(file.name) + '-' + state.targetKB + 'kb-' + outW + 'x' + outH + '.jpg',
    };
  }

  function renderResult(item) {
    var box = $('#ir-result');
    box.innerHTML = '';
    box.hidden = false;

    var url = URL.createObjectURL(item.blob);
    var img = document.createElement('img');
    img.className = 'preview-img';
    img.src = url;
    img.alt = 'Resized preview';
    box.appendChild(img);

    var stat = document.createElement('div');
    stat.className = 'result-stat';
    var sizeOk = item.size <= state.targetKB * 1024;
    var sizeEl = document.createElement('span');
    sizeEl.innerHTML = 'Size: <b>' + fmtBytes(item.size) + '</b> (target ' + state.targetKB + ' KB, ' + (sizeOk ? 'ok' : 'over') + ') &middot; ';
    var dimEl = document.createElement('span');
    dimEl.innerHTML = 'Dimensions: <b>' + item.w + ' &times; ' + item.h + ' px</b>';
    stat.appendChild(sizeEl);
    stat.appendChild(dimEl);
    box.appendChild(stat);

    var dl = document.createElement('button');
    dl.className = 'btn primary sm';
    dl.textContent = 'Download again';
    dl.addEventListener('click', function () {
      saveAs(item.blob, item.name);
      toast('Downloaded ' + item.name);
    });
    box.appendChild(dl);
  }

  $('#ir-run').addEventListener('click', async function () {
    if (!state.files.length) return;
    busy('Compressing ' + state.files.length + ' image(s) to ' + state.targetKB + ' KB...');
    try {
      for (var i = 0; i < state.files.length; i++) {
        var item = await processFile(state.files[i]);
        saveAs(item.blob, item.name);
        if (i === state.files.length - 1) renderResult(item);
      }
      toast('Downloaded ' + state.files.length + ' resized image(s)');
      state.files = [];
      renderChips();
      syncOptions();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Compression failed', true);
    } finally {
      unbusy();
    }
  });

  setupDropzone('#ir-dropzone', '#ir-input', function (files) {
    state.files.push.apply(state.files, files);
    renderChips();
    syncOptions();
  });

  $('#ir-run').disabled = true;
})();
