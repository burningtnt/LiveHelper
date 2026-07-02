import { apiClient, formatRequest, formatResponse } from "./util";
import type { Clip, Dashboard, InputValue, ManagerStatus, Program } from "./schema";

// ── Dashboard query keys ────────────────────────────────────
export const dashboardsQueryKey = ["dashboards"] as const;
export const dashboardQueryKey = (id: number) => ["dashboards", id] as const;

// ── Dashboard CRUD ──────────────────────────────────────────

export async function getDashboards(): Promise<Dashboard[]> {
  const { data } = await apiClient.get("/dashboard");
  return formatResponse<Dashboard[]>(data);
}

export async function getDashboard(id: number): Promise<Dashboard> {
  const { data } = await apiClient.get(`/dashboard/${id}`);
  return formatResponse<Dashboard>(data);
}

export async function createDashboard(dashboard: Dashboard): Promise<void> {
  await apiClient.post("/dashboard", formatRequest(dashboard));
}

export async function updateDashboard(
  id: number,
  dashboard: Partial<Dashboard>,
): Promise<void> {
  await apiClient.patch(`/dashboard/${id}`, formatRequest(dashboard));
}

export async function deleteDashboardFromApi(id: number): Promise<void> {
  await apiClient.delete(`/dashboard/${id}`);
}

// ── Query keys ──────────────────────────────────────────────
export const programsQueryKey = ["programs"] as const;
export const programQueryKey = (id: number) => ["programs", id] as const;
export const programCodeQueryKey = (id: number) =>
  ["programs", id, "code"] as const;

export const clipsQueryKey = ["clips"] as const;
export const clipQueryKey = (id: number) => ["clips", id] as const;

// ── Program CRUD ────────────────────────────────────────────

export async function getPrograms(): Promise<Program[]> {
  const { data } = await apiClient.get("/program");
  return formatResponse<Program[]>(data);
}

export async function getProgram(id: number): Promise<Program> {
  const { data } = await apiClient.get(`/program/${id}`);
  return formatResponse<Program>(data);
}

export async function createProgram(program: Program): Promise<void> {
  await apiClient.post("/program", formatRequest(program));
}

export async function updateProgram(
  id: number,
  program: Partial<Program>,
): Promise<void> {
  await apiClient.patch(`/program/${id}`, formatRequest(program));
}

export async function deleteProgramFromApi(id: number): Promise<void> {
  await apiClient.delete(`/program/${id}`);
}

// ── Program code ────────────────────────────────────────────

export async function getProgramCode(id: number): Promise<string> {
  const { data } = await apiClient.get(`/program/${id}/code`, {
    responseType: "text",
  });
  return data;
}

export async function setProgramCode(id: number, code: string): Promise<void> {
  await apiClient.patch(`/program/${id}/code`, code, {
    headers: { "Content-Type": "text/plain" },
  });
}

export async function setProgramWasm(id: number, wasm: Uint8Array): Promise<void> {
  await apiClient.patch(`/program/${id}/wasm`, wasm, {
    headers: { "Content-Type": "application/wasm" },
  });
}

// ── Clip CRUD ───────────────────────────────────────────────

export async function getClips(): Promise<Clip[]> {
  const { data } = await apiClient.get("/clip");
  return formatResponse<Clip[]>(data);
}

export async function getClip(id: number): Promise<Clip> {
  const { data } = await apiClient.get(`/clip/${id}`);
  return formatResponse<Clip>(data);
}

export async function createClip(clip: Clip): Promise<void> {
  await apiClient.post("/clip", formatRequest(clip));
}

export async function updateClip(id: number, clip: Partial<Clip>): Promise<void> {
  await apiClient.patch(`/clip/${id}`, formatRequest(clip));
}

export async function deleteClipFromApi(id: number): Promise<void> {
  await apiClient.delete(`/clip/${id}`);
}

// ── Manager query keys ──────────────────────────────────────
export const managersQueryKey = ["managers"] as const;
export const managerQueryKey = (id: number) => ["managers", id] as const;
export const managerActivationQueryKey = (id: number) =>
  ["managers", id, "activation"] as const;

// ── Manager CRUD ────────────────────────────────────────────

export async function getManagers(): Promise<import("./schema").Manager[]> {
  const { data } = await apiClient.get("/manager");
  return formatResponse<import("./schema").Manager[]>(data);
}

export async function getManager(id: number): Promise<import("./schema").Manager> {
  const { data } = await apiClient.get(`/manager/${id}`);
  return formatResponse<import("./schema").Manager>(data);
}

export async function createManager(
  manager: import("./schema").Manager,
): Promise<void> {
  await apiClient.post("/manager", formatRequest(manager));
}

export async function updateManager(
  id: number,
  manager: Partial<import("./schema").Manager>,
): Promise<void> {
  await apiClient.patch(`/manager/${id}`, formatRequest(manager));
}

export async function deleteManagerFromApi(id: number): Promise<void> {
  await apiClient.delete(`/manager/${id}`);
}

// ── Manager activation ──────────────────────────────────────

export async function getManagerActivation(
  id: number,
): Promise<ManagerStatus> {
  const { data } = await apiClient.get(`/manager/${id}/activation`);
  return formatResponse<ManagerStatus>(data);
}

export async function setManagerActivation(
  id: number,
  status: ManagerStatus,
): Promise<void> {
  await apiClient.patch(`/manager/${id}/activation`, formatRequest(status));
}

// ── Queue (至游戏内设置) ──────────────────────────────────────

/**
 * 提交一个「至游戏内设置」请求，请求获得 pose 类型的参数。
 * 返回请求的 KEY，用于后续轮询。
 */
export async function submitPoseQueue(): Promise<string> {
  const { data } = await apiClient.post("/queue/pose", undefined, {
    responseType: "text",
  });
  return data;
}

/**
 * 提交一个「至游戏内设置」请求，请求获得 entity 类型的参数。
 * 返回请求的 KEY，用于后续轮询。
 */
export async function submitEntityQueue(): Promise<string> {
  const { data } = await apiClient.post("/queue/entity", undefined, {
    responseType: "text",
  });
  return data;
}

/**
 * 获取所对 KEY 的请求结果。
 * - 200: 已有结果，返回 InputValue
 * - 202: 请求还未兑现，请继续轮询
 * - 404: 请求已超时/不存在/已被获取（用户取消）
 */
export async function getQueueResult(
  key: string,
): Promise<{ status: number; data?: InputValue }> {
  const response = await apiClient.get(`/queue/${key}`, {
    validateStatus: (status) =>
      status === 200 || status === 202 || status === 404,
  });
  if (response.status === 200) {
    return { status: 200, data: formatResponse<InputValue>(response.data) };
  }
  return { status: response.status };
}
