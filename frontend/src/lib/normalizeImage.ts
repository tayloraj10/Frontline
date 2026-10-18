// iPhone photos can arrive as HEIC even when the file is named .jpg and typed
// image/jpeg (native gallery picks, Files picker). Safari/WKWebView can decode
// HEIC, but Chrome/Firefox on desktop cannot, so the stored image renders as a
// blank box there. Sniff the real bytes and re-encode to JPEG before upload,
// while we're still on the device that can decode it.
async function isHeic(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (head.length < 12) return false;
  const boxType = String.fromCharCode(...head.slice(4, 8));
  if (boxType !== "ftyp") return false;
  const brand = String.fromCharCode(...head.slice(8, 12));
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand);
}

export async function normalizeImageForUpload(file: File): Promise<File> {
  if (!(await isHeic(file))) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // Can't decode here either; upload as-is rather than blocking the user.
    return file;
  }
}
