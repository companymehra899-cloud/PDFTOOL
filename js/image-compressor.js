/* ePDFConverter - Image Compressor (standalone page).
   Compress JPG/JPEG/PNG/WebP images to an exact KB target in-browser. */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };

  var ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  var state = {
    files: [],
    targetBytes: 20 * 1024,
  };

  function fmtBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function fmtTarget(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)) + ' MB';
    return (bytes / 1024) + ' KB';
  }

  function targetTag(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)) + 'mb';
    return (bytes / 1024) + 'kb';
  }

  function baseName(name) {
    return name.replace(/\.[^/.]+$/, '');
  }

  function extFor(mime) {
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/webp') return 'webp';
    return 'png';
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

  async function encodeAtQuality(canvas, mime, quality) {
    return canvasToBlob(canvas, mime, quality / 100);
  }

  async function compressToTargetKB(canvas, mime, targetBytes) {
    var qHigh = 100;
    var qLow = 1;
    var best = null;
    for (var i = 0; i < 10; i++) {
      var q = Math.round((qHigh + qLow) / 2);
      var blob = await encodeAtQuality(canvas, mime, q);
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
      else toast('Please drop a JPG, PNG or WebP image', true);
    });
  }

  function mkEl(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function renderChips() {
    var wrap = $('#ic-files');
    wrap.innerHTML = '';
    state.files.forEach(function (file, idx) {
      var chip = document.createElement('div');
      chip.className = 'chip';

      var thumb = document.createElement('img');
      thumb.className = 'chip-thumb';
      thumb.alt = 'Preview of ' + file.name;
      var thumbUrl = URL.createObjectURL(file);
      thumb.src = thumbUrl;
      thumb.addEventListener('load', function () {
        URL.revokeObjectURL(thumbUrl);
      });
      chip.appendChild(thumb);

      var info = document.createElement('span');
      info.className = 'chip-info';
      info.appendChild(mkEl('span', 'chip-name', file.name));
      info.appendChild(mkEl('span', 'chip-size', fmtBytes(file.size)));
      chip.appendChild(info);

      var x = document.createElement('button');
      x.className = 'chip-x';
      x.textContent = '\u00d7';
      x.setAttribute('aria-label', 'Remove ' + file.name);
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
    $('#ic-options').classList.toggle('show', state.files.length > 0);
    $('#ic-run').disabled = state.files.length === 0;
    if (state.files.length === 0) $('#ic-result').hidden = true;
  }

  function selectKb(bytes) {
    state.targetBytes = bytes;
    $('#ic-kb-custom').value = '';
    var pills = document.querySelectorAll('#ic-kb-pills .kb-pill');
    Array.prototype.forEach.call(pills, function (p) {
      p.classList.toggle('active', parseInt(p.dataset.kb, 10) * 1024 === bytes);
    });
    var mpills = document.querySelectorAll('#ic-mb-pills .kb-pill');
    Array.prototype.forEach.call(mpills, function (p) {
      p.classList.toggle('active', parseInt(p.dataset.mb, 10) * 1024 * 1024 === bytes);
    });
  }

  $('#ic-kb-pills').addEventListener('click', function (e) {
    var pill = e.target.closest('.kb-pill');
    if (!pill || !pill.dataset.kb) return;
    selectKb(parseInt(pill.dataset.kb, 10) * 1024);
  });

  $('#ic-mb-pills').addEventListener('click', function (e) {
    var pill = e.target.closest('.kb-pill');
    if (!pill || !pill.dataset.mb) return;
    selectKb(parseInt(pill.dataset.mb, 10) * 1024 * 1024);
  });

  $('#ic-kb-custom').addEventListener('input', function () {
    var v = parseInt(this.value, 10);
    if (!isNaN(v) && v > 0) {
      state.targetBytes = v * 1024;
      var pills = document.querySelectorAll('#ic-kb-pills .kb-pill');
      Array.prototype.forEach.call(pills, function (p) {
        p.classList.remove('active');
      });
      var mpills = document.querySelectorAll('#ic-mb-pills .kb-pill');
      Array.prototype.forEach.call(mpills, function (p) {
        p.classList.remove('active');
      });
    }
  });

  async function processFile(file) {
    var img = await loadImage(file);
    var baseW = img.naturalWidth;
    var baseH = img.naturalHeight;
    var targetBytes = state.targetBytes;
    var mime = $('#ic-format').value;

    var canvas = drawOnCanvas(img, baseW, baseH);
    var best = await compressToTargetKB(canvas, mime, targetBytes);
    var outW = canvas.width;
    var outH = canvas.height;

    if (!best) {
      var scale = 0.9;
      while (scale > 0.3) {
        var cw = Math.max(1, Math.round(baseW * scale));
        var ch = Math.max(1, Math.round(baseH * scale));
        var sc = drawOnCanvas(img, cw, ch);
        var res = await compressToTargetKB(sc, mime, targetBytes);
        if (res) { best = res; outW = sc.width; outH = sc.height; break; }
        scale -= 0.15;
      }
    }

    if (!best) {
      throw new Error('Could not compress "' + file.name + '" under ' + fmtTarget(state.targetBytes) + '. Try a higher target size.');
    }

    return {
      blob: best.blob,
      w: outW,
      h: outH,
      size: best.blob.size,
      name: baseName(file.name) + '-' + targetTag(state.targetBytes) + '-' + outW + 'x' + outH + '.' + extFor(mime),
    };
  }

  function renderResult(item) {
    var box = $('#ic-result');
    box.innerHTML = '';
    box.hidden = false;

    var url = URL.createObjectURL(item.blob);
    var img = document.createElement('img');
    img.className = 'preview-img';
    img.src = url;
    img.alt = 'Compressed preview';
    box.appendChild(img);

    var stat = document.createElement('div');
    stat.className = 'result-stat';
    var sizeOk = item.size <= state.targetBytes;
    var sizeEl = document.createElement('span');
    sizeEl.innerHTML = 'Size: <b>' + fmtBytes(item.size) + '</b> (target ' + fmtTarget(state.targetBytes) + ', ' + (sizeOk ? 'ok' : 'over') + ') &middot; ';
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

  $('#ic-run').addEventListener('click', async function () {
    if (!state.files.length) return;
    busy('Compressing ' + state.files.length + ' image(s) to ' + fmtTarget(state.targetBytes) + '...');
    try {
      for (var i = 0; i < state.files.length; i++) {
        var item = await processFile(state.files[i]);
        saveAs(item.blob, item.name);
        if (i === state.files.length - 1) renderResult(item);
      }
      toast('Downloaded ' + state.files.length + ' compressed image(s)');
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

  setupDropzone('#ic-dropzone', '#ic-input', function (files) {
    state.files.push.apply(state.files, files);
    renderChips();
    syncOptions();
  });

  $('#ic-run').disabled = true;
})();
