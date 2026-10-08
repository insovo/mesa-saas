import { CAMPUS_TABS } from "./permissionKeys.js";

export function campusRouteAllowed(access, method, rawUrl) {
  if (access.role !== "CAMPUS_INTERVIEWER") return true;
  const path = rawUrl.split("?")[0].replace(/^\/api\/campus/, "").replace(/\/$/, "");
  if (method === "GET" && /^\/by-candidate\/[^/]+$/.test(path)) return true;
  if (method === "POST" && /^\/by-candidate\/[^/]+\/match-runs$/.test(path)) return true;
  const has = (tab) => access.pageKeys.includes(`campus.${tab}`);
  const any = CAMPUS_TABS.some(has);
  if (method === "GET" && (path === "/sessions" || /^\/sessions\/[^/]+$/.test(path))) return any;
  if (method === "GET" && /^\/sessions\/[^/]+\/jobs$/.test(path)) return has("ledger") || has("sessions") || has("jobs");
  if (/^\/sessions\/[^/]+\/ledger(?:\/export\.xlsx)?$/.test(path)) return has("ledger") && method === "GET";
  if (/^\/sessions\/[^/]+\/stats$/.test(path)) return has("stats") && method === "GET";
  if (path === "/settings") return has("settings") && method === "GET";
  if (/^\/sessions\/[^/]+\/jobs(?:\/.*)?$/.test(path)) return has("jobs");
  if (/^\/sessions(?:\/[^/]+(?:\/(?:live|close|draft|pc-upload-link))?)?$/.test(path)) return has("sessions");
  if (method === "POST" && /^\/applicants\/[^/]+\/merge$/.test(path)) return false;
  if (/^\/(?:sessions\/[^/]+\/applicants|applicants\/[^/]+(?:\/.*)?|applications(?:\/.*)?)$/.test(path)) return has("ledger");
  return false;
}
