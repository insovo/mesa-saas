// 公开面试评价页 — 通过 /interview-eval/:token 访问,无需登录
//
// 流程:
//   GET /api/public/interview-eval/:token → 拉取表单数据(含 scoringRubric)
//   PATCH /api/public/interview-eval/:token → 草稿合并保存(30s 自动)
//   POST /api/public/interview-eval/:token/submit → 提交校验 + 算总分
//   GET /api/public/interview-eval/:token/export.xlsx → 提交后下载
//
// 模板字段 / 评分维度 / 计算逻辑后端是唯一来源,前端只镜像 (lib/interviewEvalTemplate.js)

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { Card, Button, Input, I, toast, LoadingBlock, ToastHost, Modal, LiquidLoader, RequiredMark } from "../components/Primitives.jsx";

// 访客在公开分享页「添加评论」时填过的姓名(本浏览器 localStorage)— key 与 SharedCandidate 一致,
// 用于面试评价页面试官姓名为空时自动预填(可改)。
function readVisitorName() {
  try {
    const arr = JSON.parse(localStorage.getItem("mesa.public.review.names") || "[]");
    return Array.isArray(arr) && arr[0] ? String(arr[0]).slice(0, 100) : "";
  } catch { return ""; }
}

// 海外研究院地区分组 — 来源:海外研究院人员统计.xlsx
const REGION_GROUPS = [
  { group: "欧洲研发中心", items: ["德国", "西班牙", "法国", "波兰", "意大利"] },
  { group: "右舵研发中心", items: ["马来", "印尼", "泰国", "南非", "澳新"] },
  { group: "其他", items: ["英国", "巴西", "墨西哥", "土耳其", "中东", "以色列", "乌兹", "越南", "阿尔及利亚"] },
];

// 语言/沟通优势快捷短语
const LANGUAGE_QUICK_PICKS = [
  "中文流利", "英语流利", "英语母语级", "西语流利", "法语流利", "德语流利",
  "葡语流利", "阿语流利", "俄语流利", "马来语流利", "印尼语流利", "泰语流利",
  "双语沟通无障碍", "可独立对外谈判",
];

// 最终意见快捷短语 — 点击追加到 textarea 末尾,降低面试官写作摩擦
const FINAL_OPINION_QUICK_PICKS = [
  { label: "建议录用", text: "综合评分较高,核心能力满足岗位要求,建议录用。" },
  { label: "建议复试", text: "整体表现良好,部分维度需要进一步验证,建议安排复试。" },
  { label: "谨慎考虑", text: "存在一定能力或匹配度风险,建议谨慎考虑,可对比其他候选人后再定。" },
  { label: "不建议录用", text: "核心维度未达岗位要求,不建议进入下一轮。" },
  { label: "语言能力突出", text: "语言/沟通能力突出,可独立对外协作。" },
  { label: "经验不足", text: "实战经验较少,需要较长培养周期。" },
  { label: "态度积极", text: "学习意愿强、态度积极,具备成长潜力。" },
];

// 后端字段名 → label 对齐 (用于错误提示)
const FIELD_LABELS = {
  candidateName: "姓名", position: "应聘岗位", region: "属地国家/地区",
  interviewDate: "面试日期", interviewer: "面试官", languageStrength: "语言/沟通优势",
  currentCity: "当前城市", department: "应聘部门", timezoneCollaboration: "是否接受跨时区协作",
  strengths: "优势亮点", risks: "主要风险",
  followUpQuestions: "建议追问/复试方向", finalOpinion: "最终意见",
};

// 前端镜像后端计算 (与 server/src/lib/interviewEvalTemplate.js 对齐)
function weighted(weight, score) {
  if (score == null || score === "" || isNaN(score)) return null;
  return Math.round((weight * Number(score) / 10) * 10) / 10;
}
function totalOf(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return null;
  let sum = 0, any = false;
  for (const s of scores) {
    const w = weighted(s.weight, s.score);
    if (w != null) { sum += w; any = true; }
  }
  return any ? Math.round(sum * 10) / 10 : null;
}
function recommendOf(total) {
  if (total == null) return null;
  if (total >= 85) return "建议录用";
  if (total >= 75) return "建议复试";
  if (total >= 60) return "谨慎考虑";
  return "不建议录用";
}

// ─── 子组件 ─────────────────────────────────────────────────────

function ErrorScreen({ icon, title, message, code }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-gradient-to-br from-lightPrimary via-white to-lightPrimary">
      <Card className="p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 text-red-500 mx-auto flex items-center justify-center mb-5">
          <I name={icon} size={28} />
        </div>
        <h2 className="text-xl font-bold text-navy-700 mb-2">{title}</h2>
        <p className="text-sm text-gray-700">{message}</p>
        {code && <p className="text-[11px] text-gray-400 mt-3 font-mono">code: {code}</p>}
        <p className="text-xs text-gray-400 mt-6">请联系发送此链接的招聘官。</p>
      </Card>
    </div>
  );
}

function RubricModal({ open, onClose, rubric }) {
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-4xl">
      <div className="p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
            <I name="book-open" size={18} className="text-brand" /> 评分标准说明
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <I name="x" size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-700 mb-4 bg-amber-50 border border-amber-200 p-3 rounded-xl">
          先按事实记录，再按标准打分；同一岗位建议由至少 2 位面试官独立评分后再讨论结论。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-gray-700 border-b border-gray-200">
                <th className="py-2 pr-2 font-bold">维度</th>
                <th className="py-2 px-2 font-bold">核心定义</th>
                <th className="py-2 px-2 font-bold text-green-700">9-10 分</th>
                <th className="py-2 px-2 font-bold text-blue-700">7-8 分</th>
                <th className="py-2 px-2 font-bold text-amber-700">5-6 分</th>
                <th className="py-2 pl-2 font-bold text-red-700">1-4 分</th>
              </tr>
            </thead>
            <tbody>
              {(rubric || []).map((row, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-3 pr-2 font-bold text-navy-700 align-top">{row.dimension}</td>
                  <td className="py-3 px-2 text-gray-700 align-top">{row.definition}</td>
                  {(row.levels || []).map((lvl, j) => (
                    <td key={j} className="py-3 px-2 text-gray-700 align-top">{lvl.desc}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-500 mt-5 italic">
          建议不要把"学历、年龄、表达风格偏好"等与岗位无关或不应作为决定性因素的内容直接折算进分值。
        </p>
      </div>
    </Modal>
  );
}

// 1-10 评分控件 — 数字步进器 + 豆豆条 + 直接键盘输入
function ScoreInput({ value, onChange, disabled }) {
  const n = value == null ? null : Number(value);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="number"
        min={1}
        max={10}
        step={1}
        value={n == null ? "" : n}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") return onChange(null);
          const x = parseInt(v, 10);
          if (Number.isInteger(x) && x >= 1 && x <= 10) onChange(x);
        }}
        className="w-16 h-10 rounded-xl border border-gray-200 px-2 text-center text-sm font-bold text-navy-700 outline-none focus:border-brand disabled:bg-gray-100"
        placeholder="-"
      />
      <div className="flex gap-1" role="radiogroup" aria-label="评分 1-10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={n === d}
            disabled={disabled}
            onClick={() => onChange(d)}
            className={`w-7 h-7 rounded-full text-[11px] font-bold transition ${
              n === d
                ? "bg-brand-gradient text-white shadow"
                : "bg-gray-100 text-gray-700 hover:bg-lightPrimary"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreRow({ dim, item, onChange, readonly }) {
  const w = weighted(dim.weight, item?.score);
  return (
    <div className="border-t border-gray-100 first:border-t-0 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-bold text-navy-700">{dim.name}<RequiredMark /></p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-lightPrimary text-brand font-bold">权重 {dim.weight}%</span>
          </div>
          <p className="text-[12px] text-gray-700 leading-relaxed">{dim.observation}</p>
        </div>
        <div className="shrink-0 min-w-0">
          <ScoreInput
            value={item?.score ?? null}
            disabled={readonly}
            onChange={(v) => onChange({ key: dim.key, score: v, remark: item?.remark || "" })}
          />
          <p className="text-[11px] text-gray-500 mt-1 text-right">
            {w == null ? <span className="text-gray-400">加权 -</span> : <>加权 <b className="text-brand">{w}</b></>}
          </p>
        </div>
      </div>
      <textarea
        value={item?.remark || ""}
        disabled={readonly}
        onChange={(e) => onChange({ key: dim.key, score: item?.score ?? null, remark: e.target.value })}
        placeholder={`备注 (可选, ≤ 200 字)${item?.score != null && item.score <= 6 ? " — 建议说明低分原因" : ""}`}
        rows={2}
        maxLength={200}
        className={`w-full mt-3 rounded-xl border p-3 text-[13px] text-navy-700 outline-none focus:border-brand resize-y bg-white ${
          item?.score != null && item.score <= 6 && !item?.remark ? "border-amber-300 bg-amber-50/30" : "border-gray-200"
        } disabled:bg-gray-100`}
      />
    </div>
  );
}

// 推荐结论的色彩 chip
function RecommendChip({ recommendation }) {
  if (!recommendation) return null;
  const tone = recommendation === "建议录用" ? "bg-green-100 text-green-700"
    : recommendation === "建议复试" ? "bg-brand-50 text-brand-700"
    : recommendation === "谨慎考虑" ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-700";
  return <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${tone}`}>{recommendation}</span>;
}

// 通用 Combobox: chip-style 多选(value 内部仍是「、」分隔字符串,UI 是 tag 化)
// 用户体验:已选项作为 chip 渲染,× 可移除,后跟自由输入区。无需用户手动输入分隔符。
// - groups: [{group, items}] 分组候选 (优先于 options)
// - options: string[] 单层候选
// - 始终多选 toggle;value 通过 join("、") 持久化兼容后端 string 字段
function Combobox({ value, onChange, groups, options, placeholder, disabled, maxLength = 200 }) {
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const isComposingRef = useRef(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // value 字符串 → 已选数组(保序)
  const selectedList = useMemo(() => {
    const v = (value || "").trim();
    if (!v) return [];
    return v.split(/[、,,]\s*/).map((s) => s.trim()).filter(Boolean);
  }, [value]);
  const selectedSet = useMemo(() => new Set(selectedList), [selectedList]);

  function commit(nextList) {
    onChange(nextList.join("、").slice(0, maxLength));
  }
  function addItem(item) {
    const cleaned = item.trim();
    if (!cleaned) return;
    if (selectedSet.has(cleaned)) return;
    commit([...selectedList, cleaned]);
    setInputText("");
  }
  function removeItem(item) {
    commit(selectedList.filter((s) => s !== item));
  }
  function toggleItem(item) {
    if (selectedSet.has(item)) removeItem(item);
    else addItem(item);
  }

  function handleKeyDown(e) {
    if (isComposingRef.current) return; // IME 中文输入中,Enter 是确认而非提交
    if ((e.key === "Enter" || e.key === "、" || e.key === ",") && inputText.trim()) {
      e.preventDefault();
      addItem(inputText);
    } else if (e.key === "Backspace" && inputText === "" && selectedList.length > 0) {
      e.preventDefault();
      removeItem(selectedList[selectedList.length - 1]);
    }
  }

  const filterKeyword = inputText.trim();
  function matches(item) {
    if (!filterKeyword) return true;
    return item.toLowerCase().includes(filterKeyword.toLowerCase());
  }
  const visibleGroups = groups
    ? groups.map((g) => ({ ...g, items: g.items.filter(matches) })).filter((g) => g.items.length > 0)
    : null;
  const visibleOptions = options ? options.filter(matches) : null;
  const hasResult = visibleGroups ? visibleGroups.length > 0 : (visibleOptions && visibleOptions.length > 0);

  function renderItem(item) {
    const isSelected = selectedSet.has(item);
    return (
      <button
        key={item}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { toggleItem(item); inputRef.current?.focus(); }}
        className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition ${
          isSelected ? "text-brand font-bold bg-lightPrimary/60 hover:bg-lightPrimary" : "text-navy-700 hover:bg-lightPrimary/40"
        }`}
      >
        <span>{item}</span>
        {isSelected && <I name="check" size={14} className="text-brand shrink-0" />}
      </button>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <div
        onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus(); } }}
        className={`flex flex-wrap items-center gap-1.5 min-h-12 rounded-xl border bg-white px-2 py-1.5 pr-9 text-sm transition-colors ${
          disabled ? "border-none bg-gray-100" : "border-gray-200 focus-within:border-brand cursor-text"
        }`}
      >
        {selectedList.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-lightPrimary text-brand text-xs font-bold border border-brand/20"
          >
            {item}
            {!disabled && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); removeItem(item); }}
                className="w-4 h-4 rounded-full hover:bg-brand hover:text-white flex items-center justify-center transition"
                aria-label={`移除 ${item}`}
              >
                <I name="x" size={10} />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => { setInputText(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => { isComposingRef.current = false; }}
          disabled={disabled}
          placeholder={selectedList.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[80px] h-7 px-1 bg-transparent outline-none text-navy-700 placeholder:text-gray-400 disabled:bg-transparent"
        />
      </div>
      {!disabled && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); inputRef.current?.focus(); }}
          className="absolute right-2 top-2 w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400"
          aria-label={open ? "收起" : "展开候选"}
        >
          <I name={open ? "chevron-up" : "chevron-down"} size={14} />
        </button>
      )}
      {open && !disabled && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-card py-1">
          {!hasResult && filterKeyword && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addItem(filterKeyword)}
              className="w-full text-left px-3 py-2 text-sm text-brand hover:bg-lightPrimary/40 flex items-center gap-2"
            >
              <I name="plus" size={14} /> 添加自定义:「{filterKeyword}」
            </button>
          )}
          {!hasResult && !filterKeyword && (
            <p className="px-3 py-2 text-xs text-gray-400">无候选,可输入回车添加</p>
          )}
          {visibleGroups && visibleGroups.map((g) => (
            <div key={g.group}>
              <p className="text-[10px] text-gray-400 px-3 pt-2 pb-1 font-bold uppercase tracking-wide">{g.group}</p>
              {g.items.map(renderItem)}
            </div>
          ))}
          {visibleOptions && visibleOptions.map(renderItem)}
          <p className="text-[10px] text-gray-400 px-3 py-1.5 border-t border-gray-100">点候选 toggle · 回车添加自定义 · Backspace 删最后一个</p>
        </div>
      )}
    </div>
  );
}
// ─── 主页面 ─────────────────────────────────────────────────────

const STATE_LOADING = "loading";
const STATE_READY = "ready";
const STATE_ERROR = "error";
const STATE_SUBMITTING = "submitting";

export default function PublicInterviewEval() {
  const { token } = useParams();
  const [state, setState] = useState(STATE_LOADING);
  const [errorInfo, setErrorInfo] = useState({ icon: "alert-triangle", title: "", message: "", code: "" });

  // 服务端拉到的 meta + rubric (不改)
  const [meta, setMeta] = useState(null);
  const [rubric, setRubric] = useState([]);
  const [dimensions, setDimensions] = useState([]);  // 不变的 7 维度 (key/name/weight/observation)

  // 可编辑字段
  const [form, setForm] = useState(null);  // 候选人信息 + 纪要 + scores
  const [rubricOpen, setRubricOpen] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [showSubmitted, setShowSubmitted] = useState(false);  // 提交成功后 banner

  // 草稿合并保存防抖
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const lastSavedAtRef = useRef(null);
  const [savingLabel, setSavingLabel] = useState("");

  // 初次加载
  useEffect(() => {
    if (!token) return;
    api.get(`/public/interview-eval/${token}`)
      .then((r) => {
        const ev = r.data.evaluation;
        setMeta(r.data.meta || {});
        setRubric(r.data.scoringRubric || []);
        setDimensions((ev.scores || []).map((s) => ({
          key: s.key, name: s.name, weight: s.weight, observation: s.observation,
        })));
        setForm({
          candidateName: ev.candidateName || "",
          position: ev.position || "",
          region: ev.region || "",
          interviewDate: ev.interviewDate ? new Date(ev.interviewDate).toISOString().slice(0, 10) : "",
          // 面试官姓名为空时,沿用访客在本浏览器「添加评论」时填过的姓名(可改)
          interviewer: ev.interviewer || readVisitorName(),
          languageStrength: ev.languageStrength || "",
          currentCity: ev.currentCity || "",
          department: ev.department || "",
          timezoneCollaboration: ev.timezoneCollaboration || "",
          scores: (ev.scores || []).map((s) => ({ key: s.key, score: s.score, remark: s.remark || "" })),
          strengths: ev.strengths || "",
          risks: ev.risks || "",
          followUpQuestions: ev.followUpQuestions || "",
          finalOpinion: ev.finalOpinion || "",
        });
        if (ev.status === "submitted") setShowSubmitted(true);
        setState(STATE_READY);
      })
      .catch((err) => {
        const data = err.response?.data || {};
        const status = err.response?.status;
        const icon = status === 410 ? "clock" : status === 404 ? "link-2-off" : "alert-triangle";
        const title = data.error === "eval_revoked" ? "链接已撤销"
          : status === 410 ? "链接已失效"
          : status === 404 ? "链接不存在" : "无法访问";
        setErrorInfo({ icon, title, message: data.message || "请向发送链接的招聘官核实", code: data.error });
        setState(STATE_ERROR);
      });
  }, [token]);

  const readonly = meta?.readonly === true;

  // 实时 total / recommendation
  const scoresForCompute = useMemo(() => {
    if (!form || !dimensions.length) return [];
    const byKey = new Map(form.scores.map((s) => [s.key, s.score]));
    return dimensions.map((d) => ({ ...d, score: byKey.get(d.key) ?? null }));
  }, [form, dimensions]);
  const liveTotal = useMemo(() => totalOf(scoresForCompute), [scoresForCompute]);
  const liveRecommend = useMemo(() => recommendOf(liveTotal), [liveTotal]);

  // 草稿自动保存
  function markDirty() {
    dirtyRef.current = true;
  }
  async function saveDraftNow() {
    if (!form || !token || readonly || savingRef.current || !dirtyRef.current) return;
    savingRef.current = true;
    setSavingLabel("保存中…");
    try {
      const body = {
        position: form.position || null,
        region: form.region || null,
        interviewDate: form.interviewDate ? new Date(form.interviewDate).toISOString() : null,
        interviewer: form.interviewer || null,
        languageStrength: form.languageStrength || null,
        currentCity: form.currentCity || null,
        department: form.department || null,
        timezoneCollaboration: form.timezoneCollaboration || null,
        scores: form.scores.map((s) => ({ key: s.key, score: s.score, remark: s.remark || "" })),
        strengths: form.strengths || null,
        risks: form.risks || null,
        followUpQuestions: form.followUpQuestions || null,
        finalOpinion: form.finalOpinion || null,
      };
      await api.patch(`/public/interview-eval/${token}`, body);
      dirtyRef.current = false;
      lastSavedAtRef.current = new Date();
      setSavingLabel(`已保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (err) {
      const data = err.response?.data || {};
      setSavingLabel(`保存失败: ${data.message || err.message}`);
    } finally {
      savingRef.current = false;
    }
  }

  // 30s 心跳自动保存
  useEffect(() => {
    if (state !== STATE_READY || readonly) return;
    const id = setInterval(() => { saveDraftNow(); }, 30000);
    // 页面切走时再保一次
    const onBeforeUnload = () => { if (dirtyRef.current) saveDraftNow(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => { clearInterval(id); window.removeEventListener("beforeunload", onBeforeUnload); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, readonly]);

  // 提交前的前端镜像校验 — 与后端 validateForSubmit 对齐,避免 422 才报错
  function validatePreSubmit() {
    if (!form) return { ok: false, message: "表单尚未就绪", anchor: null };
    // 候选人信息必填
    const requiredInfo = [
      { key: "candidateName", label: "姓名" },
      { key: "position", label: "应聘岗位" },
      { key: "interviewDate", label: "面试日期" },
      { key: "interviewer", label: "面试官" },
    ];
    for (const f of requiredInfo) {
      if (!form[f.key] || !String(form[f.key]).trim()) {
        return { ok: false, message: `${f.label} 不能为空`, anchor: "info" };
      }
    }
    // 7 项评分必须 1-10 整数
    const scoresByKey = new Map((form.scores || []).map((s) => [s.key, s.score]));
    for (const dim of dimensions) {
      const v = scoresByKey.get(dim.key);
      if (v == null || !Number.isInteger(Number(v)) || Number(v) < 1 || Number(v) > 10) {
        return { ok: false, message: `${dim.name} 评分必填 (1-10 整数)`, anchor: "scores" };
      }
    }
    // 最终意见必填
    if (!form.finalOpinion || !form.finalOpinion.trim()) {
      return { ok: false, message: "最终意见 不能为空", anchor: "final" };
    }
    return { ok: true };
  }

  // 「提交评价」按钮点击 — 先校验,通过才弹确认 Modal
  function onSubmitClick() {
    const v = validatePreSubmit();
    if (!v.ok) {
      toast(v.message, "error");
      // 滚到对应区域,方便面试官定位
      const anchor = v.anchor;
      if (anchor) {
        const el = document.querySelector(`[data-eval-anchor="${anchor}"]`);
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
      return;
    }
    setConfirmSubmit(true);
  }

  // 提交
  async function doSubmit() {
    // 提交前先把当前未保存草稿冲一次
    await saveDraftNow();
    setState(STATE_SUBMITTING);
    try {
      const { data } = await api.post(`/public/interview-eval/${token}/submit`, {});
      // 提交成功 → 把后端最新数据回灌
      const ev = data.evaluation;
      setMeta(data.meta || {});
      setForm((prev) => ({
        ...prev,
        scores: (ev.scores || []).map((s) => ({ key: s.key, score: s.score, remark: s.remark || "" })),
        strengths: ev.strengths || "",
        risks: ev.risks || "",
        followUpQuestions: ev.followUpQuestions || "",
        finalOpinion: ev.finalOpinion || "",
      }));
      setShowSubmitted(true);
      setConfirmSubmit(false);
      setState(STATE_READY);
      toast("评价已提交,感谢您的反馈 ✓", "success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setState(STATE_READY);
      const data = err.response?.data || {};
      if (data.error === "eval_validation_failed" && Array.isArray(data.details)) {
        const first = data.details[0];
        const label = FIELD_LABELS[first.field] || first.field;
        toast(`${label}: ${first.message}`, "error");
      } else {
        toast(data.message || "提交失败,请稍后再试", "error");
      }
    }
  }

  function downloadXlsx() {
    // 直接打开下载 URL,浏览器走 Content-Disposition 触发保存
    window.location.href = `/api/public/interview-eval/${token}/export.xlsx`;
  }

  // ─── 渲染 ─────────────────────────────────────────────────────

  if (state === STATE_LOADING) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingBlock label="验证链接中..." height="h-16" />
        <ToastHost />
      </div>
    );
  }
  if (state === STATE_ERROR) {
    return <><ErrorScreen {...errorInfo} /><ToastHost /></>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-lightPrimary via-white to-lightPrimary px-4 sm:px-5 py-8">
      <div className="max-w-4xl mx-auto space-y-5 pb-32">
        {/* ── 顶部 ── */}
        <Card className="p-6 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-brand-gradient opacity-10 blur-3xl pointer-events-none"></div>
          <div className="relative flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-brand-gradient flex items-center justify-center text-white shrink-0">
                  <I name="clipboard-check" size={22} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-navy-700">属地员工面试评价表</h2>
                  <p className="text-xs text-gray-700">为「<b>{form?.candidateName}</b>{form?.position ? ` · ${form.position}` : ""}」打分</p>
                </div>
              </div>
              <p className="text-xs text-gray-700">预计 8-12 分钟 · {meta?.expiresAt ? `链接 ${new Date(meta.expiresAt).toLocaleDateString("zh-CN")} 过期` : "链接长期有效"}</p>
            </div>
            <button
              onClick={() => setRubricOpen(true)}
              className="shrink-0 text-xs font-bold text-brand hover:underline flex items-center gap-1.5 bg-lightPrimary px-3 py-2 rounded-xl"
            >
              <I name="book-open" size={14} /> 评分标准
            </button>
          </div>
        </Card>

        {/* ── 已提交提示 banner ── */}
        {showSubmitted && (
          <Card className="p-5 bg-green-50 border-green-200">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                <I name="check-circle" size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-green-900">评价已提交</p>
                <p className="text-xs text-green-800 mt-0.5">感谢您的反馈！如需修改请联系发送链接的招聘官退回编辑。</p>
              </div>
              {meta?.canExport && (
                <Button onClick={downloadXlsx} icon={<I name="download" size={14} />} className="!bg-green-600 hover:!bg-green-700">
                  下载本次评价 xlsx
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* ── 一、候选人信息 ── */}
        <Card className="p-7" data-eval-anchor="info">
          <h3 className="text-base font-bold text-navy-700 mb-5 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-brand-gradient text-white inline-flex items-center justify-center text-xs">一</span>
            候选人信息
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: "candidateName", label: "姓名", required: true },
              { key: "position", label: "应聘岗位", required: true },
              { key: "region", label: "属地国家/地区", kind: "region-combobox" },
              { key: "interviewDate", label: "面试日期", type: "date", required: true },
              { key: "interviewer", label: "面试官", required: true },
              { key: "languageStrength", label: "语言/沟通优势", kind: "language-combobox" },
              { key: "currentCity", label: "当前城市" },
              { key: "department", label: "应聘部门" },
              { key: "timezoneCollaboration", label: "跨时区协作" },
            ].map((f) => {
              if (f.kind === "region-combobox") {
                return (
                  <div key={f.key}>
                    <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">{f.label}</label>
                    <Combobox
                      value={form[f.key] || ""}
                      onChange={(v) => {
                        setForm((prev) => ({ ...prev, [f.key]: v }));
                        markDirty();
                      }}
                      groups={REGION_GROUPS}
                      placeholder="选择或输入(可多个),如「德国、波兰」"
                      disabled={readonly}
                      maxLength={200}
                    />
                  </div>
                );
              }
              if (f.kind === "language-combobox") {
                return (
                  <div key={f.key}>
                    <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">{f.label}</label>
                    <Combobox
                      value={form[f.key] || ""}
                      onChange={(v) => {
                        setForm((prev) => ({ ...prev, [f.key]: v }));
                        markDirty();
                      }}
                      options={LANGUAGE_QUICK_PICKS}
                      placeholder="点击或输入(可多个),如「中文流利、英语流利」"
                      disabled={readonly}
                      maxLength={200}
                    />
                  </div>
                );
              }
              return (
                <Input
                  key={f.key}
                  label={f.label}
                  required={f.required}
                  type={f.type || "text"}
                  value={form[f.key] || ""}
                  disabled={readonly}
                  maxLength={200}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, [f.key]: e.target.value }));
                    markDirty();
                  }}
                />
              );
            })}
          </div>
        </Card>

        {/* ── 二、核心评分项 ── */}
        <Card className="p-7" data-eval-anchor="scores">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
            <h3 className="text-base font-bold text-navy-700 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-brand-gradient text-white inline-flex items-center justify-center text-xs">二</span>
              核心评分项
              <span className="text-[11px] text-gray-700 font-normal">(每项 1-10 分，权重折算 100 分)</span>
            </h3>
            <button onClick={() => setRubricOpen(true)} className="text-[11px] text-brand hover:underline">不知道怎么评?查看评分标准 →</button>
          </div>

          <div className="bg-gray-50/50 rounded-2xl px-5 py-2">
            {dimensions.map((dim) => {
              const item = form.scores.find((s) => s.key === dim.key);
              return (
                <ScoreRow
                  key={dim.key}
                  dim={dim}
                  item={item}
                  readonly={readonly}
                  onChange={(next) => {
                    setForm((prev) => {
                      const arr = prev.scores.filter((s) => s.key !== next.key);
                      arr.push({ key: next.key, score: next.score, remark: next.remark });
                      return { ...prev, scores: arr };
                    });
                    markDirty();
                  }}
                />
              );
            })}
          </div>

          {/* 总分气泡 */}
          <div className="mt-6 pt-5 border-t-2 border-dashed border-gray-200 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-gray-700">总分 (满分 100)</p>
            <div className="flex items-center gap-4">
              <LiquidLoader size={64} level={liveTotal ?? 0} label={liveTotal ?? ""} loading={false} />
              <div>
                <p className="text-[11px] text-gray-700">推荐结论</p>
                <div className="mt-1">{liveRecommend ? <RecommendChip recommendation={liveRecommend} /> : <span className="text-xs text-gray-400">填完 7 项评分后显示</span>}</div>
              </div>
            </div>
          </div>
        </Card>

        {/* ── 三、面试纪要 ── */}
        <Card className="p-7" data-eval-anchor="final">
          <h3 className="text-base font-bold text-navy-700 mb-5 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-brand-gradient text-white inline-flex items-center justify-center text-xs">三</span>
            面试纪要
          </h3>
          <div className="space-y-4">
            {[
              { key: "strengths", label: "优势亮点", placeholder: "请记录候选人最突出的能力、案例或潜力" },
              { key: "risks", label: "主要风险", placeholder: "请记录稳定性、能力短板、到岗风险或其他疑虑" },
              { key: "followUpQuestions", label: "建议追问/复试方向", placeholder: "如需复试，建议重点验证的问题" },
              { key: "finalOpinion", label: "最终意见", required: true, placeholder: "请结合评分与事实，写出简洁结论", quickPicks: FINAL_OPINION_QUICK_PICKS },
            ].map((f) => {
              // 最终意见用精美卡片 — 视觉等级高于其他 3 段,吸引面试官完成必填项
              const isFinal = f.required;
              const wrapperCls = isFinal
                ? "relative rounded-2xl p-5 bg-gradient-to-br from-lightPrimary via-white to-amber-50/40 ring-2 ring-brand/30 shadow-card/30 overflow-hidden"
                : "";
              const textareaCls = isFinal
                ? "w-full rounded-xl border-2 border-brand/30 p-3 text-sm text-navy-700 outline-none focus:border-brand bg-white resize-y disabled:bg-gray-100"
                : "w-full rounded-xl border border-gray-200 p-3 text-sm text-navy-700 outline-none focus:border-brand bg-white resize-y disabled:bg-gray-100";
              return (
                <div key={f.key} className={wrapperCls}>
                  {isFinal && (
                    <div className="absolute -right-12 -top-12 w-32 h-32 rounded-full bg-brand-gradient opacity-10 blur-2xl pointer-events-none" />
                  )}
                  {isFinal ? (
                    <div className="relative flex items-center gap-2.5 mb-1">
                      <div className="w-9 h-9 rounded-full bg-brand-gradient text-white flex items-center justify-center shrink-0 shadow">
                        <I name="sparkles" size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-bold text-navy-700 flex items-center gap-1">
                          {f.label}
                          <RequiredMark />
                        </h4>
                        <p className="text-[11px] text-gray-700">面试官的核心结论 · 决定候选人是否进入下一轮</p>
                      </div>
                    </div>
                  ) : (
                    <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">
                      {f.label}
                      {f.required && <RequiredMark />}
                    </label>
                  )}
                  {f.quickPicks && !readonly && (
                    <div className={`relative flex flex-wrap gap-1.5 ${isFinal ? "mt-3 mb-3" : "mb-2 ml-3"}`}>
                      {f.quickPicks.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => {
                            setForm((prev) => {
                              const cur = (prev[f.key] || "").trim();
                              const next = cur ? `${cur}\n${p.text}` : p.text;
                              return { ...prev, [f.key]: next.slice(0, 500) };
                            });
                            markDirty();
                          }}
                          className="px-2.5 py-1 rounded-full text-[11px] bg-white text-brand hover:bg-brand hover:text-white transition border border-brand/30 font-bold shadow-sm"
                          title="点击追加到内容末尾"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={form[f.key] || ""}
                    disabled={readonly}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, [f.key]: e.target.value }));
                      markDirty();
                    }}
                    placeholder={f.placeholder}
                    rows={isFinal ? 4 : 3}
                    maxLength={500}
                    className={`relative ${textareaCls}`}
                  />
                  <p className={`relative text-[11px] mt-1 text-right ${isFinal ? "text-brand/70" : "text-gray-500"}`}>
                    {(form[f.key] || "").length} / 500
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        <p className="text-center text-[11px] text-gray-400">
          由 Overseas R&amp;D 提供 · 您的评价仅用于本次招聘
        </p>
      </div>

      {/* ── 底部 sticky 操作栏 ── */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 sm:px-6 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] text-gray-500 flex items-center gap-2 min-w-0">
            {!readonly && (
              <>
                <I name="cloud" size={12} className="text-brand shrink-0" />
                <span className="truncate">{savingLabel || "草稿每 30 秒自动保存"}</span>
              </>
            )}
            {readonly && <><I name="lock" size={12} /> <span>评价已锁定</span></>}
          </div>
          <div className="flex items-center gap-2">
            {!readonly && (
              <Button onClick={saveDraftNow} variant="ghost" icon={<I name="save" size={14} />} disabled={state === STATE_SUBMITTING}>
                保存草稿
              </Button>
            )}
            {!readonly && (
              <Button
                onClick={onSubmitClick}
                icon={<I name="send" size={14} />}
                disabled={state === STATE_SUBMITTING}
              >
                提交评价
              </Button>
            )}
            {readonly && meta?.canExport && (
              <Button onClick={downloadXlsx} icon={<I name="download" size={14} />}>
                下载 xlsx
              </Button>
            )}
          </div>
        </div>
      </div>

      <RubricModal open={rubricOpen} onClose={() => setRubricOpen(false)} rubric={rubric} />

      {/* 提交确认 Modal */}
      <Modal open={confirmSubmit} onClose={() => setConfirmSubmit(false)} maxWidth="max-w-md">
        <div className="p-7">
          <h3 className="text-lg font-bold text-navy-700 mb-3 flex items-center gap-2">
            <I name="alert-circle" size={20} className="text-amber-500" /> 确认提交评价
          </h3>
          <div className="bg-lightPrimary p-4 rounded-xl mb-5 space-y-2">
            <p className="text-sm text-navy-700">
              候选人:<b>{form?.candidateName}</b>
            </p>
            <div className="text-sm text-navy-700 flex items-center gap-2">
              <span>总分:</span>
              <LiquidLoader size={32} level={liveTotal ?? 0} label={liveTotal ?? ""} />
              <RecommendChip recommendation={liveRecommend} />
            </div>
          </div>
          <p className="text-xs text-gray-700 mb-5">提交后链接将进入只读状态。如需修改请联系招聘官退回编辑。</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmSubmit(false)} disabled={state === STATE_SUBMITTING}>取消</Button>
            <Button onClick={doSubmit} disabled={state === STATE_SUBMITTING} icon={<I name={state === STATE_SUBMITTING ? "loader" : "send"} size={14} className={state === STATE_SUBMITTING ? "animate-spin" : ""} />}>
              {state === STATE_SUBMITTING ? "提交中…" : "确认提交"}
            </Button>
          </div>
        </div>
      </Modal>

      <ToastHost />
    </div>
  );
}
