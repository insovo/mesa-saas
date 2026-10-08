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
    const url = String(err.config?.url || "");
    const code = err.response?.data?.error;
    const isPublic = url.includes("/public/");
    const isAccessKey =
      code === "access_key_required" ||
      code === "access_key_invalid" ||
      code === "access_key_locked" ||
      code === "access_key_not_configured";
    if (status === 401 && !isPublic && !isAccessKey) {
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
    parseText: (body) => api.post("/jobs/parse-text", body, { timeout: LONG_TIMEOUT }).then((r) => r.data),
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
    exportXlsx: (id) => api.get(`/interview-evals/${id}/export.xlsx`, { responseType: "blob" }),
  },
  performance: {
    listPeople: (params) => api.get("/performance/people", { params }).then((r) => r.data),
    createPerson: (body) => api.post("/performance/people", body).then((r) => r.data),
    createEvaluation: (body) => api.post("/performance/evaluations", body).then((r) => r.data),
    bulkCreateEvaluations: (body) =>
      api.post("/performance/evaluations/bulk", body).then((r) => r.data),
    listEvaluations: (params) => api.get("/performance/evaluations", { params }).then((r) => r.data),
    getEvaluation: (id) => api.get(`/performance/evaluations/${id}`).then((r) => r.data),
    updateEvaluation: (id, body) => api.patch(`/performance/evaluations/${id}`, body).then((r) => r.data),
    revokeEvaluation: (id) => api.post(`/performance/evaluations/${id}/revoke`).then((r) => r.data),
    ensureAccessKeys: (id) =>
      api.post(`/performance/evaluations/${id}/access-keys/ensure`).then((r) => r.data),
    bulkAccessKeys: (body) =>
      api.post("/performance/evaluations/access-keys/bulk", body).then((r) => r.data),
    previewAccessKeys: (body) =>
      api.post("/performance/evaluations/access-keys/preview", body).then((r) => r.data),
    exportAccessKeys: (body) =>
      api.post("/performance/evaluations/access-keys/export.xlsx", body, { responseType: "blob" }),
    getHrSignature: () => api.get("/performance/hr-signature").then((r) => r.data),
    hrSignaturePresign: (body) => api.post("/performance/hr-signature/presigned-url", body).then((r) => r.data),
    saveHrSignature: (body) => api.put("/performance/hr-signature", body).then((r) => r.data),
    clearHrSignature: () => api.delete("/performance/hr-signature").then((r) => r.data),
    exportEvaluation: (id, params) =>
      api.get(`/performance/evaluations/${id}/export.xlsx`, { params, responseType: "blob" }),
  },
  // 校招模块(后台)— /api/campus/*
  campus: {
    listSessions: () => api.get("/campus/sessions").then((r) => r.data.items),
    getSession: (id) => api.get(`/campus/sessions/${id}`).then((r) => r.data),
    createSession: (body) => api.post("/campus/sessions", body).then((r) => r.data.session),
    updateSession: (id, body) => api.patch(`/campus/sessions/${id}`, body).then((r) => r.data.session),
    removeSession: (id) => api.delete(`/campus/sessions/${id}`),
    setSessionStatus: (id, action) => api.post(`/campus/sessions/${id}/${action}`).then((r) => r.data.session), // live | close | draft
    listSessionJobs: (id) => api.get(`/campus/sessions/${id}/jobs`).then((r) => r.data.items),
    addSessionJob: (id, body) => api.post(`/campus/sessions/${id}/jobs`, body).then((r) => r.data.item),
    updateSessionJob: (id, sjId, body) => api.patch(`/campus/sessions/${id}/jobs/${sjId}`, body).then((r) => r.data.item),
    bulkUpdateSessionJobs: (id, ids, changes) => api.patch(`/campus/sessions/${id}/jobs/bulk`, { ids, changes }).then((r) => r.data),
    removeSessionJob: (id, sjId) => api.delete(`/campus/sessions/${id}/jobs/${sjId}`),
    reorderSessionJobs: (id, ids) => api.post(`/campus/sessions/${id}/jobs/reorder`, { ids }).then((r) => r.data),
    createSessionJob: (id, body) => api.post(`/campus/sessions/${id}/jobs/new`, body).then((r) => r.data.item), // 新建 JD + 挂到专场
    updateSessionJobJd: (id, sjId, body) => api.patch(`/campus/sessions/${id}/jobs/${sjId}/job`, body).then((r) => r.data.item), // 编辑 Job 的 JD 字段
    generateSessionJobModel: (id, sjId) => api.post(`/campus/sessions/${id}/jobs/${sjId}/evaluation-model`, {}, { timeout: LONG_TIMEOUT }).then((r) => r.data.item),
    ledger: (id, params) => api.get(`/campus/sessions/${id}/ledger`, { params }).then((r) => r.data),
    exportLedger: (id, params) => api.get(`/campus/sessions/${id}/ledger/export.xlsx`, { params, responseType: "blob" }),
    createApplicant: (id, body) => api.post(`/campus/sessions/${id}/applicants`, body).then((r) => r.data.applicant),
    getApplicant: (id) => api.get(`/campus/applicants/${id}`).then((r) => r.data),
    updateApplicant: (id, body) => api.patch(`/campus/applicants/${id}`, body).then((r) => r.data.applicant),
    removeApplicant: (id) => api.delete(`/campus/applicants/${id}`),
    addResume: (id, body) => api.post(`/campus/applicants/${id}/resumes`, body).then((r) => r.data),
    reparseResume: (id, versionId) => api.post(`/campus/applicants/${id}/resumes/${versionId}/reparse`).then((r) => r.data),
    cancelParse: (id, versionId) => api.post(`/campus/applicants/${id}/resumes/${versionId}/cancel`).then((r) => r.data),
    startMatch: (id) => api.post(`/campus/applicants/${id}/match-runs`).then((r) => r.data.run),
    cancelMatch: (id, runId) => api.post(`/campus/applicants/${id}/match-runs/${runId}/cancel`).then((r) => r.data.run),
    resumeDownloadUrl: (id, versionId) => `/api/campus/applicants/${id}/resumes/${versionId}/download`,
    addApplication: (id, jobId) => api.post(`/campus/applicants/${id}/applications`, { jobId }).then((r) => r.data.application),
    updateApplication: (appId, body) => api.patch(`/campus/applications/${appId}`, body).then((r) => r.data.application),
    removeApplication: (appId) => api.delete(`/campus/applications/${appId}`),
    bulkStatus: (ids, status, advance = false) => api.post("/campus/applications/bulk-status", { ids, status, advance }).then((r) => r.data),
    scheduleInterview: (appId, body) => api.post(`/campus/applications/${appId}/interview`, body).then((r) => r.data.interview),
    bulkInterview: (body) => api.post("/campus/applications/bulk-interview", body).then((r) => r.data),
    pcUploadLink: (id, regenerate = false) => api.post(`/campus/sessions/${id}/pc-upload-link`, { regenerate }).then((r) => r.data),
    byCandidate: (candidateId) => api.get(`/campus/by-candidate/${candidateId}`).then((r) => r.data),
    merge: (id, candidateId) => api.post(`/campus/applicants/${id}/merge`, { candidateId }).then((r) => r.data),
    stats: (id) => api.get(`/campus/sessions/${id}/stats`).then((r) => r.data),
    getSettings: () => api.get("/campus/settings").then((r) => r.data.settings),
    saveSettings: (body) => api.put("/campus/settings", body).then((r) => r.data.settings),
  },
  // 飞书 bot 自动分享设置(全局策略 + 单人偏好)
  feishuConfig: {
    getShareDefaults: () => api.get("/feishu-config/share-defaults").then((r) => r.data),
    saveShareDefaults: (body) => api.put("/feishu-config/share-defaults", body).then((r) => r.data),
  },
};
