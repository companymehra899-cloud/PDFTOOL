pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfBytesArray = null;
let modifiedTexts = [];

// PDF File select hone par render karein
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  pdfBytesArray = await file.arrayBuffer();
  renderPdfPage(pdfBytesArray);
  document.getElementById('save-btn').disabled = false;
});

// PDF render aur Text Inputs Overlay karne ka function
async function renderPdfPage(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  const scale = 1.5;
  const viewport = page.getViewport({ scale });

  const canvas = document.getElementById('pdf-render');
  const ctx = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({ canvasContext: ctx, viewport }).promise;

  const textContent = await page.getTextContent();
  const textContainer = document.getElementById('text-layer');
  textContainer.innerHTML = '';

  textContent.items.forEach((item) => {
    if (!item.str.trim()) return;

    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = item.str;
    
    // Absolute position to line up with PDF text
    input.style.position = 'absolute';
    input.style.left = `${tx[4]}px`;
    input.style.top = `${tx[5] - fontHeight}px`;
    input.style.fontSize = `${fontHeight}px`;
    input.style.width = `${Math.max(item.width * scale, 50)}px`;
    input.style.border = '1px dashed #007bff';
    input.style.background = 'rgba(255, 255, 255, 0.8)';

    input.addEventListener('change', (e) => {
      modifiedTexts.push({
        originalText: item.str,
        newText: e.target.value,
        x: item.transform[4],
        y: item.transform[5],
        fontSize: Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]),
        width: item.width
      });
    });

    textContainer.appendChild(input);
  });
}

// Save & Overwrite Button Logic
document.getElementById('save-btn').addEventListener('click', async () => {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const pdfDoc = await PDFDocument.load(pdfBytesArray);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  modifiedTexts.forEach(change => {
    // Purane text ko cover karein
    firstPage.drawRectangle({
      x: change.x,
      y: change.y,
      width: change.width + 10,
      height: change.fontSize + 2,
      color: rgb(1, 1, 1),
    });

    // Naya text overwrite karein
    firstPage.drawText(change.newText, {
      x: change.x,
      y: change.y,
      size: change.fontSize,
      font: font,
      color: rgb(0, 0, 0),
    });
  });

  const modifiedPdf = await pdfDoc.save();
  const blob = new Blob([modifiedPdf], { type: 'application/pdf' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'edited_pdf.pdf';
  link.click();
});
