import axios from "axios";
import { camelCase, snakeCase, isArray, isPlainObject } from "lodash-es";

export const apiClient = axios.create({
  baseURL: "/api/v1",
  timeout: 10000,
  withCredentials: true,
});

type AnyRecord = Record<string, any>;

function convertKeysDeep(obj: any, convert: (key: string) => string): any {
  if (isArray(obj)) {
    return obj.map(item => convertKeysDeep(item, convert));
  }
  if (isPlainObject(obj)) {
    const result: AnyRecord = {};
    for (const [key, value] of Object.entries(obj as AnyRecord)) {
      result[convert(key)] = convertKeysDeep(value, convert);
    }
    return result;
  }
  return obj;
}

export function formatRequest<T>(data: T): any {
  return convertKeysDeep(data, snakeCase);
}

export function formatResponse<T>(data: any): T {
  return convertKeysDeep(data, camelCase) as T;
}
