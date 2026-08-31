/* ePDFConverter - Compress PDF (standalone page).
   Compression logic reused from js/app.js so behaviour matches the homepage tool.
   Optimized: concurrent JPEG recompression, skip-small-images, OffscreenCanvas
   encoding, createImageBitmap and explicit memory release / URL revocation. */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB
  var SKIP_SMALL_BYTES = 32 * 1024; // JPEGs already under this size are left untouched

  // Controlled concurrency. Desktop runs up to 4; touch devices and low-memory
  // devices are capped at 2 to bound peak memory during parallel decoding.
  var CONCURRENCY = 4;
  var isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches &&
    (window.innerWidth < 900 || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0));
  if (isTouch) CONCURRENCY = 2;
  if (navigator.deviceMemory && navigator.deviceMemory < 4) CONCURRENCY = 2;

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
  function setBusyText(text) {
    var el = $('#busy-text');
    if (el) el.textContent = text || 'Working...';
  }
  function setBusyPct(pct) {
    var bar = $('#busy-bar');
    var wrap = $('#busy-progress');
    if (!bar || !wrap) return;
    wrap.hidden = false;
    bar.style.width = Math.max(2, Math.min(100, Math.round(pct || 0))) + '%';
  }
  function unbusy() {
    busyCount = Math.max(0, busyCount - 1);
    if (busyCount === 0) {
      var ov = $('#busy-overlay');
      if (ov) ov.hidden = true;
      var wrap = $('#busy-progress');
      if (wrap) {
        wrap.hidden = true;
        $('#busy-bar').style.width = '0%';
      }
    }
  }

  function readBuffer(file) {
    return file.arrayBuffer();
  }

  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function canvasToBlob(canvas, mime, quality) {
    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
      return canvas.convertToBlob({ type: mime, quality: quality });
    }
    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (b) { return b ? resolve(b) : reject(new Error('Canvas export failed')); },
        mime,
        quality
      );
    });
  }

  // Runs `worker` over `items` with at most `limit` tasks in flight at once.
  // Never rejects: each worker result is captured into the results array.
  function mapLimit(items, limit, worker) {
    var total = items.length;
    if (!total) return Promise.resolve([]);
    var next = 0;
    var finished = 0;
    var results = new Array(total);
    return new Promise(function (resolve) {
      function pump() {
        while (next < total && (next - finished) < limit) {
          (function (idx) {
            var p;
            try {
              p = Promise.resolve(worker(items[idx]));
            } catch (e) {
              p = Promise.resolve();
            }
            p.then(function (val) {
              results[idx] = val;
              finished++;
              if (finished === total) resolve(results);
              else pump();
            }, function () {
              results[idx] = null;
              finished++;
              if (finished === total) resolve(results);
              else pump();
            });
          })(next);
          next++;
        }
      }
      pump();
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

  function checkSize(files) {
    var big = files.find(function (f) { return f.size > MAX_PDF_SIZE; });
    if (big) {
      toast('"' + big.name + '" exceeds the 100 MB limit', true);
      return true;
    }
    return false;
  }

  var cp = {
    files: [], // {name, size, buf}
    level: 'fast',
  };

  setupDropzone('#cp-dropzone', '#cp-input', async function (files) {
    var pdfs = files.filter(function (f) { return f.type === 'application/pdf'; });
    if (!pdfs.length) return toast('Please add PDF files', true);
    if (checkSize(pdfs)) return;
    busy('Reading PDFs...');
    try {
      var fresh = [];
      for (var i = 0; i < pdfs.length; i++) {
        var f = pdfs[i];
        if (cp.files.some(function (x) { return x.name === f.name; })) continue;
        fresh.push(f);
      }
      var bufs = await Promise.all(fresh.map(readBuffer));
      for (var k = 0; k < fresh.length; k++) {
        cp.files.push({ name: fresh[k].name, size: fresh[k].size, buf: bufs[k] });
      }
      renderCompressChips();
    } catch (err) {
      toast('Could not read a PDF', true);
    } finally {
      unbusy();
    }
  });

  function renderCompressChips() {
    renderChips('#cp-files', cp.files, {
      numbers: true,
      onRemove: function (i) {
        cp.files.splice(i, 1);
        renderCompressChips();
      },
    });
    $('#cp-run').disabled = cp.files.length === 0;
    $('#cp-options').classList.toggle('show', cp.files.length > 0);
  }

  function cpResetUpload() {
    cp.files = [];
    renderCompressChips();
    $('#cp-result').innerHTML = '';
  }

  $('#cp-level').addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) return;
    cp.level = btn.dataset.level;
    $$('#cp-level .seg-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
  });

  var CP_LEVELS = {
    fast: { quality: 0.5, skip: 64 * 1024 },
    balanced: { quality: 0.4, skip: 48 * 1024 },
    strong: { quality: 0.3, skip: 32 * 1024 },
    extreme: { quality: 0.06, maxDim: 1500, skip: 0 },
  };

  $('#cp-run').addEventListener('click', async function () {
    if (!cp.files.length) return;
    busy('Compressing...');
    var results = [];
    try {
      var level = CP_LEVELS[cp.level] || CP_LEVELS.strong;
      for (var fi = 0; fi < cp.files.length; fi++) {
        var item = cp.files[fi];
        setBusyText('Compressing "' + item.name + '" (' + (fi + 1) + '/' + cp.files.length + ')...');
        var outBytes = await smartCompress(item.buf, level, function (done, total) {
          if (total > 0) {
            var pct = (fi / cp.files.length) * 100 + (done / total) * (100 / cp.files.length);
            setBusyPct(pct);
          }
          setBusyText('Compressing "' + item.name + '" images ' + done + '/' + total + '...');
        });
        results.push({
          name: item.name,
          before: item.size,
          after: outBytes.length,
          bytes: outBytes,
        });
      }
      var downloads = results.map(function (r) {
        return {
          name: r.name.replace(/\.pdf$/i, '') + '-compressed.pdf',
          blob: new Blob([r.bytes], { type: 'application/pdf' }),
        };
      });
      await saveBlobsIndividually(downloads, 700);
      renderCompressResults(results);
    } catch (err) {
      console.error(err);
      toast('Compression failed', true);
    } finally {
      unbusy();
    }
  });

  async function smartCompress(buf, level, onProgress) {
    var doc = await PDFLib.PDFDocument.load(buf, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    try {
      doc.setProducer('');
      doc.setCreator('');
    } catch (e) {
      /* ignore metadata errors */
    }

    var images = [];
    var objs = doc.context.enumerateIndirectObjects();
    for (var i = 0; i < objs.length; i++) {
      var entry = objs[i];
      var obj = entry[1];
      if (!(obj instanceof PDFLib.PDFRawStream)) continue;
      var dict = obj.dict;
      var subtype = dict && dict.lookup(PDFLib.PDFName.of('Subtype'));
      if (subtype && String(subtype) === '/Image') {
        images.push({ ref: entry[0], stream: obj });
      }
    }

    // Images referenced as a soft mask (SMask) or colour-key mask (Mask) by
    // other images must never be re-encoded. They are single-channel masks;
    // turning them into an opaque RGB JPEG corrupts the compositing and makes
    // whole pages render blank/white.
    var protectedRefs = {};
    for (var pi = 0; pi < images.length; pi++) {
      var pdict = images[pi].stream.dict;
      ['SMask', 'Mask'].forEach(function (key) {
        var v = pdict.get(PDFLib.PDFName.of(key));
        if (v instanceof PDFLib.PDFRef) protectedRefs[String(v)] = true;
      });
    }

    // Recompress JPEG images with a bounded pool of concurrent tasks. A single
    // failing image keeps its original bytes and never aborts the whole PDF.
    var done = 0;
    await mapLimit(images, CONCURRENCY, function (img) {
      return recompressImage(img.stream, level, protectedRefs, String(img.ref)).then(function () {
        done++;
        if (onProgress) onProgress(done, images.length);
      });
    });

    var bytes = await doc.save({ useObjectStreams: true });
    return bytes.length < buf.byteLength ? bytes : new Uint8Array(buf);
  }

  function isDctDecode(dict) {
    var filter = dict.lookup(PDFLib.PDFName.of('Filter'));
    if (filter instanceof PDFLib.PDFArray) {
      return filter.asArray().some(function (f) { return String(f) === '/DCTDecode'; });
    }
    return !!filter && String(filter) === '/DCTDecode';
  }

  // Returns true when the image was re-encoded, false when it was kept as-is.
  // Never throws: any failure simply keeps the original image bytes.
  async function recompressImage(stream, level, protectedRefs, refStr) {
    try {
      var dict = stream.dict;
      if (!dict) return false;
      if (protectedRefs && protectedRefs[refStr]) return false;

      // Never touch image masks or images that carry masking/transparency
      // (color-key Mask or SMask). Re-encoding those to an opaque JPEG breaks
      // how the page composites them and blanks out the whole page.
      var mask = dict.lookup(PDFLib.PDFName.of('ImageMask'));
      if (mask instanceof PDFLib.PDFBool && mask.value === true) return false;
      if (dict.get(PDFLib.PDFName.of('Mask'))) return false;
      if (dict.get(PDFLib.PDFName.of('SMask'))) return false;
      if (dict.get(PDFLib.PDFName.of('DecodeParms'))) return false;
      if (!isDctDecode(dict)) return false;

      // Only re-encode images whose color space is a plain, browser-decodable
      // one (DeviceRGB / DeviceGray / unset). CMYK, ICCBased, Separation,
      // Indexed, Cal* etc. decode differently in the browser than in a PDF
      // viewer, so re-encoding those corrupts the page.
      var cs = dict.lookup(PDFLib.PDFName.of('ColorSpace'));
      if (cs) {
        if (cs instanceof PDFLib.PDFName) {
          var s = String(cs);
          if (s !== '/DeviceRGB' && s !== '/DeviceGray') return false;
        } else {
          // PDFArray (Indexed / ICCBased-with-array) or PDFStream (ICCBased)
          // or anything else: not a plain colour space we can safely replace.
          return false;
        }
      }

      var orig = stream.getContents();
      if (!orig || orig.length < (level.skip || SKIP_SMALL_BYTES)) return false;

      var bmp = null;
      try {
        bmp = await decodeJpeg(orig);
      } catch (e) {
        return false;
      }
      var w = bmp.naturalWidth || bmp.width;
      var h = bmp.naturalHeight || bmp.height;
      if (!w || !h || w > 16000 || h > 16000 || w * h > 100000000) {
        if (bmp.close) bmp.close();
        return false;
      }

      var cw = w;
      var ch = h;
      var maxDim = level.maxDim;
      if (maxDim && Math.max(w, h) > maxDim) {
        var scale = maxDim / Math.max(w, h);
        cw = Math.max(1, Math.round(w * scale));
        ch = Math.max(1, Math.round(h * scale));
      }

      var canvas = makeCanvas(cw, ch);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0, cw, ch);
      if (bmp.close) bmp.close();
      bmp = null;

      // Safety net: if decoding silently produced a blank/transparent canvas,
      // keep the original bytes instead of writing a white page.
      if (canvasIsBlank(ctx, cw, ch)) return false;

      var blob = await canvasToBlob(canvas, 'image/jpeg', level.quality);
      if (!blob) return false;
      var bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length >= orig.length) return false;

      stream.contents = bytes;
      dict.set(PDFLib.PDFName.of('Filter'), PDFLib.PDFName.of('DCTDecode'));
      dict.set(PDFLib.PDFName.of('ColorSpace'), PDFLib.PDFName.of('DeviceRGB'));
      dict.set(PDFLib.PDFName.of('BitsPerComponent'), PDFLib.PDFNumber.of(8));
      dict.delete(PDFLib.PDFName.of('DecodeParms'));
      dict.delete(PDFLib.PDFName.of('Decode'));
      dict.delete(PDFLib.PDFName.of('Mask'));
      return true;
    } catch (e) {
      return false;
    }
  }

  // True when the canvas has no opaque pixels anywhere - a reliable sign the
  // image failed to decode and would otherwise be saved as a blank white page.
  function canvasIsBlank(ctx, w, h) {
    try {
      if (!ctx) return false;
      var sw = Math.min(w, 64);
      var sh = Math.min(h, 64);
      var samples = [
        [0, 0],
        [Math.max(0, w - sw), 0],
        [0, Math.max(0, h - sh)],
        [Math.max(0, w - sw), Math.max(0, h - sh)],
      ];
      var opaque = 0;
      for (var i = 0; i < samples.length; i++) {
        var d = ctx.getImageData(samples[i][0], samples[i][1], sw, sh).data;
        for (var j = 3; j < d.length; j += 4) {
          if (d[j] > 0) { opaque++; break; }
        }
      }
      return opaque === 0;
    } catch (e) {
      return false;
    }
  }

  async function decodeJpeg(bytes) {
    var blob = new Blob([bytes], { type: 'image/jpeg' });
    try {
      if ('createImageBitmap' in window) {
        // imageOrientation 'none' keeps raw pixel order. The PDF viewer renders
        // the image without EXIF rotation, so applying it here would rotate
        // pages after compression.
        return await createImageBitmap(blob, { imageOrientation: 'none' });
      }
    } catch (e) {
      /* fall through to Image element */
    }
    return await new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not decode JPEG'));
      };
      img.src = url;
    });
  }

  function renderCompressResults(results) {
    var wrap = $('#cp-result');
    wrap.innerHTML = '';
    results.forEach(function (r) {
      var item = mkEl('div', 'cr-item');
      var info = mkEl('div', 'cr-info');
      info.appendChild(mkEl('div', 'cr-name', r.name));
      info.appendChild(mkEl('div', 'cr-meta', fmtBytes(r.before) + ' \u2192 ' + fmtBytes(r.after)));
      var bar = mkEl('div', 'cr-bar');
      var fill = mkEl('div', 'cr-bar-fill');
      fill.style.width = '100%';
      if (r.before > 0 && r.after < r.before) {
        fill.style.width = Math.max(4, Math.round((r.after / r.before) * 100)) + '%';
      }
      bar.appendChild(fill);
      info.appendChild(bar);
      item.appendChild(info);
      var pct = r.before > 0 ? Math.round(((r.before - r.after) / r.before) * 100) : 0;
      var p = mkEl('div', 'cr-pct' + (pct > 0 ? ' smaller' : ' bigger'));
      p.textContent = pct > 0 ? '-' + pct + '%' : pct === 0 ? '0%' : 'larger';
      item.appendChild(p);
      var dl = document.createElement('button');
      dl.className = 'btn small';
      dl.textContent = 'Download';
      dl.addEventListener('click', function () {
        saveAs(new Blob([r.bytes], { type: 'application/pdf' }), r.name);
      });
      item.appendChild(dl);
      wrap.appendChild(item);
    });
  }

  $('#cp-run').disabled = true;
})();
