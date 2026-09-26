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

  function dropAfter(el, clientX, clientY) {
    var r = el.getBoundingClientRect();
    if (r.width >= r.height) return clientX > r.left + r.width / 2;
    return clientY > r.top + r.height / 2;
  }

  function moveFile(from, to) {
    if (from === to || from < 0 || to < 0 || from >= mg.files.length || to >= mg.files.length) return;
    var item = mg.files.splice(from, 1)[0];
    mg.files.splice(to, 0, item);
    renderMergeChips();
  }

  function renderChips(containerSel, items, opts) {
    var wrap = $(containerSel);
    wrap.innerHTML = '';
    var dragFrom = -1;
    items.forEach(function (it, idx) {
      var chip = document.createElement('div');
      chip.className = 'chip mg-chip';
      chip.draggable = items.length > 1;
      chip.dataset.index = String(idx);
      if (opts.numbers) chip.appendChild(mkEl('span', 'chip-num', String(idx + 1)));
      chip.appendChild(mkEl('span', 'chip-name', it.name));
      if (it.size != null) chip.appendChild(mkEl('span', 'chip-size', fmtBytes(it.size)));
      var x = document.createElement('button');
      x.className = 'chip-x';
      x.type = 'button';
      x.setAttribute('aria-label', 'Remove ' + it.name);
      x.textContent = '\u00d7';
      x.addEventListener('click', function (e) {
        e.stopPropagation();
        opts.onRemove && opts.onRemove(idx);
      });
      chip.appendChild(x);

      if (items.length > 1) {
        chip.addEventListener('dragstart', function (e) {
          if (e.target.closest('.chip-x')) {
            e.preventDefault();
            return;
          }
          dragFrom = idx;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(idx));
          chip.setAttribute('aria-grabbed', 'true');
          setTimeout(function () { chip.classList.add('dragging'); }, 0);
        });
        chip.addEventListener('dragend', function () {
          dragFrom = -1;
          chip.classList.remove('dragging');
          chip.setAttribute('aria-grabbed', 'false');
          Array.prototype.forEach.call(wrap.querySelectorAll('.drop-before, .drop-after'), function (c) {
            c.classList.remove('drop-before', 'drop-after');
          });
        });
        chip.addEventListener('dragover', function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          var after = dropAfter(chip, e.clientX, e.clientY);
          Array.prototype.forEach.call(wrap.querySelectorAll('.drop-before, .drop-after'), function (c) {
            c.classList.remove('drop-before', 'drop-after');
          });
          chip.classList.add(after ? 'drop-after' : 'drop-before');
        });
        chip.addEventListener('drop', function (e) {
          e.preventDefault();
          var sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
          if (isNaN(sourceIndex)) sourceIndex = dragFrom;
          chip.classList.remove('drop-before', 'drop-after');
          if (isNaN(sourceIndex) || sourceIndex === idx) return;
          var after = dropAfter(chip, e.clientX, e.clientY);
          var dest = after
            ? (sourceIndex < idx ? idx : idx + 1)
            : (sourceIndex < idx ? idx - 1 : idx);
          if (dest < 0) dest = 0;
          if (dest >= mg.files.length) dest = mg.files.length - 1;
          opts.onReorder && opts.onReorder(sourceIndex, dest);
        });

        chip.addEventListener('pointerdown', function (e) {
          if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
          if (e.target.closest('.chip-x')) return;
          var startX = e.clientX;
          var startY = e.clientY;
          var started = false;
          function clearMarks() {
            Array.prototype.forEach.call(wrap.querySelectorAll('.drop-before, .drop-after, .dragging'), function (c) {
              c.classList.remove('drop-before', 'drop-after', 'dragging');
            });
          }
          function onMove(ev) {
            var dx = ev.clientX - startX;
            var dy = ev.clientY - startY;
            if (!started && (Math.abs(dx) + Math.abs(dy) < 8)) return;
            if (!started) {
              started = true;
              chip.classList.add('dragging');
              chip.setPointerCapture(e.pointerId);
            }
            ev.preventDefault();
            var el = document.elementFromPoint(ev.clientX, ev.clientY);
            var over = el && el.closest ? el.closest('#mg-files .chip') : null;
            Array.prototype.forEach.call(wrap.querySelectorAll('.drop-before, .drop-after'), function (c) {
              c.classList.remove('drop-before', 'drop-after');
            });
            if (over && over !== chip) {
              over.classList.add(dropAfter(over, ev.clientX, ev.clientY) ? 'drop-after' : 'drop-before');
            }
          }
          function onUp(ev) {
            chip.releasePointerCapture(e.pointerId);
            chip.removeEventListener('pointermove', onMove);
            chip.removeEventListener('pointerup', onUp);
            chip.removeEventListener('pointercancel', onUp);
            if (!started) return;
            var el = document.elementFromPoint(ev.clientX, ev.clientY);
            var over = el && el.closest ? el.closest('#mg-files .chip') : null;
            clearMarks();
            if (!over || over === chip) return;
            var targetIndex = parseInt(over.dataset.index, 10);
            if (isNaN(targetIndex) || targetIndex === idx) return;
            var after = dropAfter(over, ev.clientX, ev.clientY);
            var dest = after
              ? (idx < targetIndex ? targetIndex : targetIndex + 1)
              : (idx < targetIndex ? targetIndex - 1 : targetIndex);
            if (dest < 0) dest = 0;
            if (dest >= mg.files.length) dest = mg.files.length - 1;
            opts.onReorder && opts.onReorder(idx, dest);
          }
          chip.addEventListener('pointermove', onMove);
          chip.addEventListener('pointerup', onUp);
          chip.addEventListener('pointercancel', onUp);
        });
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
    var pdfs = files.filter(function (f) { return f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''); });
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
      onReorder: function (from, to) {
        moveFile(from, to);
      },
    });
    $('#mg-run').disabled = mg.files.length < 2;
    var hasFiles = mg.files.length > 0;
    var was = document.body.classList.contains('mg-work-on');
    document.body.classList.toggle('mg-work-on', hasFiles);
    if (hasFiles && !was) window.scrollTo(0, 0);
    $('#mg-options').classList.toggle('show', hasFiles);
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
