/* ePDFConverter - Image & Signature Resizer (standalone page).
   Resize and compress photos/signatures to an exact KB target with
   optional width/height in cm or px. All processing is local. */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };

  var ACCEPT_TYPES = ['image/jpeg', 'image/png'];

  var CM_TO_PX = 96 / 2.54;
  var MM_TO_PX = 96 / 25.4;

  var state = {
    files: [],
    targetKB: 20,
  };

  function fmtBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function fmtKB(kb) {
    if (kb >= 1024) return (kb / 1024) + ' MB';
    return kb + ' KB';
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
      files = files.filter(function (f) {
        return ACCEPT_TYPES.indexOf(f.type) !== -1 || /\.(jpe?g|png)$/i.test(f.name || '');
      });
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
    var hasFiles = state.files.length > 0;
    var was = document.body.classList.contains('ir-work-on');
    document.body.classList.toggle('ir-work-on', hasFiles);
    if (hasFiles && !was) window.scrollTo(0, 0);
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function syncSliderLabels() {
    var kbEl = $('#ir-kb-val');
    var mbEl = $('#ir-mb-val');
    if (kbEl) kbEl.textContent = clamp(Math.round(state.targetKB), 10, 1000) + ' KB';
    if (mbEl) mbEl.textContent = Math.max(1, Math.round(state.targetKB / 1024) || 1) + ' MB';
  }

  function selectKb(kb, fromMb) {
    kb = Math.max(1, parseInt(kb, 10) || 20);
    state.targetKB = kb;
    var kbSlider = $('#ir-kb-slider');
    var mbSlider = $('#ir-mb-slider');
    if (kbSlider && !fromMb) kbSlider.value = String(clamp(kb, 10, 1000));
    if (mbSlider && fromMb) mbSlider.value = String(clamp(Math.round(kb / 1024), 1, 10));
    if (kbSlider && fromMb && kb < 1024) kbSlider.value = String(clamp(kb, 10, 1000));
    if (mbSlider && !fromMb && kb >= 1024) mbSlider.value = String(clamp(Math.round(kb / 1024), 1, 10));
    syncSliderLabels();
  }

  var kbSliderEl = $('#ir-kb-slider');
  if (kbSliderEl) {
    kbSliderEl.addEventListener('input', function () {
      selectKb(this.value, false);
    });
  }

  var mbSliderEl = $('#ir-mb-slider');
  if (mbSliderEl) {
    mbSliderEl.addEventListener('input', function () {
      selectKb(parseInt(this.value, 10) * 1024, true);
    });
  }

  function currentUnit() {
    var sel = $('#ir-unit-select');
    return sel && sel.value ? sel.value : 'px';
  }

  var PRESETS = {
    sig: { w: '6', h: '2', unit: 'cm' },
    sig140: { w: '140', h: '60', unit: 'px' },
    photo: { w: '200', h: '230', unit: 'px' },
    passport: { w: '3.5', h: '4.5', unit: 'cm' },
    cm45: { w: '4', h: '5', unit: 'cm' },
    cm4535: { w: '4.5', h: '3.5', unit: 'cm' },
    sig5x2: { w: '5', h: '2', unit: 'cm' },
    mm5020: { w: '50', h: '20', unit: 'mm' },
    mm3545: { w: '35', h: '45', unit: 'mm' },
    mm4050: { w: '40', h: '50', unit: 'mm' },
    mm4535: { w: '45', h: '35', unit: 'mm' },
    px300: { w: '300', h: '400', unit: 'px' },
    px600: { w: '600', h: '800', unit: 'px' }
  };

  function applyPreset(key) {
    var p = PRESETS[key];
    if (!p) return;
    $('#ir-width').value = p.w;
    $('#ir-height').value = p.h;
    setUnit(p.unit);
  }

  function setUnit(unit) {
    var sel = $('#ir-unit-select');
    if (sel) sel.value = unit;
  }

  function bindPresetSelect(id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('change', function () {
      if (!this.value) return;
      applyPreset(this.value);
      var others = ['#ir-preset-cm', '#ir-preset-mm', '#ir-preset-px'];
      others.forEach(function (sel) {
        if (sel !== id && $(sel)) $(sel).value = '';
      });
    });
  }
  bindPresetSelect('#ir-preset-cm');
  bindPresetSelect('#ir-preset-mm');
  bindPresetSelect('#ir-preset-px');
  syncSliderLabels();

  function targetDimPx(img) {
    var wInput = $('#ir-width').value;
    var hInput = $('#ir-height').value;
    var unit = currentUnit();
    if (!wInput || !hInput) return null;
    var scale = unit === 'cm' ? CM_TO_PX : (unit === 'mm' ? MM_TO_PX : 1);
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
      throw new Error('Could not compress "' + file.name + '" under ' + fmtKB(state.targetKB) + '. Try a higher target size.');
    }

    return {
      blob: best.blob,
      w: outW,
      h: outH,
      size: best.blob.size,
      name: baseName(file.name) + '-' + (state.targetKB >= 1024 ? (state.targetKB / 1024) + 'mb' : state.targetKB + 'kb') + '-' + outW + 'x' + outH + '.jpg',
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
    sizeEl.innerHTML = 'Size: <b>' + fmtBytes(item.size) + '</b> (target ' + fmtKB(state.targetKB) + ', ' + (sizeOk ? 'ok' : 'over') + ') &middot; ';
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
    busy('Compressing ' + state.files.length + ' image(s) to ' + fmtKB(state.targetKB) + '...');
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
    files = files.filter(function (f) {
      return ACCEPT_TYPES.indexOf(f.type) !== -1 || /\.(jpe?g|png)$/i.test(f.name || '');
    });
    if (!files.length) return toast('Please add a JPG or PNG image', true);
    state.files.push.apply(state.files, files);
    renderChips();
    syncOptions();
  });

  var params = new URLSearchParams(window.location.search);
  var kbParam = parseInt(params.get('kb'), 10);
  if (!isNaN(kbParam) && kbParam > 0) {
    selectKb(kbParam);
    document.title = 'Resize Image to ' + kbParam + 'KB Online';
    var h1 = document.getElementById('ir-h1');
    if (h1) h1.textContent = 'Resize Image to ' + kbParam + 'KB Online';
  }
  var mbParam = parseInt(params.get('mb'), 10);
  if (!isNaN(mbParam) && mbParam > 0) {
    selectKb(mbParam * 1024);
    var mbTitle = 'Resize Image to ' + mbParam + 'MB Online';
    document.title = mbTitle;
    var mbH1 = document.getElementById('ir-h1');
    if (mbH1) mbH1.textContent = mbTitle;
  }

  $('#ir-run').disabled = true;
})();
