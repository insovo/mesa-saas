// Summary 文本反向抽取兜底 —
// Kimi parseResume 偶尔出现 summary 模板完整但 JSON 结构化字段 ([experience]/[educationHistory]/[skills]) 为空的情况,
// 尤其 .doc 旧 Word 格式简历。此时从 summary 文本按 kimi.js 的固定模板 regex 解析回填,避免 UI 显示「暂无」。
//
// summary 模板(见 kimi.js DEFAULT_PROMPT §四):
//   <姓名>
//   当前职位:...
//   ...
//
//   教育背景
//   1.
//     学校:...
//     学历:...
//     专业:...
//     时间:...
//
//   工作经历
//   1.
//     公司:...
//     职位:...
//     时间:...
//     核心职责:
//     - xxx
//     关键成果:
//     - xxx
//
//   核心能力 / 技能 / 证书 (各 bullet list)
//
//   综合评估 (key:value)

const SECTION_HEADERS = [
  "教育背景",
  "工作经历",
  "项目经历",
  "核心能力",
  "技能",
  "证书",
  "综合评估",
];

function splitSections(summary) {
  const lines = summary.split("\n");
  const sections = {};
  let current = null;
  let buffer = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (SECTION_HEADERS.includes(trimmed)) {
      if (current) sections[current] = buffer.join("\n");
      current = trimmed;
      buffer = [];
    } else if (current) {
      buffer.push(line);
    }
  }
  if (current) sections[current] = buffer.join("\n");
  return sections;
}

// 把 "1.\n  key:value\n  key2:value2\n2.\n  ..." 拆成数组 of {key:value} 对象
function parseEntries(sectionText) {
  const groups = [];
  let inEntry = false;
  let buffer = [];
  for (const line of sectionText.split("\n")) {
    if (/^\s*\d+\.\s*$/.test(line)) {
      if (inEntry) groups.push(buffer);
      inEntry = true;
      buffer = [];
    } else if (inEntry && line.trim()) {
      buffer.push(line);
    }
  }
  if (inEntry) groups.push(buffer);
  return groups.map(parseKeyValueBlock).filter((o) => Object.keys(o).length > 0);
}

function parseKeyValueBlock(lines) {
  const obj = {};
  let lastKey = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // bullet 子项 "- xxx" 归入上一个 key 数组
    const bulletMatch = line.match(/^[-•·]\s+(.+)$/);
    if (bulletMatch) {
      const val = bulletMatch[1].trim();
      if (val === "未提供" || !val) continue;
      if (lastKey) {
        if (!Array.isArray(obj[lastKey])) obj[lastKey] = obj[lastKey] ? [obj[lastKey]] : [];
        obj[lastKey].push(val);
      }
      continue;
    }
    // "key:value" 支持全/半角冒号
    const kvMatch = line.match(/^([^:：]{1,30})[:：]\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      if (val && val !== "未提供") {
        obj[key] = val;
      } else if (!val) {
        // key 后空 -> 等待 bullet 子项填进来
        obj[key] = [];
      }
      lastKey = key;
    }
  }
  // 清洗:空数组 / 空字符串删掉
  for (const k of Object.keys(obj)) {
    if (Array.isArray(obj[k]) && obj[k].length === 0) delete obj[k];
    else if (obj[k] === "") delete obj[k];
  }
  return obj;
}

function bulletListVals(text) {
  const out = [];
  for (const raw of text.split("\n")) {
    const m = raw.trim().match(/^[-•·]\s+(.+)$/);
    if (!m) continue;
    const val = m[1].trim();
    if (val && val !== "未提供") out.push(val);
  }
  return out;
}

function flatten(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function mapEducation(entries) {
  return entries
    .map((e) => ({
      period: e["时间"] || "",
      school: e["学校"] || "",
      major: e["专业"] || "",
      degree: e["学历"] || "",
    }))
    .filter((e) => e.school || e.major || e.degree);
}

function mapExperience(entries) {
  return entries
    .map((e) => {
      const summary = [
        ...flatten(e["核心职责"]),
        ...flatten(e["关键成果"]),
      ].join(" · ");
      return {
        period: e["时间"] || "",
        company: e["公司"] || "",
        title: e["职位"] || "",
        summary,
      };
    })
    .filter((e) => e.company || e.title);
}

export function extractFromSummary(summary) {
  if (typeof summary !== "string" || !summary.trim()) return {};
  const sections = splitSections(summary);
  const out = {};

  if (sections["教育背景"]) {
    const edus = mapEducation(parseEntries(sections["教育背景"]));
    if (edus.length > 0) out.educationHistory = edus;
  }
  if (sections["工作经历"]) {
    const exps = mapExperience(parseEntries(sections["工作经历"]));
    if (exps.length > 0) out.experience = exps;
  }

  // skills 优先「技能」section,其次「核心能力」兜底
  const skillBuckets = [];
  if (sections["技能"]) skillBuckets.push(...bulletListVals(sections["技能"]));
  if (skillBuckets.length === 0 && sections["核心能力"]) {
    skillBuckets.push(...bulletListVals(sections["核心能力"]));
  }
  if (skillBuckets.length > 0) {
    // 去重
    out.skills = Array.from(new Set(skillBuckets));
  }

  return out;
}
