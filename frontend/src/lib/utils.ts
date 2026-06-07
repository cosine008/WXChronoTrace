import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 Tailwind class,兼顾去重和条件 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
