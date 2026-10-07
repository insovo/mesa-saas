// 校招学生端 API 客户端 — 独立 axios 实例,不走后台的 401 → /login 拦截器
//   token 存 localStorage mesa.campus.token.v1(学生 JWT,aud=campus-public)
import axios from "axios";

const TOKEN_KEY = "mesa.campus.token.v1";
export const getCampusToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setCampusToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

export const campusApi = axios.create({ baseURL: "/api/campus/public", timeout: 20000 });
campusApi.interceptors.request.use((cfg) => {
  const t = getCampusToken();
  if (t) { cfg.headers = cfg.headers || {}; cfg.headers.Authorization = `Bearer ${t}`; }
  return cfg;
});
campusApi.interceptors.response.use((r) => r, (err) => {
  if (err.response?.status === 401) setCampusToken(null);
  return Promise.reject(err);
});

export const campus = {
  session: (slug) => campusApi.get("/session/current", { params: { slug } }).then((r) => r.data),
  jobs: (slug) => campusApi.get("/session/current/jobs", { params: { slug } }).then((r) => r.data),
  job: (slug, id) => campusApi.get(`/jobs/${id}`, { params: { slug } }).then((r) => r.data.job),
  start: (body) => campusApi.post("/auth/start", body).then((r) => r.data),
  recoverSend: (body) => campusApi.post("/auth/recover/send-code", body).then((r) => r.data),
  recoverVerify: (body) => campusApi.post("/auth/recover/verify", body).then((r) => r.data),
  me: () => campusApi.get("/me").then((r) => r.data),
  updateMe: (body) => campusApi.patch("/me", body).then((r) => r.data.me),
  confirmContact: (body) => campusApi.post("/me/contact-confirm", body).then((r) => r.data.me),
  presign: (body) => campusApi.post("/resumes/presigned-url", body).then((r) => r.data),
  submitResume: (body) => campusApi.post("/resumes/submit", body).then((r) => r.data),
  parseStatus: (versionId) => campusApi.get(`/resumes/${versionId}/parse-status`).then((r) => r.data),
  cancelParse: (versionId) => campusApi.post(`/resumes/${versionId}/cancel-parse`).then((r) => r.data),
  reparse: (versionId) => campusApi.post(`/resumes/${versionId}/reparse`).then((r) => r.data),
  startMatch: () => campusApi.post("/match-runs").then((r) => r.data.run),
  latestMatch: () => campusApi.get("/match-runs/latest").then((r) => r.data.run),
  matchRun: (id) => campusApi.get(`/match-runs/${id}`).then((r) => r.data.run),
  cancelMatch: (id) => campusApi.post(`/match-runs/${id}/cancel`).then((r) => r.data.run),
  apply: (body) => campusApi.post("/applications", body).then((r) => r.data),
  applications: () => campusApi.get("/applications").then((r) => r.data),
  withdraw: (id) => campusApi.delete(`/applications/${id}`),
};

export const campusErr = (e, fallback = "操作失败") => e?.response?.data?.message || e?.message || fallback;

// 浏览器端 sha256(用于同文件去重;不支持 crypto.subtle 时返回 null)
export async function sha256File(file) {
  try {
    const buf = await file.arrayBuffer();
    const h = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}
