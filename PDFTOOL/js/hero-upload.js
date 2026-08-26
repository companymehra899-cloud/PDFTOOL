/* ePDFConverter - hero drop zone + context-aware tool picker.
   Shared by the homepage (index.html) and tool pages that accept an
   imported file via ?import=1 (compress-pdf, pdf-to-jpg, edit-pdf,
   jpg-to-pdf, resize-image).

   Flow: user drops/picks a file on the homepage hero drop box -> a modal
   offers tools that match the file type -> the file(s) are stored in
   IndexedDB and the user is taken to the chosen tool page with ?import=1
   -> the tool page rebuilds a FileList from IndexedDB and triggers the
   page's own file-input change handler.
 */
(function () {
  'use strict';

  var DB_NAME = 'epdf-transfer';
  var DB_VER = 1;
  var STORE = 'pending';

  /* ---------------- IndexedDB helpers ---------------- */

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idb(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var store = tx.objectStore(STORE);
        var result;
        try {
          result = fn(store);
        } catch (e) {
          db.close();
          reject(e);
          return;
        }
        tx.oncomplete = function () {
          db.close();
          resolve(result && result.result !== undefined ? result.result : result);
        };
        tx.onerror = function () { db.close(); reject(tx.error); };
        tx.onabort = function () { db.close(); reject(tx.error); };
      });
    });
  }

  window.EPDFTransfer = {
    storeFiles: function (files) {
      return idb('readwrite', function (store) {
        files.forEach(function (f) {
          store.put({
            id: f.name + ':' + f.size + ':' + (f.lastModified || 0),
            name: f.name,
            type: f.type,
            size: f.size,
            blob: f,
          });
        });
      });
    },
    loadFiles: function () {
      return idb('readonly', function (store) { return store.getAll(); });
    },
    clear: function () {
      return idb('readwrite', function (store) { store.clear(); });
    },
  };

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function fileKind(file) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
    if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(file.name)) return 'image';
    return null;
  }

  /* ---------------- tool options (context-aware) ---------------- */

  var SVG = {
    compress:
      '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M12 18v-6"/><path d="m9.5 15 2.5 2.5 2.5-2.5"/></svg>',
    p2j:
      '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="15" height="16" rx="2"/><circle cx="11" cy="8.5" r="1.4"/><path d="m7.5 16 3.5-3.5 2.5 2.5 2-2 3 3"/><path d="M4 4v14"/></svg>',
    edit:
      '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    j2p:
      '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="15" height="16" rx="2"/><circle cx="8" cy="8.5" r="1.4"/><path d="m4.5 16 3.5-3.5 2.5 2.5 2-2 3 3"/><path d="M20 4v14"/></svg>',
    resize:
      '<svg viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>',
    image:
      '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5.5 17 4.5-4.5 3 3 2.5-2.5 3.5 4"/></svg>',
  };

  var TOOLS = {
    pdf: [
      {
        title: 'Compress PDF', desc: 'Reduce PDF file size', page: 'compress-pdf.html',
        cls: 'c-red', icon: SVG.compress,
      },
      {
        title: 'PDF to JPG', desc: 'Convert PDF pages to images', page: 'pdf-to-jpg.html',
        cls: 'c-blue', icon: SVG.p2j,
      },
      {
        title: 'Edit PDF', desc: 'Edit text and images in PDF', page: 'edit-pdf.html',
        cls: 'c-green', icon: SVG.edit,
      },
    ],
    image: [
      {
        title: 'JPG to PDF', desc: 'Convert images into a PDF', page: 'jpg-to-pdf.html',
        cls: 'c-purple', icon: SVG.j2p,
      },
      {
        title: 'Resize Image', desc: 'Change image dimensions', page: 'resize-image.html',
        cls: 'c-cyan', icon: SVG.resize,
      },
    ],
  };

  /* ---------------- homepage: hero drop zone + modal ---------------- */

  var pendingFiles = null;

  function go(page) {
    if (!window.EPDFTransfer) return;
    window.EPDFTransfer.storeFiles(pendingFiles || []).then(function () {
      window.location.href = page + '?import=1';
    });
  }

  function closeModal() {
    var modal = document.getElementById('hero-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('hero-modal-open');
  }

  function openModal(files, kind) {
    var modal = document.getElementById('hero-modal');
    if (!modal) return;
    pendingFiles = files;

    var list = TOOLS[kind] || TOOLS.pdf;
    var f = files[0];

    var fileEl = document.getElementById('hero-modal-file');
    if (fileEl) {
      fileEl.innerHTML =
        '<span class="hm-file-icon hm-icon-' + kind + '">' +
        (kind === 'pdf' ? 'PDF' : SVG.image) +
        '</span>' +
        '<span class="hm-file-txt"><span class="hm-file-name">' + esc(f.name) + '</span>' +
        '<span class="hm-file-meta">' + fmtSize(f.size) + ' &middot; ' + kind.toUpperCase() + '</span></span>';
    }

    var titleEl = document.getElementById('hero-modal-title');
    if (titleEl) {
      titleEl.textContent = kind === 'pdf'
        ? 'What would you like to do with this PDF?'
        : 'What would you like to do with this image?';
    }
    var subEl = document.getElementById('hero-modal-sub');
    if (subEl) {
      subEl.textContent = 'Pick a tool and your file will be loaded straight into it.';
    }

    var listEl = document.getElementById('hero-modal-options');
    listEl.innerHTML = '';
    list.forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hm-option hm-primary';
      b.innerHTML =
        '<span class="hm-opt-icon ' + opt.cls + '">' + opt.icon + '</span>' +
        '<span class="hm-opt-txt"><b>' + esc(opt.title) + '</b><small>' + esc(opt.desc) + '</small></span>' +
        '<span class="hm-opt-side"><span class="hm-rec">Recommended</span><span class="hm-opt-arrow">&rarr;</span></span>';
      b.addEventListener('click', function () { go(opt.page); });
      listEl.appendChild(b);
    });

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hero-modal-open');
  }

  function handleFiles(files) {
    var valid = files.filter(function (f) { return fileKind(f); });
    if (!valid.length) return;
    openModal(valid, fileKind(valid[0]));
  }

  function initHome() {
    var dz = document.getElementById('hero-dropzone');
    var input = document.getElementById('hero-file-input');
    if (!dz || !input) return;

    dz.addEventListener('click', function (e) {
      input.click();
    });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener('change', function () {
      if (input.files && input.files.length) {
        handleFiles(Array.prototype.slice.call(input.files));
      }
      input.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove('dragover');
      });
    });
    dz.addEventListener('drop', function (e) {
      var files = Array.prototype.slice.call(e.dataTransfer.files);
      if (files.length) handleFiles(files);
    });

    var modal = document.getElementById('hero-modal');
    if (modal) {
      modal.querySelectorAll('[data-close]').forEach(function (el) {
        el.addEventListener('click', closeModal);
      });
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
      });
    }
  }

  /* ---------------- tool pages: import pending file ---------------- */

  var IMPORT_INPUTS = ['#cp-input', '#p2j-input', '#ed-input', '#j2p-input', '#rz-input'];

  function initImport() {
    if (!/[?&]import=1/.test(window.location.search)) return;
    if (!window.EPDFTransfer || !window.DataTransfer) return;

    window.EPDFTransfer.loadFiles().then(function (items) {
      if (!items || !items.length) return;
      var input = null;
      for (var i = 0; i < IMPORT_INPUTS.length; i++) {
        var el = document.querySelector(IMPORT_INPUTS[i]);
        if (el) { input = el; break; }
      }
      if (!input) return;

      var dt = new DataTransfer();
      items.forEach(function (it) {
        try {
          var file = new File([it.blob], it.name, { type: it.type || '' });
          dt.items.add(file);
        } catch (e) {
          /* skip a file that cannot be rebuilt */
        }
      });
      if (!dt.files.length) {
        window.EPDFTransfer.clear();
        return;
      }
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      window.EPDFTransfer.clear();
    }).catch(function () {});
  }

  initHome();
  initImport();
})();
