import type { ClassValue } from "clsx";
import axios from "axios";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseError(error: any): string {
  console.error(error);

  if (axios.isAxiosError(error) && error.response) {
    if (error.response.status >= 500) {
      return "服务器错误，请查看日志";
    }
    const data = error.response.data;
    if (typeof data === "string") {
      return data;
    }
    if (data?.reason) {
      return String(data.reason);
    }
    if (data?.message) {
      return String(data.message);
    }
    return JSON.stringify(data);
  }

  return error.message ?? JSON.stringify(error);
}

/**
 * 将错误字符串数组格式化为前端可展示的错误描述。
 * - 空数组或 null/undefined 返回空字符串
 * - 单条错误直接返回
 * - 多条错误用分号连接
 */
export function formatErrorMessages(
  errors: string[] | undefined | null,
): string {
  if (!errors || errors.length === 0) {
    return "";
  }
  return errors.join("; ");
}
