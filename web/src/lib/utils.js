// shadcn 标配工具 — 合并 className(clsx 处理条件 + tailwind-merge 处理冲突)
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
