/* ePDFConverter - Organise PDF pages (multi-file unified page grid). All processing happens in the browser. */

(function () {
  'use strict';

  const fileInput = document.getElementById('fileInput');
  const dropArea = document.getElementById('dropArea');
  const fileListSection = document.getElementById('fileListSection');
  const globalThumbnailsContainer = document.getElementById('globalThumbnailsContainer');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const mergeBtn = document.getElementById('mergeBtn');

  if (!fileInput || !dropArea || !fileListSection || !globalThumbnailsContainer || !mergeBtn) return;

  let allPagesList = []; // Global flat list of all pages from all files

  // Click triggers
  dropArea.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      fileInput.value = '';
    }
  });

  // Big Drop Area Drag & Drop
  dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.style.borderColor = 'var(--primary)'; });
  dropArea.addEventListener('dragleave', () => { dropArea.style.borderColor = '#c7d2fe'; });
  dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = '#c7d2fe';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });

  // Main Section Drag & Drop for adding new files
  fileListSection.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
    }
  });

  fileListSection.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    }
  });

  async function handleFiles(files) {
    for (let file of files) {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const fileId = Math.random().toString(36).substring(2, 9);
        try {
          const arrayBuffer = await file.arrayBuffer();
          let numPages = 1;
          let pdfDocPdfJs = null;

          try {
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
            pdfDocPdfJs = await loadingTask.promise;
            numPages = pdfDocPdfJs.numPages;
          } catch (e) {
            console.warn("PDF.js warning:", e);
          }

          for (let i = 1; i <= numPages; i++) {
            allPagesList.push({
              uniqueId: Math.random().toString(36).substring(2, 9),
              fileId: fileId,
              fileName: file.name,
              arrayBuffer: arrayBuffer,
              pdfDocPdfJs: pdfDocPdfJs,
              originalPageNumber: i
            });
          }
        } catch (err) {
          console.error("Error processing file:", err);
        }
      }
    }
    updateUI();
  }

  async function updateUI() {
    if (allPagesList.length > 0) {
      dropArea.style.display = 'none';
      fileListSection.classList.add('show');
    } else {
      dropArea.style.display = '';
      fileListSection.classList.remove('show');
    }

    globalThumbnailsContainer.innerHTML = '';

    for (let [index, pageItem] of allPagesList.entries()) {
      const thumbCard = document.createElement('div');
      thumbCard.className = 'thumbnail-card';
      thumbCard.draggable = true;
      thumbCard.dataset.index = index;

      thumbCard.innerHTML = `
        <canvas id="canvas-${pageItem.uniqueId}"></canvas>
        <span class="page-info-text" title="${pageItem.fileName}">${pageItem.fileName}</span>
        <span class="page-num">Page ${pageItem.originalPageNumber}</span>
        <button class="delete-page-btn" type="button" data-id="${pageItem.uniqueId}" title="Remove Page"><i class="fa-solid fa-xmark"></i></button>
      `;

      thumbCard.querySelector('.delete-page-btn').addEventListener('click', (e) => {
        removePage(e.currentTarget.dataset.id);
      });

      // Drag and Drop Events for Reordering any page anywhere in the grid
      thumbCard.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', index);
        setTimeout(() => thumbCard.classList.add('dragging'), 0);
      });

      thumbCard.addEventListener('dragend', () => {
        thumbCard.classList.remove('dragging');
      });

      thumbCard.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      thumbCard.addEventListener('drop', (e) => {
        e.preventDefault();
        const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const targetIndex = index;

        if (!isNaN(sourceIndex) && sourceIndex !== targetIndex) {
          const movedItem = allPagesList.splice(sourceIndex, 1)[0];
          allPagesList.splice(targetIndex, 0, movedItem);
          updateUI();
        }
      });

      globalThumbnailsContainer.appendChild(thumbCard);

      if (pageItem.pdfDocPdfJs) {
        renderPageThumbnail(pageItem.pdfDocPdfJs, pageItem.originalPageNumber, `canvas-${pageItem.uniqueId}`);
      }
    }
  }

  async function renderPageThumbnail(pdfDoc, pageNum, canvasId) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const context = canvas.getContext('2d');
      const viewport = page.getViewport({ scale: 0.45 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport: viewport }).promise;
    } catch (err) {
      console.error("Error rendering thumbnail:", err);
    }
  }

  function removePage(uniqueId) {
    allPagesList = allPagesList.filter(item => item.uniqueId !== uniqueId);
    updateUI();
  }

  clearAllBtn.addEventListener('click', () => {
    allPagesList = [];
    updateUI();
  });

  mergeBtn.addEventListener('click', async () => {
    if (allPagesList.length === 0) {
      alert("Please select at least 1 PDF file!");
      return;
    }

    mergeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving Organized PDF...';
    mergeBtn.disabled = true;

    try {
      const mergedPdf = await PDFLib.PDFDocument.create();
      const pdfCache = {};

      for (let pageItem of allPagesList) {
        if (!pdfCache[pageItem.fileId]) {
          pdfCache[pageItem.fileId] = await PDFLib.PDFDocument.load(pageItem.arrayBuffer);
        }
        const sourcePdfDoc = pdfCache[pageItem.fileId];
        const [copiedPage] = await mergedPdf.copyPages(sourcePdfDoc, [pageItem.originalPageNumber - 1]);
        mergedPdf.addPage(copiedPage);
      }
      const mergedPdfBytes = await mergedPdf.save();
      const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `organized_document_${Date.now()}.pdf`;
      link.click();
    } catch (err) {
      console.error(err);
      alert("Error while generating PDF. Please check your files and try again.");
    } finally {
      mergeBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Save Organized PDF';
      mergeBtn.disabled = false;
    }
  });
})();
