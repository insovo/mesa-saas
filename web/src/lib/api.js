import axios from "axios";
import { getToken, clearAuth } from "./auth.js";

// Axios 实例 — 所有请求都从这里出口。
//   - 请求拦截器: 自动附 Authorization Bearer
//   - 响应拦截器: 401 自动清登录 → 跳 /login
//
// 通用 timeout 15s。LLM 解析这类长任务在调用端用 api.post(url, body, { timeout: 120000 }) 覆盖。
export const api = axios.create({
  baseURL: "/api",
  timeout: 15000,
});

// 长任务专用 timeout — Kimi 解析 .doc/.pdf 通常 10-30s,大文件 60s+
export const LONG_TIMEOUT = 120000;

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    if (status === 401) {
      clearAuth();
      if (onUnauthorized) onUnauthorized();
    }
    return Promise.reject(err);
  },
);

// 资源便捷方法 — 把常用 CRUD 收口,页面直接调用。
export const resources = {
  candidates: {
    list: (params) => api.get("/candidates", { params }).then((r) => r.data),
    detail: (id) => api.get(`/candidates/${id}`).then((r) => r.data.candidate),
    create: (data) => api.post("/candidates", data).then((r) => r.data.candidate),
    update: (id, data) => api.patch(`/candidates/${id}`, data).then((r) => r.data.candidate),
    remove: (id) => api.delete(`/candidates/${id}`),
  },
  jobs: {
    list: (params) => api.get("/jobs", { params }).then((r) => r.data),
    detail: (id) => api.get(`/jobs/${id}`).then((r) => r.data.job),
    create: (data) => api.post("/jobs", data).then((r) => r.data.job),
    update: (id, data) => api.patch(`/jobs/${id}`, data).then((r) => r.data.job),
    remove: (id) => api.delete(`/jobs/${id}`),
  },
  employees: {
    list: (params) => api.get("/employees", { params }).then((r) => r.data),
    detail: (id) => api.get(`/employees/${id}`).then((r) => r.data.employee),
    create: (data) => api.post("/employees", data).then((r) => r.data.employee),
    update: (id, data) => api.patch(`/employees/${id}`, data).then((r) => r.data.employee),
    remove: (id) => api.delete(`/employees/${id}`),
  },
  departments: {
    list: () => api.get("/departments").then((r) => r.data),
    detail: (id) => api.get(`/departments/${id}`).then((r) => r.data.department),
    create: (data) => api.post("/departments", data).then((r) => r.data.department),
    update: (id, data) => api.patch(`/departments/${id}`, data).then((r) => r.data.department),
    remove: (id) => api.delete(`/departments/${id}`),
    reorder: (moves) => api.post("/departments/reorder", { moves }).then((r) => r.data),
    exportXlsx: (rootId) =>
      api.get(`/departments/${rootId}/export.xlsx`, { responseType: "blob" }),
  },
  interviews: {
    list: (params) => api.get("/interviews", { params }).then((r) => r.data),
    create: (data) => api.post("/interviews", data).then((r) => r.data.interview),
    update: (id, data) => api.patch(`/interviews/${id}`, data).then((r) => r.data.interview),
    remove: (id) => api.delete(`/interviews/${id}`),
  },
  dashboard: {
    overview: () => api.get("/dashboard/overview").then((r) => r.data),
  },
  reports: {
    overview: (params) => api.get("/reports/overview", { params }).then((r) => r.data),
    byJob: (params) => api.get("/reports/by-job", { params }).then((r) => r.data),
    byDepartment: (params) => api.get("/reports/by-department", { params }).then((r) => r.data),
    drilldown: (params) => api.get("/reports/drilldown", { params }).then((r) => r.data),
    byChannel: (params) => api.get("/reports/by-channel", { params }).then((r) => r.data),
    byHr: (params) => api.get("/reports/by-hr", { params }).then((r) => r.data),
    offerCycle: (params) => api.get("/reports/offer-cycle", { params }).then((r) => r.data),
    targets: (params) => api.get("/reports/targets", { params }).then((r) => r.data),
    byInterviewer: (params) => api.get("/reports/by-interviewer", { params }).then((r) => r.data),
    insights: (params) => api.get("/reports/insights", { params }).then((r) => r.data),
  },
  notes: {
    list: (candidateId) => api.get(`/candidates/${candidateId}/notes`).then((r) => r.data.notes),
    create: (candidateId, content) => api.post(`/candidates/${candidateId}/notes`, { content }).then((r) => r.data.note),
    remove: (candidateId, noteId) => api.delete(`/candidates/${candidateId}/notes/${noteId}`),
  },
  reviews: {
    list: (candidateId) => api.get(`/candidates/${candidateId}/reviews`).then((r) => r.data.reviews),
    create: (candidateId, body) => api.post(`/candidates/${candidateId}/reviews`, body).then((r) => r.data.review),
    requestDelete: (candidateId, reviewId) =>
      api.post(`/candidates/${candidateId}/reviews/${reviewId}/request-delete`).then((r) => r.data.review),
    approveDelete: (candidateId, reviewId) =>
      api.post(`/candidates/${candidateId}/reviews/${reviewId}/approve-delete`).then((r) => r.data.review),
    rejectDelete: (candidateId, reviewId) =>
      api.post(`/candidates/${candidateId}/reviews/${reviewId}/reject-delete`).then((r) => r.data.review),
    adminDelete: (candidateId, reviewId) =>
      api.delete(`/candidates/${candidateId}/reviews/${reviewId}`).then((r) => r.data.review),
    hide: (candidateId, reviewId) =>
      api.post(`/candidates/${candidateId}/reviews/${reviewId}/hide`).then((r) => r.data.review),
    unhide: (candidateId, reviewId) =>
      api.post(`/candidates/${candidateId}/reviews/${reviewId}/unhide`).then((r) => r.data.review),
    vote: (candidateId, reviewId, value) =>
      api.post(`/candidates/${candidateId}/reviews/${reviewId}/vote`, { value }).then((r) => r.data),
    myVotes: (candidateId) =>
      api.get(`/candidates/${candidateId}/reviews-votes`).then((r) => r.data.votes),
    voters: (candidateId, reviewId) =>
      api.get(`/candidates/${candidateId}/reviews/${reviewId}/voters`).then((r) => r.data),
  },
  share: {
    get: (candidateId) => api.get(`/candidates/${candidateId}/share`).then((r) => r.data.link),
    create: (candidateId, body) => api.post(`/candidates/${candidateId}/share`, body).then((r) => r.data.link),
    update: (candidateId, body) => api.patch(`/candidates/${candidateId}/share`, body).then((r) => r.data.link),
    remove: (candidateId) => api.delete(`/candidates/${candidateId}/share`),
  },
  interviewEvals: {
    listByCandidate: (candidateId) =>
      api.get(`/candidates/${candidateId}/interview-evals`).then((r) => r.data.items),
    create: (candidateId, body) =>
      api.post(`/candidates/${candidateId}/interview-evals`, body).then((r) => r.data.item),
    detail: (id) => api.get(`/interview-evals/${id}`).then((r) => r.data.item),
    update: (id, body) => api.patch(`/interview-evals/${id}`, body).then((r) => r.data.item),
    remove: (id) => api.delete(`/interview-evals/${id}`),
    // 触发浏览器下载,后端响应带 Content-Disposition
    exportUrl: (id) => `/api/interview-evals/${id}/export.xlsx`,
  },
};
