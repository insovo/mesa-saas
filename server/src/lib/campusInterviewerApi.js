export function campusInterviewerApiAllowed(method, rawUrl) {
  const path = rawUrl.split("?")[0].replace(/\/$/, "") || "/";
  if (path.startsWith("/api/auth/")) return true;
  if (path.startsWith("/api/campus/")) return true;
  if (method === "GET" && /^\/api\/candidates(?:\/[^/]+(?:\/(?:profile|evaluations|notes|reviews|reviews-votes|reviews\/[^/]+\/voters))?)?$/.test(path)) return true;
  if (["GET", "POST"].includes(method) && /^\/api\/candidates\/[^/]+\/interview-evals$/.test(path)) return true;
  if (method === "GET" && /^\/api\/interview-evals\/[^/]+(?:\/export\.xlsx)?$/.test(path)) return true;
  if (method === "PATCH" && /^\/api\/interview-evals\/[^/]+$/.test(path)) return true;
  if (method === "POST" && /^\/api\/candidates\/[^/]+\/(?:notes|reviews|reviews\/[^/]+\/(?:vote|request-delete))$/.test(path)) return true;
  if (method === "DELETE" && /^\/api\/candidates\/[^/]+\/notes\/[^/]+$/.test(path)) return true;
  if (method === "DELETE" && /^\/api\/candidates\/[^/]+$/.test(path)) return true;
  if (method === "GET" && /^\/api\/jobs(?:\/[^/]+|\/taxonomy\/[^/]+|\/evaluation\/templates)?$/.test(path)) return true;
  if (method === "POST" && path === "/api/jobs/parse-text") return true;
  if (method === "GET" && path === "/api/resumes/llm-status") return true;
  if (method === "POST" && ["/api/storage/presigned-url", "/api/storage/confirm", "/api/storage/signed-get-url"].includes(path)) return true;
  return false;
}
