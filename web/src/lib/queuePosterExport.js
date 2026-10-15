export const QUEUE_POSTER_SIZES = { portrait: { width: 1440, height: 1920 }, landscape: { width: 2160, height: 1440 } };
export const QUEUE_POSTER_LABELS = { registration: "排队登记", professional: "专业面试官", culture: "文化面试官", hr: "HR 定薪", "job-review": "HR 岗位协作", "campus-home": "校招专场首页", "campus-jobs": "校招直接投递", "campus-match": "校招智能匹配", "campus-pc": "校招电脑上传" };

export function queuePosterFilename(sessionName, format, kind = "registration") {
  const safeName = Array.from(sessionName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim()).slice(0, 48).join("");
  const prefix = kind === "registration" ? "面试排队登记" : `${QUEUE_POSTER_LABELS[kind]}操作指南`;
  return `${prefix}_${safeName}_${format === "landscape" ? "iPad横屏" : "群聊竖版"}.png`;
}

export async function readQueueGroupQr(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("请上传 5MB 以内的 PNG、JPG 或 WebP 正方形二维码图片");
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("二维码图片读取失败，请重试")); reader.readAsDataURL(file);
  });
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("无法识别二维码图片，请换一张 PNG、JPG 或 WebP 图片")); image.src = source; });
  if (!image.naturalWidth || image.naturalWidth !== image.naturalHeight || image.naturalWidth > 4096) throw new Error("请上传边长不超过 4096 像素的正方形二维码图片");
  return source;
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
