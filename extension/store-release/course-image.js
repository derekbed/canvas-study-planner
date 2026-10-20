(function () {
  "use strict";

  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_DATA_URL_LENGTH = 700000;
  let decoder;

  async function isHeic(file) {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" &&
      ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand);
  }

  async function decodeHeic(file) {
    if (typeof globalThis.CoursewiseBuildLibheif !== "function")
      throw new Error("HEIC conversion is unavailable. Reload the Coursewise extension and try again.");
    decoder ||= globalThis.CoursewiseBuildLibheif();
    let instance, images;
    try {
      instance = new decoder.HeifDecoder();
      images = instance.decode(await file.arrayBuffer());
      if (!images?.length) throw new Error("No picture was found in this HEIC file.");
      const image = images[0];
      const width = image.get_width(), height = image.get_height();
      if (!width || !height || width * height > 40_000_000) throw new Error("This HEIC picture is too large to process.");
      const pixels = new ImageData(width, height);
      for (let index = 3; index < pixels.data.length; index += 4) pixels.data[index] = 255;
      const decoded = await new Promise((resolve, reject) => image.display(pixels, result =>
        result ? resolve(result) : reject(new Error("This HEIC picture could not be decoded."))));
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").putImageData(decoded, 0, 0);
      return canvas;
    } catch (error) {
      if (error instanceof Error && /HEIC/.test(error.message)) throw error;
      throw new Error("This HEIC picture could not be decoded. Try exporting it as JPEG.");
    } finally {
      for (const image of images || []) image.free();
      if (instance?.decoder) decoder.heif_context_free(instance.decoder);
    }
  }

  async function decodeBrowserImage(file) {
    if (typeof createImageBitmap === "function") {
      try { return await createImageBitmap(file); } catch { /* Try the image element below. */ }
    }
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("This file could not be decoded as an image. Choose a JPEG, PNG, WebP, HEIC, or HEIF picture."));
        image.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }

  function encodeJpeg(source) {
    const width = source.width || source.naturalWidth;
    const height = source.height || source.naturalHeight;
    if (!width || !height) throw new Error("This picture has no usable dimensions.");
    const canvas = document.createElement("canvas");
    for (const limit of [1200, 960, 720, 540, 400]) {
      const scale = Math.min(1, limit / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not process the picture.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.68, 0.5, 0.35]) {
        const result = canvas.toDataURL("image/jpeg", quality);
        if (result.startsWith("data:image/jpeg;base64,") && result.length <= MAX_DATA_URL_LENGTH) return result;
      }
    }
    throw new Error("This picture could not be compressed enough. Choose a smaller image.");
  }

  async function prepare(file) {
    if (!(file instanceof Blob) || !file.size) throw new Error("Choose a picture to upload.");
    if (file.size > MAX_FILE_BYTES) throw new Error("Choose a picture under 20 MB.");
    const heic = await isHeic(file);
    const source = heic ? await decodeHeic(file) : await decodeBrowserImage(file);
    try { return encodeJpeg(source); }
    finally { source.close?.(); }
  }

  globalThis.CoursewiseCourseImage = {
    accept: "image/jpeg,image/png,image/webp,image/heic,image/heif,image/heic-sequence,image/heif-sequence,.jpg,.jpeg,.png,.webp,.heic,.heif",
    prepare
  };
})();
