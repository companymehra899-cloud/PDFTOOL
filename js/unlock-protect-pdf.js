/* ePDFConverter - Unlock / Protect PDF (standalone page). All processing happens in the browser. */

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function fmtBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function toast(msg, isErr) {
    const wrap = $('#toast-wrap');
    const el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  let busyCount = 0;
  function busy(text) {
    busyCount++;
    const ov = $('#busy-overlay');
    $('#busy-text').textContent = text || 'Working...';
    ov.hidden = false;
  }
  function setBusyText(text) {
    const el = $('#busy-text');
    if (el) el.textContent = text || 'Working...';
  }
  function setBusyPct(pct) {
    const bar = $('#busy-bar');
    const wrap = $('#busy-progress');
    if (!bar || !wrap) return;
    wrap.hidden = false;
    bar.style.width = Math.max(2, Math.min(100, Math.round(pct || 0))) + '%';
  }
  function unbusy() {
    busyCount = Math.max(0, busyCount - 1);
    if (busyCount === 0) {
      $('#busy-overlay').hidden = true;
      const wrap = $('#busy-progress');
      if (wrap) {
        wrap.hidden = true;
        $('#busy-bar').style.width = '0%';
      }
    }
  }

  function readBuffer(file) {
    return file.arrayBuffer();
  }

  function setupDropzone(dzSel, inputSel, onFiles, acceptList) {
    const dz = $(dzSel);
    const input = $(inputSel);
    if (!dz || !input) return;

    dz.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files.length) onFiles(Array.from(input.files));
      input.value = '';
    });
    ['dragover', 'dragenter'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add('dragover');
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove('dragover');
      })
    );
    dz.addEventListener('drop', (e) => {
      let files = Array.from(e.dataTransfer.files);
      if (acceptList) files = files.filter((f) => acceptList.includes(f.type));
      if (files.length) onFiles(files);
      else toast('Unsupported file type', true);
    });
  }

  function renderChips(containerSel, items, opts) {
    const wrap = $(containerSel);
    wrap.innerHTML = '';
    items.forEach((it, idx) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      if (opts.numbers) chip.appendChild(mkEl('span', 'chip-num', String(idx + 1)));
      chip.appendChild(mkEl('span', 'chip-name', it.name));
      if (it.size != null) chip.appendChild(mkEl('span', 'chip-size', fmtBytes(it.size)));
      if (opts.meta) chip.appendChild(mkEl('span', 'chip-size', opts.meta(it)));
      const x = document.createElement('button');
      x.className = 'chip-x';
      x.textContent = '\u00d7';
      x.addEventListener('click', () => opts.onRemove && opts.onRemove(idx));
      chip.appendChild(x);
      if (opts.onUp && opts.onDown && items.length > 1) {
        const up = document.createElement('button');
        up.className = 'chip-x';
        up.textContent = '\u2191';
        up.addEventListener('click', () => opts.onUp(idx));
        const down = document.createElement('button');
        down.className = 'chip-x';
        down.textContent = '\u2193';
        down.addEventListener('click', () => opts.onDown(idx));
        chip.insertBefore(up, x);
        chip.insertBefore(down, x);
      }
      wrap.appendChild(chip);
    });
  }

  function mkEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function showView(name) {
    $$('.view').forEach((v) => v.classList.remove('active'));
    const target = $('#view-' + name);
    if (!target) return;
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB

  function checkSize(files) {
    const big = files.find((f) => f.size > MAX_PDF_SIZE);
    if (big) {
      toast('"' + big.name + '" exceeds the 100 MB limit', true);
      return true;
    }
    return false;
  }

  function renderResults(results) {
    const wrap = $('#sc-result');
    wrap.innerHTML = '';
    results.forEach((r) => {
      const item = mkEl('div', 'cr-item');
      const info = mkEl('div', 'cr-info');
      info.appendChild(mkEl('div', 'cr-name', r.name));
      info.appendChild(mkEl('div', 'cr-meta', fmtBytes(r.before) + ' \u2192 ' + fmtBytes(r.after)));
      const bar = mkEl('div', 'cr-bar');
      const fill = mkEl('div', 'cr-bar-fill');
      fill.style.width = '100%';
      if (r.before > 0 && r.after < r.before) {
        fill.style.width = Math.max(4, Math.round((r.after / r.before) * 100)) + '%';
      }
      bar.appendChild(fill);
      info.appendChild(bar);
      item.appendChild(info);
      const pct = r.before > 0 ? Math.round(((r.before - r.after) / r.before) * 100) : 0;
      const p = mkEl('div', 'cr-pct' + (pct > 0 ? ' smaller' : ' bigger'));
      p.textContent = pct > 0 ? '-' + pct + '%' : pct === 0 ? '0%' : 'larger';
      item.appendChild(p);
      const dl = document.createElement('button');
      dl.className = 'btn small';
      dl.textContent = 'Download';
      dl.addEventListener('click', () => {
        saveAs(new Blob([r.bytes], { type: 'application/pdf' }), r.name);
      });
      item.appendChild(dl);
      wrap.appendChild(item);
    });
  }

  /* ================================================================
     UNLOCK / PROTECT PDF
     ================================================================ */

  const sc = {
    files: [], // {name, size, buf}
    mode: 'unlock',
  };

  let qpdfPromise = null;
  function getQpdf() {
    if (!qpdfPromise) {
      if (typeof window.Module !== 'function') {
        qpdfPromise = Promise.reject(new Error('PDF engine failed to load'));
      } else {
        qpdfPromise = window.Module({ locateFile: (f) => 'js/vendor/qpdf/' + f });
      }
    }
    return qpdfPromise;
  }

  function callMainSafe(q, args) {
    try {
      return q.callMain(args);
    } catch (e) {
      return e && typeof e.status === 'number' ? e.status : -1;
    }
  }

  function scResetUpload() {
    sc.files = [];
    renderChips('#sc-files', [], {});
    $('#sc-upload-options').classList.remove('show');
    $('#sc-result').innerHTML = '';
    $('#sc-start').disabled = true;
  }

  setupDropzone('#sc-dropzone', '#sc-input', async (files) => {
    const pdfs = files.filter((f) => f.type === 'application/pdf');
    if (!pdfs.length) return toast('Please add PDF files', true);
    if (checkSize(pdfs)) return;
    busy('Reading PDFs...');
    try {
      for (const f of pdfs) {
        if (sc.files.some((x) => x.name === f.name)) continue;
        sc.files.push({ name: f.name, size: f.size, buf: await readBuffer(f) });
      }
      renderSecureChips();
      showView('secure-work');
      $('#sc-result').innerHTML = '';
    } catch (err) {
      toast('Could not read a PDF', true);
    } finally {
      unbusy();
    }
  });

  $('#sc-upload-remove').addEventListener('click', scResetUpload);

  function renderSecureChips() {
    renderChips('#sc-files', sc.files, {
      numbers: true,
      onRemove: (i) => {
        sc.files.splice(i, 1);
        renderSecureChips();
      },
    });
    $('#sc-start').disabled = sc.files.length === 0;
    $('#sc-upload-options').classList.toggle('show', sc.files.length > 0);
  }

  $('#sc-start').addEventListener('click', () => {
    if (!sc.files.length) return toast('Add a PDF first', true);
    showView('secure-work');
    $('#sc-result').innerHTML = '';
  });

  $('#sc-back').addEventListener('click', () => {
    showView('secure');
    renderSecureChips();
  });

  $('#sc-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    sc.mode = btn.dataset.mode;
    $$('#sc-mode .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    const protect = sc.mode === 'protect';
    $('#sc-unlock-row').style.display = protect ? 'none' : '';
    $('#sc-protect-row').style.display = protect ? '' : 'none';
    $('#sc-protect-row2').style.display = protect ? '' : 'none';
    $('#sc-perm-row').style.display = protect ? '' : 'none';
  });

  $('#sc-run').addEventListener('click', async () => {
    if (!sc.files.length) return;
    busy('Processing ' + sc.files.length + ' PDF(s)...');
    const results = [];
    try {
      const q = await getQpdf();
      const FS = q.FS;
      for (let i = 0; i < sc.files.length; i++) {
        const item = sc.files[i];
        setBusyText('Processing "' + item.name + '" (' + (i + 1) + '/' + sc.files.length + ')...');
        FS.writeFile('/in.pdf', new Uint8Array(item.buf));
        let args;
        if (sc.mode === 'unlock') {
          const pass = $('#sc-unlock-pass').value || '';
          args = ['/in.pdf', '/out.pdf', '--decrypt'];
          if (pass) args.splice(2, 0, '--password=' + pass);
        } else {
          const p1 = $('#sc-pass1').value;
          const p2 = $('#sc-pass2').value;
          if (!p1) {
            unbusy();
            return toast('Enter a password', true);
          }
          if (p1 !== p2) {
            unbusy();
            return toast('Passwords do not match', true);
          }
          const perms = {
            allowPrint: $('#sc-perm-print').checked,
            allowCopy: $('#sc-perm-copy').checked,
            allowModify: $('#sc-perm-modify').checked,
          };
          args = [
            '--encrypt', p1, p1, '256',
            '--print=' + (perms.allowPrint ? 'full' : 'none'),
            '--extract=' + (perms.allowCopy ? 'y' : 'n'),
            '--modify=' + (perms.allowModify ? 'all' : 'none'),
            '--', '/in.pdf', '/out.pdf',
          ];
        }
        try { FS.unlink('/out.pdf'); } catch (e) { /* no previous output */ }
        const code = callMainSafe(q, args);
        if (code !== 0) {
          if (sc.mode === 'unlock') {
            const pass = $('#sc-unlock-pass').value || '';
            if (!pass) toast('"' + item.name + '" is password-protected. Enter its password.', true);
            else toast('Wrong password for "' + item.name + '"', true);
          } else {
            toast('Could not protect "' + item.name + '"', true);
          }
          continue;
        }
        let bytes;
        try {
          bytes = FS.readFile('/out.pdf');
        } catch (e) {
          toast('Could not read output for "' + item.name + '"', true);
          continue;
        }
        results.push({
          name: item.name.replace(/\.pdf$/i, '') + (sc.mode === 'unlock' ? '-unlocked.pdf' : '-protected.pdf'),
          before: item.size,
          after: bytes.length,
          bytes,
        });
      }
      $('#sc-result').innerHTML = '';
      renderResults(results);
      if (results.length) {
        results.forEach((r) => {
          saveAs(new Blob([r.bytes], { type: 'application/pdf' }), r.name);
        });
        toast((sc.mode === 'unlock' ? 'Unlocked ' : 'Protected ') + results.length + ' PDF(s)');
      }
    } catch (err) {
      console.error(err);
      toast('Processing failed', true);
    } finally {
      unbusy();
    }
  });
})();
