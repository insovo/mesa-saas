import axios from "axios";
import { api } from "./api.js";
import { visitorId } from "./visitorId.js";

const publicApi = axios.create({ baseURL: "/api/public/campus-job-shares", timeout: 15000 });
publicApi.interceptors.request.use((config) => {
  config.headers["X-Mesa-Visitor"] = visitorId();
  return config;
});
const linkConfig = (token) => ({ headers: { "X-Campus-Job-Share": token } });
export const campusJobShareApi = {
  create: (body) => api.post("/campus/jobs/share-links", body).then((r) => r.data.link),
  list: () => api.get("/campus/jobs/share-links").then((r) => r.data.items),
  stop: (id) => api.delete(`/campus/jobs/share-links/${id}`),
};
export const publicCampusJobShareApi = {
  data: (token) => publicApi.get("/", linkConfig(token)).then((r) => r.data),
  kind: (token, ids, kind) => publicApi.patch("/kind", { ids, kind }, linkConfig(token)).then((r) => r.data),
  create: (token, body) => publicApi.post("/jobs", body, linkConfig(token)).then((r) => r.data.job),
};
export const jobShareError = (err) => err.response?.data?.message || "请求失败，请稍后重试";
