(function (w) {
  function filename(name) {
    name = String(name || "download").replace(/[\\/:*?"<>|]+/g, "_").trim();
    return name || "download";
  }

  function asBlob(data, mime) {
    if (data instanceof Blob) return data;
    return new Blob([data], { type: mime || "application/octet-stream" });
  }

  function saveAs(data, name, mime) {
    name = filename(name);
    var blob = asBlob(data, mime);
    if (/pdf/i.test(blob.type || "") || /\.pdf$/i.test(name)) {
      blob = new Blob([blob], { type: "application/octet-stream" });
    }

    if (typeof navigator !== "undefined" && typeof navigator.msSaveOrOpenBlob === "function") {
      navigator.msSaveOrOpenBlob(blob, name);
      return;
    }

    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    a.target = "_self";
    a.style.display = "none";
    a.setAttribute("download", name);
    document.body.appendChild(a);
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: w }));
    setTimeout(function () {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 2000);
  }

  w.saveAs = saveAs;
})(window);
