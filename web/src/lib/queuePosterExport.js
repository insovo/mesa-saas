export const QUEUE_POSTER_SIZES = { portrait: { width: 1440, height: 1920 }, landscape: { width: 2160, height: 1440 } };

export function queuePosterFilename(sessionName, format) {
  const safeName = Array.from(sessionName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim()).slice(0, 48).join("");
  return `面试排队登记_${safeName}_${format === "landscape" ? "iPad横屏" : "群聊竖版"}.png`;
}

export async function queuePosterPng(svg, size) {
  await document.fonts?.ready;
  const copy = svg.cloneNode(true);
  copy.removeAttribute("class"); copy.removeAttribute("style");
  copy.setAttribute("width", String(size.width)); copy.setAttribute("height", String(size.height));
  const source = new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml;charset=utf-8" });
  const sourceUrl = URL.createObjectURL(source);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("海报图片生成失败，请重试")); image.src = sourceUrl; });
    const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法生成海报图片，请更换浏览器后重试");
    context.fillStyle = "#FFFFFF"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("海报图片生成失败，请重试")), "image/png"));
  } finally { URL.revokeObjectURL(sourceUrl); }
}
