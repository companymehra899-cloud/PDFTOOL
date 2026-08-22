/* QuickTools - Unlock / Protect PDF (standalone page). All processing happens in the browser. */

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
      dl.addEventListener('click', () =>
        saveAs(new Blob([r.bytes], { type: 'application/pdf' }), r.name)
      );
      item.appendChild(dl);
      wrap.appendChild(item);
    });
  }

  /* ================================================================
     PROTECT PDF ENCRYPTION (qpdf WASM)
     pdf-lib can decrypt PDFs but cannot write encrypted ones, so
     encryption is delegated to qpdf (compiled to WASM) which runs in
     a Web Worker. Every result is verified before being offered for
     download: the output must contain a security handler, must open
     with the entered password, and must reject a wrong password.
     ================================================================ */

  const QPDF_JS_URL = 'https://cdn.jsdelivr.net/npm/@neslinesli93/qpdf-wasm@0.3.0/dist/qpdf.js';
  const QPDF_WASM_URL = 'https://cdn.jsdelivr.net/npm/@neslinesli93/qpdf-wasm@0.3.0/dist/qpdf.wasm';

  const QPDF_WORKER_SOURCE = [
    "importScripts('" + QPDF_JS_URL + "');",
    "var QPDF_WASM_URL='" + QPDF_WASM_URL + "';",
    'var qpdf = null;',
    'function ownerHex(){var a=new Uint8Array(24);if(self.crypto&&self.crypto.getRandomValues){self.crypto.getRandomValues(a);}else{for(var i=0;i<a.length;i++){a[i]=Math.floor(Math.random()*256);}}var s="";for(var j=0;j<a.length;j++){s+=(a[j]<16?"0":"")+a[j].toString(16);}return s;}',
    'function loadQpdf(){return new Promise(function(res,rej){if(qpdf){return res(qpdf);}Module({noInitialRun:true,locateFile:function(){return QPDF_WASM_URL;}}).then(function(m){qpdf=m;qpdf.print=function(){};qpdf.printErr=function(){};res(qpdf);},rej);});}',
    'function runQpdf(args,expectOut){try{qpdf.callMain(args);}catch(e){return false;}if(expectOut){try{if(qpdf.FS.stat(expectOut).size===0){return false;}}catch(e){return false;}}return true;}',
    'function hasEncrypt(bytes){return new TextDecoder("windows-1252").decode(bytes).indexOf("/Encrypt")!==-1;}',
    'self.onmessage=function(ev){var d=ev.data;var inF="/qt_in.pdf",outF="/qt_out.pdf",chkF="/qt_chk.pdf";var input=new Uint8Array(d.bytes);',
    'function clean(){try{qpdf.FS.unlink(inF);}catch(e){}try{qpdf.FS.unlink(outF);}catch(e){}try{qpdf.FS.unlink(chkF);}catch(e){}}',
    'loadQpdf().then(function(){qpdf.FS.writeFile(inF,input);',
    'var args=["--encrypt",d.password,ownerHex(),"256","--print="+(d.perms.print?"full":"none"),"--extract="+(d.perms.copy?"y":"n"),"--modify="+(d.perms.modify?"all":"none"),"--",inF,outF];',
    'if(!runQpdf(args,outF)){clean();return self.postMessage({id:d.id,ok:false,error:"Encryption failed"});}',
    'var outBytes=qpdf.FS.readFile(outF);',
    'if(!hasEncrypt(outBytes)){clean();return self.postMessage({id:d.id,ok:false,error:"Output is missing the security handler"});}',
    'qpdf.FS.writeFile(inF,outBytes);',
    'function tryDecrypt(pw){try{qpdf.FS.unlink(chkF);}catch(e){}return runQpdf(["--password="+pw,"--decrypt",inF,chkF],chkF);}',
    'if(!tryDecrypt(d.password)){clean();return self.postMessage({id:d.id,ok:false,error:"Entered password did not open the encrypted output"});}',
    'if(tryDecrypt("__qtwrong__")){clean();return self.postMessage({id:d.id,ok:false,error:"Output can be opened without the password"});}',
    'clean();self.postMessage({id:d.id,ok:true,bytes:outBytes});',
    '},function(){self.postMessage({id:d.id,ok:false,error:"PDF encryption engine failed to load"});});',
    '};'
  ].join('\n');

  let qpdfWorker = null;
  let qpdfWorkerReady = null;
  const qpdfPending = {};
  let qpdfMsgId = 0;

  function ensureQpdfWorker() {
    if (qpdfWorker) return Promise.resolve(qpdfWorker);
    if (qpdfWorkerReady) return qpdfWorkerReady;
    qpdfWorkerReady = new Promise((resolve, reject) => {
      try {
        const blob = new Blob([QPDF_WORKER_SOURCE], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const w = new Worker(url);
        w.onmessage = (ev) => {
          const msg = ev.data;
          const p = qpdfPending[msg.id];
          if (!p) return;
          delete qpdfPending[msg.id];
          if (msg.ok && msg.bytes) p.resolve({ ok: true, bytes: msg.bytes });
          else p.resolve({ ok: false, error: msg.error || 'Unknown encryption error' });
        };
        w.onerror = () => {
          Object.keys(qpdfPending).forEach((k) => {
            qpdfPending[k].resolve({ ok: false, error: 'PDF encryption engine failed to load' });
            delete qpdfPending[k];
          });
          qpdfWorker = null;
          qpdfWorkerReady = null;
          reject(new Error('Could not start PDF encryption engine'));
        };
        qpdfWorker = w;
        resolve(w);
      } catch (err) {
        reject(err);
      }
    });
    return qpdfWorkerReady;
  }

  function protectPdf(bytes, password, perms) {
    return ensureQpdfWorker().then(
      (worker) =>
        new Promise((resolve) => {
          try {
            const id = ++qpdfMsgId;
            qpdfPending[id] = { resolve };
            const copy = bytes.slice(0);
            worker.postMessage({ id, bytes: copy, password, perms }, [copy]);
          } catch (err) {
            resolve({ ok: false, error: 'Could not send the PDF to the encryption engine' });
          }
        }),
      (err) => ({ ok: false, error: 'PDF encryption engine unavailable: ' + ((err && err.message) || err) })
    );
  }

  /* ================================================================
     UNLOCK / PROTECT PDF
     ================================================================ */

  const sc = {
    files: [], // {name, size, buf}
    mode: 'unlock',
  };

  function scResetUpload() {
    sc.files = [];
    renderChips('#sc-files', [], {});
    $('#sc-upload-options').classList.remove('show');
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
      if (sc.mode === 'unlock') {
        const pass = $('#sc-unlock-pass').value || '';
        for (let i = 0; i < sc.files.length; i++) {
          const item = sc.files[i];
          setBusyText('Unlocking "' + item.name + '" (' + (i + 1) + '/' + sc.files.length + ')...');
          let doc;
          try {
            doc = await PDFLib.PDFDocument.load(
              item.buf,
              pass ? { password: pass } : { ignoreEncryption: true }
            );
          } catch (err) {
            toast('Wrong password for "' + item.name + '"', true);
            continue;
          }
          const bytes = await doc.save();
          results.push({
            name: item.name.replace(/\.pdf$/i, '') + '-unlocked.pdf',
            before: item.size,
            after: bytes.length,
            bytes,
          });
        }
        $('#sc-result').innerHTML = '';
        renderResults(results);
        if (results.length) toast('Unlocked ' + results.length + ' PDF(s)');
      } else {
        const p1 = $('#sc-pass1').value;
        const p2 = $('#sc-pass2').value;
        if (!p1) return toast('Enter a password', true);
        if (p1 !== p2) return toast('Passwords do not match', true);
        const perms = {
          print: $('#sc-perm-print').checked,
          copy: $('#sc-perm-copy').checked,
          modify: $('#sc-perm-modify').checked,
        };
        for (let i = 0; i < sc.files.length; i++) {
          const item = sc.files[i];
          setBusyText('Protecting "' + item.name + '" (' + (i + 1) + '/' + sc.files.length + ')...');
          try {
            const res = await protectPdf(item.buf, p1, perms);
            if (!res.ok) {
              toast('Could not protect "' + item.name + '": ' + res.error, true);
              continue;
            }
            results.push({
              name: item.name.replace(/\.pdf$/i, '') + '-protected.pdf',
              before: item.size,
              after: res.bytes.length,
              bytes: res.bytes,
            });
          } catch (err) {
            console.error(err);
            toast('Could not protect "' + item.name + '"', true);
          }
        }
        $('#sc-result').innerHTML = '';
        renderResults(results);
        if (results.length) toast('Protected ' + results.length + ' PDF(s)');
      }
    } catch (err) {
      console.error(err);
      toast('Processing failed', true);
    } finally {
      unbusy();
    }
  });
})();
