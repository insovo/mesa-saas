// JD 详情弹窗 — 候选人详情页 / 公开分享页 / 岗位页共用。
// onSwitch 可选:传入则显示「切换 JD」按钮(详情页);不传则纯只读(公开分享页)。
// 三层架构(2026-09-20):新增「结构化 JD」(jdFacts 只读)与「评估标准」(evaluationModel 编辑器)两个 tab;
//   公开页 payload 没有 jdFacts / evaluationModel 时自动隐藏两 tab,零 prop 向后兼容。
//   canEdit=true 时评估标准可编辑并 PATCH job;onSaved(job) 回调让调用方刷新。
import { useEffect, useState } from "react";
import { Modal, I, Button } from "./Primitives.jsx";
import EvaluationModelEditor from "./EvaluationModelEditor.jsx";

const DEGREE_NA = "未限定";
const LEVEL_LABEL = { native: "母语", working: "工作语言", fluent: "流利", intermediate: "良好", basic: "基础" };
const SKILL_LEVEL = { expert: "精通", proficient: "熟练", familiar: "了解" };
const FREQ = { high: "高频", medium: "中频", low: "低频" };
const PROJECT_TYPE = { mass_production: "量产", rnd: "研发", certification: "认证", launch: "上市", it: "IT", research: "科研", other: "其他" };

function Req({ required }) {
  if (required == null) return null;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${required ? "bg-red-50 text-red-600" : "bg-[#F4F7FE] text-[#707EAE]"}`}>{required ? "必须" : "优先"}</span>;
}
function Section({ icon, title, children }) {
  return (
    <section>
      <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2"><I name={icon} size={14} className="text-[#422AFB]" />{title}</h4>
      <div className="space-y-1.5 text-xs text-[#1B254B]">{children}</div>
    </section>
  );
}
function Row({ k, v }) {
  if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) return null;
  return <p><span className="text-[#A3AED0]">{k}:</span>{Array.isArray(v) ? v.join(" / ") : String(v)}</p>;
}
const Chip = ({ children }) => <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#F4F7FE] text-[#1B254B] mr-1 mb-1">{children}</span>;

// 结构化 JD 只读渲染
function JdFactsView({ facts }) {
  const b = facts.basics || {};
  const edu = facts.education || {};
  const ey = facts.experienceYears || {};
  const wc = facts.workConditions || {};
  const rs = facts.restrictions || {};
  const campus = facts.campus || {};
  const has = (a) => Array.isArray(a) && a.length > 0;
  return (
    <div className="space-y-5">
      <Section icon="info" title="基本信息">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
          <Row k="岗位" v={b.title} /><Row k="方向" v={b.direction} /><Row k="部门" v={b.department} /><Row k="职级" v={b.level} />
          <Row k="招聘人数" v={b.openings} /><Row k="地点" v={(b.locations || []).map((l) => l.city)} /><Row k="汇报对象" v={b.reportsTo} />
          <Row k="下属" v={b.teamSize && (b.teamSize.min != null || b.teamSize.max != null) ? `${b.teamSize.min ?? "?"}–${b.teamSize.max ?? "?"} 人` : null} />
          <Row k="性质" v={{ fulltime: "全职", parttime: "兼职", intern: "实习", contract: "合同制" }[b.employmentType]} />
          <Row k="招聘类型" v={{ social: "社招", campus: "校招", both: "社招/校招" }[b.recruitType]} />
          <Row k="薪资" v={b.salary?.raw} /><Row k="到岗" v={b.startBy?.raw} />
        </div>
      </Section>
      {has(facts.responsibilities) && (
        <Section icon="list-checks" title="核心职责">
          {facts.responsibilities.map((r, i) => (
            <div key={i} className="p-2.5 rounded-lg bg-[#F4F7FE]">
              <p className="font-bold flex items-center gap-2">{r.name || `职责 ${i + 1}`}{r.importance === "core" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#422AFB]/10 text-[#422AFB] font-bold">核心</span>}</p>
              {r.description && <p className="text-[#707EAE] mt-0.5 leading-relaxed">{r.description}</p>}
              <div className="mt-1">{(r.actions || []).map((a, j) => <Chip key={j}>{a}</Chip>)}{r.businessArea && <Chip>领域:{r.businessArea}</Chip>}</div>
            </div>
          ))}
        </Section>
      )}
      <Section icon="graduation-cap" title="学历">
        <Row k="最低学历" v={edu.minDegree || DEGREE_NA} />
        <Row k="专业" v={has(edu.majors) ? `${edu.majors.map((m) => m.raw).join(" / ")}(${{ related: "相关专业", strict: "限定专业", any: "不限" }[edu.majorType] || ""})` : null} />
        <Row k="学校要求" v={edu.schoolRequirement} />
        <Row k="接受海外学历" v={edu.acceptOverseasDegree == null ? null : (edu.acceptOverseasDegree ? "是" : "否")} />
        <Row k="接受应届" v={edu.acceptFresh == null ? null : (edu.acceptFresh ? "是" : "否")} />
      </Section>
      <Section icon="briefcase" title="年限要求">
        <Row k="总年限" v={ey.total?.min != null ? `≥ ${ey.total.min} 年${ey.total.max != null ? `,≤ ${ey.total.max} 年` : ""}` : null} />
        {(ey.industry || []).map((x, i) => <Row key={i} k={`行业 · ${x.raw || x.industryTag}`} v={x.min != null ? `≥ ${x.min} 年` : "有经验"} />)}
        {(ey.relevant || []).map((x, i) => <Row key={i} k={`相关 · ${x.raw || x.domainTag}`} v={x.min != null ? `≥ ${x.min} 年` : "有经验"} />)}
        <Row k="管理经验" v={ey.management?.min != null ? `≥ ${ey.management.min} 年` : null} />
        <Row k="海外经验" v={ey.overseas?.min != null ? `≥ ${ey.overseas.min} 年` : null} />
      </Section>
      {has(facts.professionalSkills) && (
        <Section icon="target" title="专业能力">
          {facts.professionalSkills.map((s, i) => (
            <p key={i} className="flex items-center gap-2 flex-wrap">{s.name}{s.level && <span className="text-[#A3AED0]">({SKILL_LEVEL[s.level] || s.level})</span>}<Req required={s.required} />{s.evidenceHint && <span className="text-[#A3AED0] text-[10px]">证据:{s.evidenceHint}</span>}</p>
          ))}
        </Section>
      )}
      {has(facts.tools) && (
        <Section icon="wrench" title="工具 / 软件">
          <div>{facts.tools.map((t, i) => <Chip key={i}>{t.name}{t.level ? ` · ${SKILL_LEVEL[t.level] || t.level}` : ""}{t.required === false ? " · 优先" : ""}</Chip>)}</div>
        </Section>
      )}
      {has(facts.languages) && (
        <Section icon="languages" title="语言">
          {facts.languages.map((l, i) => (
            <p key={i} className="flex items-center gap-2 flex-wrap">{l.raw || l.language}{l.level && <span className="text-[#A3AED0]">({LEVEL_LABEL[l.level] || l.level})</span>}{(l.exams || []).map((e, j) => <Chip key={j}>{e.name} {e.score}</Chip>)}<Req required={l.required} /></p>
          ))}
        </Section>
      )}
      {has(facts.industries) && (
        <Section icon="factory" title="行业经验">
          {facts.industries.map((x, i) => <p key={i} className="flex items-center gap-2 flex-wrap">{x.raw || x.subIndustryTag || x.industryTag}{has(x.regionTags) && <span className="text-[#A3AED0]">({x.regionTags.join("/")})</span>}<Req required={x.required} /></p>)}
        </Section>
      )}
      {has(facts.projectRequirements) && (
        <Section icon="folder-kanban" title="项目经验">
          {facts.projectRequirements.map((p, i) => <p key={i} className="flex items-center gap-2 flex-wrap">{[has(p.regionTags) ? p.regionTags.join("/") : null, p.domain, PROJECT_TYPE[p.type]].filter(Boolean).join(" · ")}{p.role && <span className="text-[#A3AED0]">角色:{p.role}</span>}<Req required={p.required} /></p>)}
        </Section>
      )}
      {has(facts.certificates) && (
        <Section icon="award" title="证书 / 资质">
          {facts.certificates.map((c, i) => <p key={i} className="flex items-center gap-2">{c.name}<Req required={c.required} /></p>)}
        </Section>
      )}
      {has(facts.softSkills) && (
        <Section icon="users" title="通用能力">
          {facts.softSkills.map((s, i) => <p key={i}>{s.name}{has(s.behaviors) && <span className="text-[#A3AED0]"> — {s.behaviors.join(";")}</span>}</p>)}
        </Section>
      )}
      <Section icon="plane" title="工作条件">
        <Row k="地点" v={wc.locations} />
        <Row k="搬迁" v={wc.relocation == null ? null : (wc.relocation ? "需接受异地" : "不需要")} />
        <Row k="海外派驻" v={wc.overseasPosting?.required ? (wc.overseasPosting.raw || "需要") : null} />
        <Row k="出差" v={wc.travel?.required ? `${FREQ[wc.travel.frequency] || ""}${wc.travel.daysPerYear ? ` · 年 ≥ ${wc.travel.daysPerYear} 天` : ""}${has(wc.travel.regions) ? ` · ${wc.travel.regions.join("/")}` : ""}` : null} />
        <Row k="加班" v={wc.overtime == null ? null : (wc.overtime ? "需接受" : "无")} />
        <Row k="倒班" v={wc.shifts == null ? null : (wc.shifts ? "需接受" : "无")} />
        <Row k="远程" v={wc.remote == null ? null : (wc.remote ? "支持" : "不支持")} />
      </Section>
      {(rs.age || rs.gender || has(rs.other)) && (
        <Section icon="shield-alert" title="限制条件">
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-800">
            <p className="text-[10px] font-bold mb-1">⚠ 年龄 / 性别等限制仅作记录,不参与 AI 评估;请核对是否符合当地反歧视法规</p>
            <Row k="年龄" v={rs.age?.raw || (rs.age ? `${rs.age.min ?? ""}–${rs.age.max ?? ""}` : null)} />
            <Row k="性别" v={rs.gender} />
            <Row k="其他" v={rs.other} />
          </div>
        </Section>
      )}
      {(campus.candidateType || has(campus.graduationYears)) && (
        <Section icon="school" title="校招要求">
          <Row k="对象" v={{ fresh: "应届生", experienced: "有经验者", any: "不限" }[campus.candidateType]} />
          <Row k="毕业年份" v={campus.graduationYears} /><Row k="学历" v={campus.degrees} /><Row k="批次" v={campus.batch} />
        </Section>
      )}
      {has(facts.preferred) && (
        <Section icon="sparkles" title="优先项">
          {facts.preferred.map((p, i) => <p key={i} className="text-[#707EAE] flex items-start gap-2"><I name="plus" size={11} className="text-[#A3AED0] mt-1 shrink-0" />{p.raw}</p>)}
        </Section>
      )}
      {has(facts.unverifiedQuotes) && <p className="text-[10px] text-amber-700">⚠ {facts.unverifiedQuotes.length} 处引文未在 JD 原文中找到,请核对:{facts.unverifiedQuotes.join(", ")}</p>}
    </div>
  );
}

export default function JdDescModal({ open, onClose, job, onSwitch, canEdit = false, onSaved, initialTab = "desc" }) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  if (!job) return null;
  // 公开页 payload 不含结构化字段 → 只显示岗位描述(零改动兼容)
  const structuredAvailable = Object.prototype.hasOwnProperty.call(job, "jdFacts") || Object.prototype.hasOwnProperty.call(job, "evaluationModel") || canEdit;
  const tabs = structuredAvailable
    ? [{ v: "desc", l: "岗位描述", icon: "file-text" }, { v: "facts", l: "结构化 JD", icon: "layout-list" }, { v: "eval", l: "评估标准", icon: "list-checks" }]
    : [];
  const current = structuredAvailable ? tab : "desc";

  return (
    <Modal open={open} onClose={onClose} maxWidth={current === "eval" ? "max-w-4xl" : "max-w-2xl"}>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[#1B254B] flex items-center gap-2 flex-wrap">
              <I name="file-text" size={18} className="text-[#422AFB]" />
              {job.title}
              {job.dept && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F4F7FE] text-[#707EAE] font-bold">{job.dept}</span>}
              {structuredAvailable && (job.evaluationModel ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-bold">评估标准 v{job.evaluationModelVersion || 1}</span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold">未配置评估标准</span>
              ))}
            </h3>
            {current === "desc" && job.description && <p className="text-sm text-[#707EAE] mt-1.5 leading-relaxed whitespace-pre-wrap">{job.description}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1B254B] shrink-0"><I name="x" size={20} /></button>
        </div>

        {tabs.length > 0 && (
          <div className="flex gap-1 mb-4 p-1 rounded-xl bg-[#F4F7FE]">
            {tabs.map((t) => (
              <button key={t.v} type="button" onClick={() => setTab(t.v)}
                className={`flex-1 h-8 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${current === t.v ? "bg-white text-[#422AFB] shadow-sm" : "text-[#707EAE] hover:text-[#1B254B]"}`}>
                <I name={t.icon} size={12} />{t.l}
              </button>
            ))}
          </div>
        )}

        {current === "desc" && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { icon: "map-pin", label: "工作地点", value: job.location },
                { icon: "briefcase", label: "经验要求", value: job.yearsExp || job.yearsExpRange },
                { icon: "graduation-cap", label: "学历", value: job.education || job.educationRequirement },
                { icon: "dollar-sign", label: "薪资范围", value: job.salary },
              ].filter(x => x.value).map((x, i) => (
                <div key={i} className="p-3 rounded-xl bg-[#F4F7FE]">
                  <p className="text-[10px] text-[#A3AED0] uppercase tracking-wide flex items-center gap-1"><I name={x.icon} size={11} />{x.label}</p>
                  <p className="text-sm font-bold text-[#1B254B] mt-1">{x.value}</p>
                </div>
              ))}
            </div>

            <div className="max-h-[50vh] overflow-y-auto -mx-2 px-2 space-y-5">
              {Array.isArray(job.responsibilities) && job.responsibilities.length > 0 && (
                <section>
                  <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2">
                    <I name="list-checks" size={14} className="text-[#422AFB]" />
                    岗位职责
                  </h4>
                  <ul className="space-y-1.5">
                    {job.responsibilities.map((r, i) => (
                      <li key={i} className="text-xs text-[#1B254B] flex items-start gap-2 leading-relaxed">
                        <span className="w-5 h-5 rounded-md bg-[#F4F7FE] text-[#422AFB] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {Array.isArray(job.requirements) && job.requirements.length > 0 && (
                <section>
                  <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2">
                    <I name="check-circle-2" size={14} className="text-[#422AFB]" />
                    任职要求
                  </h4>
                  <ul className="space-y-1.5">
                    {job.requirements.map((r, i) => (
                      <li key={i} className="text-xs text-[#1B254B] flex items-start gap-2 leading-relaxed">
                        <I name="check" size={11} className="text-[#422AFB] mt-1 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {Array.isArray(job.nice) && job.nice.length > 0 && (
                <section>
                  <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2">
                    <I name="sparkles" size={14} className="text-[#422AFB]" />
                    加分项
                  </h4>
                  <ul className="space-y-1.5">
                    {job.nice.map((r, i) => (
                      <li key={i} className="text-xs text-[#707EAE] flex items-start gap-2 leading-relaxed">
                        <I name="plus" size={11} className="text-[#A3AED0] mt-1 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {Array.isArray(job.benefits) && job.benefits.length > 0 && (
                <section>
                  <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2">
                    <I name="gift" size={14} className="text-[#422AFB]" />
                    福利待遇
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {job.benefits.map((b, i) => (
                      <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#F4F7FE] text-[#1B254B]">{b}</span>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </>
        )}

        {current === "facts" && (
          <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2">
            {job.jdFacts ? (
              <JdFactsView facts={job.jdFacts} />
            ) : (
              <div className="py-10 text-center text-sm text-[#707EAE]">
                <I name="layout-list" size={28} className="mx-auto mb-2 text-[#A3AED0]" />
                尚未结构化
                <p className="text-[11px] text-[#A3AED0] mt-1">{canEdit ? "在「评估标准」tab 点「AI 结构化 JD」即可生成" : "由招聘官在岗位页生成"}</p>
                {canEdit && <Button size="sm" variant="ghost" className="mt-3" onClick={() => setTab("eval")} icon={<I name="wand-2" size={12} />}>去结构化</Button>}
              </div>
            )}
          </div>
        )}

        {current === "eval" && (
          <div className="max-h-[65vh] overflow-y-auto -mx-2 px-2">
            <EvaluationModelEditor job={job} canEdit={canEdit} onSaved={onSaved} />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-[#E9ECEF] flex-wrap">
          <div className="text-[11px] text-[#A3AED0]">
            {job.publishedAt && <span>发布: {job.publishedAt}</span>}
            {job.deadline && <span className="ml-3">截止: {job.deadline}</span>}
            {job.owner && <span className="ml-3">负责人: {job.owner}</span>}
          </div>
          <div className="flex gap-2 ml-auto">
            {onSwitch && (
              <Button variant="ghost" onClick={onSwitch} icon={<I name="repeat" size={12} />}>切换 JD</Button>
            )}
            <Button onClick={onClose}>关闭</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
