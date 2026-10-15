import axios from "axios";
import { api } from "./api.js";

const publicApi = axios.create({ baseURL: "/api/public/interview-queues", timeout: 15000 });
export const studentQueueToken = {
  get: () => localStorage.getItem("mesa.queue.student.v1") || "",
  set: (token) => localStorage.setItem("mesa.queue.student.v1", token),
  clear: () => localStorage.removeItem("mesa.queue.student.v1"),
};
export const queueApi = {
  list: () => api.get("/interview-queues/").then((r) => r.data),
  ensure: (id) => api.post(`/interview-queues/${id}`).then((r) => r.data),
  data: (id, revision) => api.get(`/interview-queues/${id}`, { params: { revision } }).then((r) => r.data),
  action: (id, body) => api.post(`/interview-queues/${id}/actions`, body).then((r) => r.data),
  job: (id, jobId) => api.get(`/interview-queues/${id}/jobs/${jobId}`).then((r) => r.data.job),
  location: (id, location) => api.patch(`/interview-queues/${id}/location`, { location }).then((r) => r.data),
  share: (id, kind, body) => api.post(`/interview-queues/${id}/links/${kind}`, body).then((r) => r.data),
  stop: (id, kind) => api.delete(`/interview-queues/${id}/links/${kind}`).then((r) => r.data),
};
const linkConfig = (token) => ({ headers: { "X-Queue-Link": token } });
const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
export const publicQueueApi = {
  link: (token) => publicApi.get("/link", linkConfig(token)).then((r) => r.data),
  job: (token, jobId) => publicApi.get(`/registration/jobs/${jobId}`, linkConfig(token)).then((r) => r.data.job),
  open: (token, accessKey) => publicApi.post("/share/open", accessKey ? { accessKey } : {}, linkConfig(token)).then((r) => r.data),
  data: (token, revision) => publicApi.get("/share/data", { ...bearer(token), params: { revision } }).then((r) => r.data),
  action: (token, body) => publicApi.post("/share/actions", body, bearer(token)).then((r) => r.data),
  shareJob: (token, jobId) => publicApi.get(`/share/jobs/${jobId}`, bearer(token)).then((r) => r.data.job),
  register: (token, body) => publicApi.post("/register", body, linkConfig(token)).then((r) => r.data),
  sendCode: (email) => publicApi.post("/recover/send-code", { email }).then((r) => r.data),
  recover: (email, code) => publicApi.post("/recover/verify", { email, code }).then((r) => r.data),
  mine: (token) => publicApi.get("/mine", bearer(token)).then((r) => r.data),
};
export const QUEUE_STAGE_LABELS = { professional: "专业面试", culture: "文化面试", salary: "定薪", pending: "待定" };
export const QUEUE_ROLE_LABELS = { professional: "专业面试官", culture: "文化面试官", hr: "HR", registration: "排队登记" };
export const queueResult = (value) => ({ passed: "通过", pending: "待定", accepted: "接受", abandoned: "放弃" }[value] || "—");
export const queueErrorMessage = (err) => err.response?.data?.message || "请求失败，请稍后重试";
