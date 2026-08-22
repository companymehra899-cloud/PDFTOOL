/* QuickTools - Resize Image (standalone page).
   Resize logic reused from js/app.js so behaviour matches the homepage tool. */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };

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

  var rz = {
    files: [],
    mode: 'percent',
    unit: 'px',
  };

  setupDropzone('#rz-dropzone', '#rz-input', function (files) {
    rz.files.push.apply(rz.files, files);
    renderResizeChips();
    syncResizeOptions();
  }, IMG_TYPES);

  function renderResizeChips() {
    renderChips('#rz-files', rz.files, {
      numbers: true,
      onRemove: function (i) {
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

  $('#rz-mode').addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) return;
    rz.mode = btn.dataset.mode;
    var buttons = Array.prototype.slice.call(document.querySelectorAll('#rz-mode .seg-btn'));
    buttons.forEach(function (b) { b.classList.toggle('active', b === btn); });
    var v1 = $('#rz-value');
    var v2 = $('#rz-value2');
    var label = $('#rz-param-label');
    var unitRow = $('#rz-unit-row');
    if (rz.mode === 'percent') {
      label.textContent = 'Scale (%)';
      v1.value = 50;
      v2.style.display = 'none';
      unitRow.style.display = 'none';
    } else if (rz.mode === 'width') {
      label.textContent = 'Width';
      v1.value = rz.unit === 'px' ? 800 : rz.unit === 'in' ? 8 : rz.unit === 'cm' ? 21 : 100;
      v2.style.display = 'none';
      unitRow.style.display = '';
    } else if (rz.mode === 'height') {
      label.textContent = 'Height';
      v1.value = rz.unit === 'px' ? 800 : rz.unit === 'in' ? 8 : rz.unit === 'cm' ? 29 : 100;
      v2.style.display = 'none';
      unitRow.style.display = '';
    } else {
      label.textContent = 'Width \u00d7 Height';
      v1.value = rz.unit === 'px' ? 800 : rz.unit === 'in' ? 8 : rz.unit === 'cm' ? 21 : 100;
      v2.value = rz.unit === 'px' ? 600 : rz.unit === 'in' ? 6 : rz.unit === 'cm' ? 15 : 100;
      v2.style.display = 'inline-block';
      unitRow.style.display = '';
    }
  });

  function unitToPx(v, unit, refPx) {
    if (unit === 'in') return v * 96;
    if (unit === 'cm') return v * 96 / 2.54;
    if (unit === 'pct') return refPx ? (v / 100) * refPx : v;
    return v;
  }

  function convertUnit(v, fromUnit, toUnit, refPx) {
    var px;
    if (fromUnit === 'in') px = v * 96;
    else if (fromUnit === 'cm') px = v * 96 / 2.54;
    else if (fromUnit === 'pct') px = refPx ? (v / 100) * refPx : v;
    else px = v;
    if (toUnit === 'in') return px / 96;
    if (toUnit === 'cm') return px * 2.54 / 96;
    if (toUnit === 'pct') return refPx ? (px / refPx) * 100 : px;
    return px;
  }

  function roundVal(v, unit) {
    if (unit === 'in' || unit === 'cm' || unit === 'pct') return Math.round(v * 100) / 100;
    return Math.round(v);
  }

  function loadFirstImageDims() {
    return new Promise(function (resolve) {
      if (!rz.files.length) { resolve(null); return; }
      var url = URL.createObjectURL(rz.files[0]);
      var img = new Image();
      img.onload = function () {
        var d = { w: img.naturalWidth, h: img.naturalHeight };
        URL.revokeObjectURL(url);
        resolve(d);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  $('#rz-unit').addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn || btn.dataset.unit === rz.unit) return;
    var newUnit = btn.dataset.unit;
    var oldUnit = rz.unit;
    var needsRef = oldUnit === 'pct' || newUnit === 'pct';
    var applyConversion = function (ref) {
      var refW = ref ? ref.w : 0;
      var refH = ref ? ref.h : 0;
      var ref1 = rz.mode === 'height' ? refH : refW;
      var ref2 = refH;
      var v1 = $('#rz-value');
      var v2 = $('#rz-value2');
      var nv1 = convertUnit(parseFloat(v1.value) || 0, oldUnit, newUnit, ref1);
      v1.value = roundVal(nv1, newUnit);
      if (v2.style.display !== 'none') {
        var nv2 = convertUnit(parseFloat(v2.value) || 0, oldUnit, newUnit, ref2);
        v2.value = roundVal(nv2, newUnit);
      }
      rz.unit = newUnit;
      var buttons = Array.prototype.slice.call(document.querySelectorAll('#rz-unit .seg-btn'));
      buttons.forEach(function (b) { b.classList.toggle('active', b === btn); });
    };
    if (needsRef) {
      loadFirstImageDims().then(applyConversion);
    } else {
      applyConversion(null);
    }
  });

  $('#rz-quality').addEventListener('input', function () {
    $('#rz-quality-val').textContent = $('#rz-quality').value + '%';
  });

  $('#rz-run').addEventListener('click', async function () {
    if (!rz.files.length) return;
    var mode = rz.mode;
    var value = Math.max(0.1, parseFloat($('#rz-value').value) || 0);
    var value2 = Math.max(0.1, parseFloat($('#rz-value2').value) || 0);
    var fmt = $('#rz-format').value;
    var quality = parseInt($('#rz-quality').value, 10) / 100;

    busy('Resizing ' + rz.files.length + ' image(s)...');
    try {
      var blobs = [];
      for (var i = 0; i < rz.files.length; i++) {
        var f = rz.files[i];
        var loaded = await loadImage(f);
        var img = loaded.img;
        var baseW = img.naturalWidth;
        var baseH = img.naturalHeight;
        var w, h;
        if (mode === 'percent') {
          w = Math.max(1, Math.round((baseW * value) / 100));
          h = Math.max(1, Math.round((baseH * value) / 100));
        } else if (mode === 'width') {
          var wPx = unitToPx(value, rz.unit, baseW);
          w = Math.max(1, Math.round(wPx));
          h = Math.max(1, Math.round((wPx / baseW) * baseH));
        } else if (mode === 'height') {
          var hPx = unitToPx(value, rz.unit, baseH);
          h = Math.max(1, Math.round(hPx));
          w = Math.max(1, Math.round((hPx / baseH) * baseW));
        } else {
          w = Math.max(1, Math.round(unitToPx(value, rz.unit, baseW)));
          h = Math.max(1, Math.round(unitToPx(value2, rz.unit, baseH)));
        }

        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        var mime = fmt;
        if (mime === 'keep') {
          mime = ['image/jpeg', 'image/png', 'image/webp'].indexOf(f.type) !== -1
            ? f.type
            : 'image/png';
        }
        var blob = await canvasToBlob(canvas, mime, quality);
        blobs.push({ name: baseName(f.name) + '-' + w + 'x' + h + '.' + extFor(mime), blob: blob });
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

  $('#rz-run').disabled = true;
})();
