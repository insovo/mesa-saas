import { useCallback, useEffect, useRef, useState } from "react";
import { resources } from "../../lib/api.js";
import { toast } from "../Primitives.jsx";
import { errMsg } from "./ui.jsx";

export function useCampusJobs(onChanged) {
  const [data, setData] = useState({ items: [], available: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mutating, setMutating] = useState(false);
  const [busy, setBusy] = useState({});
  const [bulkProgress, setBulkProgress] = useState(null);
  const [modelNotice, setModelNotice] = useState(null);
  const requestId = useRef(0);
  const mutation = useRef(false);
  const generating = useRef(new Set());
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current++; }; }, []);

  const load = useCallback(async () => {
    if (!mounted.current) return;
    const request = ++requestId.current;
    setLoading(true); setError("");
    try {
      const result = await resources.campus.listJobs();
      if (request !== requestId.current) return;
      setData(result);
    } catch (e) {
      if (request !== requestId.current) return;
      setData({ items: [], available: [] });
      setError(errMsg(e, "岗位加载失败"));
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => { load(); return () => { requestId.current++; }; }, [load]);

  const { items, available } = data;
  const run = async (fn, refreshSessions = false) => {
    if (mutation.current) return false;
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
  const add = (jobId, kind) => run(() => resources.campus.addJob({ jobId, kind }), true);
  const bulkPatch = (ids, changes) => run(() => resources.campus.bulkUpdateJobs(ids, changes));
  const patch = (sj, body) => {
    if (mutation.current) return;
    setData((prev) => ({ ...prev, items: prev.items.map((item) => item.id === sj.id ? { ...item, ...body } : item) }));
    return run(() => resources.campus.updateJobConfig(sj.id, body));
  };
  const remove = (sj) => run(() => resources.campus.removeJob(sj.id), true);
  const bulkRemove = (ids) => run(() => resources.campus.bulkRemoveJobs(ids), true);
  const move = (idx, dir) => {
    const next = [...items]; const target = idx + dir;
    if (mutation.current || target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setData((prev) => ({ ...prev, items: next }));
    return run(() => resources.campus.reorderJobs(next.map((sj) => sj.id)));
  };
  const generateModel = async (sj) => {
    if (mutation.current || generating.current.size) return;
    generating.current.add(sj.id);
    setBusy((prev) => ({ ...prev, [sj.id]: true }));
    const startedAt = Date.now();
    const title = sj.job?.title || "岗位已删除";
    setModelNotice({ mode: "single", status: "running", title, startedAt });
    try {
      await resources.campus.generateJobModel(sj.id);
      setModelNotice({ mode: "single", status: "success", title, startedAt, message: "评价模型已生成" });
      await load();
    } catch (e) { setModelNotice({ mode: "single", status: "error", title, startedAt, message: errMsg(e, "生成失败") }); }
    finally {
      generating.current.delete(sj.id);
      if (mounted.current) setBusy((prev) => ({ ...prev, [sj.id]: false }));
    }
  };

  const bulkGenerateModels = async (selected) => {
    if (mutation.current || generating.current.size || !selected.length) return null;
    mutation.current = true; setMutating(true);
    const failed = [];
    const startedAt = Date.now();
    setModelNotice({ mode: "bulk", status: "running", total: selected.length, done: 0, failed: 0, current: selected[0].job?.title || "岗位已删除", startedAt });
    setBulkProgress({ done: 0, total: selected.length });
    try {
      for (const [index, sj] of selected.entries()) {
        generating.current.add(sj.id);
        setBusy((prev) => ({ ...prev, [sj.id]: true }));
        setModelNotice((prev) => ({ ...prev, current: sj.job?.title || "岗位已删除" }));
        try { await resources.campus.generateJobModel(sj.id); }
        catch (e) { failed.push({ id: sj.id, title: sj.job?.title || "岗位已删除", error: errMsg(e, "生成失败") }); }
        finally {
          generating.current.delete(sj.id);
          if (mounted.current) {
            setBusy((prev) => ({ ...prev, [sj.id]: false }));
            setBulkProgress({ done: index + 1, total: selected.length });
            setModelNotice((prev) => ({ ...prev, done: index + 1, failed: failed.length }));
          }
        }
      }
      await load();
      setModelNotice({ mode: "bulk", status: failed.length ? "error" : "success", total: selected.length, done: selected.length, failed: failed.length, startedAt,
        message: failed.length ? failed.map((x) => `${x.title}: ${x.error}`).join("; ") : `已为 ${selected.length} 个岗位生成评价模型` });
      return failed.map((x) => x.id);
    } finally {
      mutation.current = false;
      if (mounted.current) { setMutating(false); setBulkProgress(null); }
    }
  };

  const dismissModelNotice = () => setModelNotice((prev) => prev?.status === "running" ? prev : null);

  return { items, available, loading, error, busy, mutating, bulkProgress, modelNotice, dismissModelNotice, load, add, patch, bulkPatch, remove, bulkRemove, move, generateModel, bulkGenerateModels };
}
