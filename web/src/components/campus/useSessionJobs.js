import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resources } from "../../lib/api.js";
import { toast } from "../Primitives.jsx";
import { errMsg } from "./ui.jsx";

async function listAvailableJobs() {
  const items = [];
  let page;
  do {
    page = await resources.jobs.list({ skip: items.length, take: 200 });
    items.push(...page.items);
  } while (page.items.length && items.length < page.total);
  return items;
}

export function useSessionJobs(sessionId, onChanged, canManage) {
  const [data, setData] = useState({ sessionId: null, items: [], allJobs: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mutating, setMutating] = useState(false);
  const [busy, setBusy] = useState({});
  const [bulkProgress, setBulkProgress] = useState(null);
  const activeSession = useRef(sessionId);
  activeSession.current = sessionId;
  const requestId = useRef(0);
  const mutation = useRef(false);
  const generating = useRef(new Set());
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current++; }; }, []);

  const load = useCallback(async () => {
    if (!sessionId || !mounted.current || activeSession.current !== sessionId) return;
    const request = ++requestId.current;
    setLoading(true); setError("");
    try {
      const [items, allJobs] = await Promise.all([
        resources.campus.listSessionJobs(sessionId),
        canManage ? listAvailableJobs() : Promise.resolve([]),
      ]);
      if (request !== requestId.current || activeSession.current !== sessionId) return;
      setData({ sessionId, items, allJobs });
    } catch (e) {
      if (request !== requestId.current || activeSession.current !== sessionId) return;
      setData({ sessionId, items: [], allJobs: [] });
      setError(errMsg(e, "岗位加载失败"));
    } finally {
      if (request === requestId.current && activeSession.current === sessionId) setLoading(false);
    }
  }, [sessionId, canManage]);
  useEffect(() => { load(); return () => { requestId.current++; }; }, [load]);

  // 专场切换的这一帧也隐藏旧数据,避免旧岗位按钮操作到新专场。
  const items = data.sessionId === sessionId ? data.items : [];
  const available = useMemo(() => data.sessionId === sessionId ? data.allJobs.filter((job) => !data.items.some((sj) => sj.jobId === job.id)) : [], [data, sessionId]);
  const run = async (fn, refreshSessions = false) => {
    if (mutation.current || !sessionId) return false;
    mutation.current = true; setMutating(true);
    try {
      await fn(); await load();
      if (refreshSessions) onChanged?.();
      return true;
    } catch (e) {
      toast(errMsg(e), "error"); await load(); return false;
    } finally {
      mutation.current = false;
      if (mounted.current) setMutating(false);
    }
  };
  const add = (jobId, kind) => run(() => resources.campus.addSessionJob(sessionId, { jobId, kind }), true);
  const bulkPatch = (ids, changes) => run(() => resources.campus.bulkUpdateSessionJobs(sessionId, ids, changes));
  const patch = (sj, body) => {
    if (mutation.current) return;
    setData((prev) => ({ ...prev, items: prev.items.map((item) => item.id === sj.id ? { ...item, ...body } : item) }));
    return run(() => resources.campus.updateSessionJob(sessionId, sj.id, body));
  };
  const remove = (sj) => run(() => resources.campus.removeSessionJob(sessionId, sj.id), true);
  const move = (idx, dir) => {
    const next = [...items]; const target = idx + dir;
    if (mutation.current || target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setData((prev) => ({ ...prev, items: next }));
    return run(() => resources.campus.reorderSessionJobs(sessionId, next.map((sj) => sj.id)));
  };
  const generateModel = async (sj) => {
    if (mutation.current || generating.current.has(sj.id)) return;
    generating.current.add(sj.id);
    setBusy((prev) => ({ ...prev, [sj.id]: true }));
    try {
      await resources.campus.generateSessionJobModel(sessionId, sj.id);
      toast(`「${sj.job.title}」评价模型已生成`, "success");
      await load();
    } catch (e) { toast(errMsg(e, "生成失败"), "error"); }
    finally {
      generating.current.delete(sj.id);
      if (mounted.current) setBusy((prev) => ({ ...prev, [sj.id]: false }));
    }
  };

  const bulkGenerateModels = async (selected) => {
    if (mutation.current || generating.current.size || !selected.length) return null;
    mutation.current = true; setMutating(true);
    const failed = [];
    setBulkProgress({ done: 0, total: selected.length });
    try {
      for (const [index, sj] of selected.entries()) {
        generating.current.add(sj.id);
        setBusy((prev) => ({ ...prev, [sj.id]: true }));
        try { await resources.campus.generateSessionJobModel(sessionId, sj.id); }
        catch (e) { failed.push({ id: sj.id, title: sj.job.title, error: errMsg(e, "生成失败") }); }
        finally {
          generating.current.delete(sj.id);
          if (mounted.current) {
            setBusy((prev) => ({ ...prev, [sj.id]: false }));
            setBulkProgress({ done: index + 1, total: selected.length });
          }
        }
      }
      await load();
      if (failed.length) toast(`评价模型生成:成功 ${selected.length - failed.length} 个,失败 ${failed.length} 个。${failed.map((x) => `${x.title}: ${x.error}`).join("; ")}`, "error");
      else toast(`已为 ${selected.length} 个岗位生成评价模型`, "success");
      return failed.map((x) => x.id);
    } finally {
      mutation.current = false;
      if (mounted.current) { setMutating(false); setBulkProgress(null); }
    }
  };

  return { items, available, loading: !!sessionId && (loading || data.sessionId !== sessionId), error: data.sessionId === sessionId ? error : "", busy, mutating, bulkProgress, load, add, patch, bulkPatch, remove, move, generateModel, bulkGenerateModels };
}
