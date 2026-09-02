/* ePDFConverter - Organise PDF pages (multi-file unified page grid). All processing happens in the browser. */

(function () {
  'use strict';

  var fileInput = document.getElementById('fileInput');
  var dropArea = document.getElementById('dropArea');
  var uploadStage = dropArea ? dropArea.closest('.og-upload-stage') : null;
  var fileListSection = document.getElementById('fileListSection');
  var globalThumbnailsContainer = document.getElementById('globalThumbnailsContainer');
  var clearAllBtn = document.getElementById('clearAllBtn');
  var mergeBtn = document.getElementById('mergeBtn');
  var rotateBtn = document.getElementById('rotateBtn');
  var reverseBtn = document.getElementById('reverseBtn');

  if (!fileInput || !dropArea || !fileListSection || !globalThumbnailsContainer || !mergeBtn) return;

  var allPagesList = [];
  var selectedId = null;
  var renderQueue = Promise.resolve();
  var renderGen = 0;
  var dragFrom = -1;

  function toast(msg, isErr) {
    var wrap = document.getElementById('toast-wrap');
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  function busy(text) {
    var ov = document.getElementById('busy-overlay');
    var t = document.getElementById('busy-text');
    if (t) t.textContent = text || 'Working...';
    if (ov) ov.hidden = false;
  }

  function unbusy() {
    var ov = document.getElementById('busy-overlay');
    if (ov) ov.hidden = true;
  }

  function enqueue(fn) {
    renderQueue = renderQueue.then(fn).catch(function (err) {
      console.error(err);
    });
    return renderQueue;
  }

  dropArea.addEventListener('click', function () { fileInput.click(); });
  dropArea.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', function (e) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      fileInput.value = '';
    }
  });

  dropArea.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropArea.classList.add('dragover');
  });
  dropArea.addEventListener('dragleave', function () {
    dropArea.classList.remove('dragover');
  });
  dropArea.addEventListener('drop', function (e) {
    e.preventDefault();
    dropArea.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });

  fileListSection.addEventListener('dragover', function (e) {
    var types = e.dataTransfer && e.dataTransfer.types;
    var hasFiles = types && (types.contains ? types.contains('Files') : Array.prototype.indexOf.call(types, 'Files') !== -1);
    if (hasFiles) e.preventDefault();
  });
  fileListSection.addEventListener('drop', function (e) {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    }
  });

  async function handleFiles(files) {
    busy('Reading PDF...');
    var added = 0;
    try {
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (!file || !/\.pdf$/i.test(file.name)) continue;
        var fileId = Math.random().toString(36).slice(2, 9);
        try {
          var arrayBuffer = await file.arrayBuffer();
          var pdfDocPdfJs = null;
          var numPages = 0;
          if (typeof pdfjsLib === 'undefined') {
            toast('PDF preview library failed to load', true);
            continue;
          }
          try {
            var loadingTask = pdfjsLib.getDocument({
              data: new Uint8Array(arrayBuffer.slice(0)),
              disableRange: true,
              disableStream: true
            });
            pdfDocPdfJs = await loadingTask.promise;
            numPages = pdfDocPdfJs.numPages || 0;
          } catch (e) {
            console.warn('PDF.js warning:', e);
            toast('Could not preview "' + file.name + '"', true);
            continue;
          }
          if (!numPages) continue;
          for (var p = 1; p <= numPages; p++) {
            allPagesList.push({
              uniqueId: fileId + '-' + p + '-' + Math.random().toString(36).slice(2, 7),
              fileId: fileId,
              fileName: file.name,
              arrayBuffer: arrayBuffer,
              pdfDocPdfJs: pdfDocPdfJs,
              originalPageNumber: p,
              rot: 0,
              thumbUrl: null
            });
            added++;
          }
        } catch (err) {
          console.error('Error processing file:', err);
          toast('Could not read "' + file.name + '"', true);
        }
      }
      if (added) toast('Loaded ' + added + ' page(s)');
      else toast('Please add a PDF file', true);
      updateUI();
    } finally {
      unbusy();
    }
  }

  function updateUI() {
    var hasPages = allPagesList.length > 0;
    if (uploadStage) uploadStage.style.display = hasPages ? 'none' : '';
    dropArea.style.display = hasPages ? 'none' : '';
    fileListSection.classList.toggle('show', hasPages);
    if (mergeBtn) mergeBtn.disabled = !hasPages;
    if (rotateBtn) rotateBtn.disabled = !hasPages;
    if (reverseBtn) reverseBtn.disabled = !hasPages;

    globalThumbnailsContainer.innerHTML = '';
    renderGen++;
    var gen = renderGen;

    allPagesList.forEach(function (pageItem, index) {
      var thumbCard = document.createElement('div');
      thumbCard.className = 'thumbnail-card' + (pageItem.uniqueId === selectedId ? ' selected' : '');
      thumbCard.draggable = true;
      thumbCard.dataset.index = String(index);
      thumbCard.dataset.id = pageItem.uniqueId;

      var preview = document.createElement(pageItem.thumbUrl ? 'img' : 'canvas');
      preview.className = 'page-preview';
      preview.setAttribute('alt', 'Page ' + pageItem.originalPageNumber);
      if (pageItem.thumbUrl) preview.src = pageItem.thumbUrl;

      var info = document.createElement('span');
      info.className = 'page-info-text';
      info.title = pageItem.fileName;
      info.textContent = pageItem.fileName;

      var num = document.createElement('span');
      num.className = 'page-num';
      num.textContent = pageItem.rot ? ('Page ' + pageItem.originalPageNumber + ' · ' + pageItem.rot + '°') : ('Page ' + pageItem.originalPageNumber);

      var del = document.createElement('button');
      del.className = 'delete-page-btn';
      del.type = 'button';
      del.title = 'Remove Page';
      del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        removePage(pageItem.uniqueId);
      });

      thumbCard.appendChild(preview);
      thumbCard.appendChild(info);
      thumbCard.appendChild(num);
      thumbCard.appendChild(del);

      thumbCard.addEventListener('click', function (e) {
        if (e.target.closest('.delete-page-btn')) return;
        selectedId = pageItem.uniqueId;
        var cards = globalThumbnailsContainer.querySelectorAll('.thumbnail-card');
        Array.prototype.forEach.call(cards, function (c) {
          c.classList.toggle('selected', c.dataset.id === selectedId);
        });
      });

      thumbCard.addEventListener('dragstart', function (e) {
        dragFrom = index;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        setTimeout(function () { thumbCard.classList.add('dragging'); }, 0);
      });
      thumbCard.addEventListener('dragend', function () {
        dragFrom = -1;
        thumbCard.classList.remove('dragging');
        Array.prototype.forEach.call(globalThumbnailsContainer.querySelectorAll('.drop-before, .drop-after'), function (c) {
          c.classList.remove('drop-before', 'drop-after');
        });
      });
      thumbCard.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        var r = thumbCard.getBoundingClientRect();
        var after = e.clientX > r.left + r.width / 2;
        Array.prototype.forEach.call(globalThumbnailsContainer.querySelectorAll('.drop-before, .drop-after'), function (c) {
          c.classList.remove('drop-before', 'drop-after');
        });
        thumbCard.classList.add(after ? 'drop-after' : 'drop-before');
      });
      thumbCard.addEventListener('drop', function (e) {
        e.preventDefault();
        var sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (isNaN(sourceIndex)) sourceIndex = dragFrom;
        var targetIndex = index;
        thumbCard.classList.remove('drop-before', 'drop-after');
        if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;
        var after = e.clientX > thumbCard.getBoundingClientRect().left + thumbCard.getBoundingClientRect().width / 2;
        var dest = after ? (sourceIndex < targetIndex ? targetIndex : targetIndex + 1) : (sourceIndex < targetIndex ? targetIndex - 1 : targetIndex);
        if (dest < 0) dest = 0;
        if (dest >= allPagesList.length) dest = allPagesList.length - 1;
        if (dest === sourceIndex) return;
        var movedItem = allPagesList.splice(sourceIndex, 1)[0];
        allPagesList.splice(dest, 0, movedItem);
        updateUI();
      });

      globalThumbnailsContainer.appendChild(thumbCard);

      if (!pageItem.thumbUrl && pageItem.pdfDocPdfJs) {
        enqueue(function () {
          if (gen !== renderGen) return;
          return renderPageThumbnail(pageItem, preview, gen);
        });
      }
    });
  }

  async function renderPageThumbnail(pageItem, canvasEl, gen) {
    if (gen !== renderGen) return;
    var page = await pageItem.pdfDocPdfJs.getPage(pageItem.originalPageNumber);
    if (gen !== renderGen) return;
    var rotation = (pageItem.rot || 0) % 360;
    var vp1 = page.getViewport({ scale: 1, rotation: rotation });
    var scale = 180 / Math.max(vp1.width, vp1.height);
    var viewport = page.getViewport({ scale: scale, rotation: rotation });
    var off = document.createElement('canvas');
    off.width = Math.max(1, Math.floor(viewport.width));
    off.height = Math.max(1, Math.floor(viewport.height));
    var ctx = off.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, off.width, off.height);
    }
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    if (gen !== renderGen) return;
    pageItem.thumbUrl = off.toDataURL('image/jpeg', 0.78);
    if (!canvasEl || !canvasEl.isConnected) return;
    var img = document.createElement('img');
    img.className = 'page-preview';
    img.alt = 'Page ' + pageItem.originalPageNumber;
    img.src = pageItem.thumbUrl;
    canvasEl.replaceWith(img);
  }

  function removePage(uniqueId) {
    allPagesList = allPagesList.filter(function (item) { return item.uniqueId !== uniqueId; });
    if (selectedId === uniqueId) selectedId = null;
    updateUI();
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', function () {
      allPagesList = [];
      selectedId = null;
      updateUI();
    });
  }

  if (rotateBtn) {
    rotateBtn.addEventListener('click', function () {
      if (!allPagesList.length) return;
      var target = allPagesList.find(function (p) { return p.uniqueId === selectedId; }) || allPagesList[0];
      target.rot = ((target.rot || 0) + 90) % 360;
      target.thumbUrl = null;
      selectedId = target.uniqueId;
      updateUI();
    });
  }

  if (reverseBtn) {
    reverseBtn.addEventListener('click', function () {
      allPagesList.reverse();
      updateUI();
    });
  }

  mergeBtn.addEventListener('click', async function () {
    if (allPagesList.length === 0) {
      toast('Please select at least 1 PDF file!', true);
      return;
    }

    mergeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving Organized PDF...';
    mergeBtn.disabled = true;
    busy('Building PDF...');

    try {
      var mergedPdf = await PDFLib.PDFDocument.create();
      var pdfCache = {};

      for (var i = 0; i < allPagesList.length; i++) {
        var pageItem = allPagesList[i];
        if (!pdfCache[pageItem.fileId]) {
          pdfCache[pageItem.fileId] = await PDFLib.PDFDocument.load(pageItem.arrayBuffer, { ignoreEncryption: true });
        }
        var sourcePdfDoc = pdfCache[pageItem.fileId];
        var copied = await mergedPdf.copyPages(sourcePdfDoc, [pageItem.originalPageNumber - 1]);
        var copiedPage = copied[0];
        if (pageItem.rot % 360 !== 0) {
          var cur = copiedPage.getRotation().angle || 0;
          copiedPage.setRotation(PDFLib.degrees((cur + pageItem.rot) % 360));
        }
        mergedPdf.addPage(copiedPage);
      }
      var mergedPdfBytes = await mergedPdf.save();
      var blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'organized_document_' + Date.now() + '.pdf';
      document.body.appendChild(link);
      link.click();
      setTimeout(function () {
        URL.revokeObjectURL(link.href);
        link.remove();
      }, 1500);
      toast('Saved ' + allPagesList.length + ' page(s)');
    } catch (err) {
      console.error(err);
      toast('Error while generating PDF. Please check your files and try again.', true);
    } finally {
      mergeBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Save Organized PDF';
      mergeBtn.disabled = false;
      unbusy();
    }
  });
})();
