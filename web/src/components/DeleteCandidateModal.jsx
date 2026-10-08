import { useState } from "react";
import { Button, I, Modal, toast } from "./Primitives.jsx";
import { resources } from "../lib/api.js";

export default function DeleteCandidateModal({ candidate, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function removeCandidate() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await resources.candidates.remove(candidate.id);
      toast("候选人已删除", "success");
      onDeleted();
    } catch (e) {
      setError(e.response?.data?.message || e.message || "删除失败，请重试");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth="max-w-md">
      <section role="dialog" aria-modal="true" aria-labelledby="delete-candidate-title" className="p-5 sm:p-6">
        <h3 id="delete-candidate-title" className="flex items-center gap-2 text-lg font-bold text-navy-700">
          <I name="trash-2" size={18} className="text-red-500" /> 删除候选人
        </h3>
        <p className="mt-3 text-sm leading-6 text-gray-700">
          确定删除 <span className="font-bold text-navy-700">{candidate.name}</span> 吗？关联的校招登记、投递、简历版本及评价也会一并删除，无法恢复。
        </p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
          <Button type="button" variant="danger" onClick={removeCandidate} disabled={busy} icon={<I name={busy ? "loader" : "trash-2"} size={14} className={busy ? "animate-spin" : ""} />}>
            {busy ? "删除中…" : "确认删除"}
          </Button>
        </div>
      </section>
    </Modal>
  );
}
