import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("./majors.json", import.meta.url), "utf8");
const catalog = JSON.parse(raw);
const normalize = (value) => String(value || "").normalize("NFKC").replace(/\s/g, "");
const byName = new Map(catalog.entries.map((entry) => [normalize(entry.name), entry]));
export const MAJOR_CATALOG = { version: catalog.version, count: catalog.entries.length, groupCount: new Set(catalog.entries.map((entry) => entry.group)).size, source: catalog.source,
  hash: createHash("sha256").update(raw).update(readFileSync(new URL(import.meta.url))).digest("hex") };

const groupCategories = { 计算机类: "computer", 设计学类: "design", 电子信息类: "hot", 自动化类: "hot", 数学类: "hot" };
const listed = { 声学: "hot", 智能制造工程: "hot", 智能车辆工程: "hot", 智能交互设计: "design", 智能感知工程: "hot", 智能材料与结构: "hot", 光电信息材料与器件: "hot", 未来机器人: "hot" };
const battery = new Set(["化学", "应用化学", "能源化学", "化学工程与技术", "化学工程与工艺", "能源化学工程", "材料科学与工程", "材料与化工", "材料物理", "材料化学", "冶金工程"]);
const languages = new Set(["俄语", "阿拉伯语", "波斯语", "西班牙语", "葡萄牙语", "德语", "法语"]);
// 本科目录不能给研究生专业授予本科代码；这里保留已核对的研究生学科映射。
const graduateGroups = [
  ["计算机类", "计算机科学与技术", "计算机技术", "软件工程", "网络空间安全"],
  ["设计学类", "设计学", "艺术设计", "产品设计", "交通工具设计", "交互设计", "视觉传达设计"],
  ["电子信息类", "电子信息", "电子科学与技术", "信息与通信工程"],
  ["控制科学与工程类", "控制科学与工程", "控制工程", "控制理论与控制工程", "检测技术与自动化装置", "系统工程", "模式识别与智能系统", "导航、制导与控制", "自动化"],
  ["数学类", "数学"], ["光学工程类", "光学工程"],
];
const graduate = new Map(graduateGroups.flatMap(([group, ...names]) => names.map((name) => [name, group])));
const graduateMechanical = new Set(["机械工程", "机械制造及其自动化", "机械电子工程", "机械设计及理论", "车辆工程"]);
const mechanicalSource = { title: "南京理工大学研究生学科及硕士招生目录核对", checkedAt: "2026-10-23", urls: ["https://gs.njust.edu.cn/wbsxwsqxkwzyw/list.htm", "https://gs.njust.edu.cn/_upload/article/files/3b/87/915cebc1477da92b96e4b9a1805e/c9951c98-8cb1-4c20-b026-edfd04fd03bd.pdf"] };
const categoryFor = (group) => groupCategories[group] || (["控制科学与工程类", "光学工程类"].includes(group) ? "hot" : null);

export function resolveMajor(major, { degree, roleType, jobRelevance } = {}) {
  const name = normalize(major).replace(/^徳语$/, "德语");
  const entry = degree === "本科" ? byName.get(name === "德语" ? "徳语" : name) : null;
  const group = entry?.group || (degree !== "本科" ? graduateMechanical.has(name) ? "机械工程" : graduate.get(name) : null);
  const result = { name: entry?.name || major || null, code: entry?.code || null, discipline: entry?.discipline || null, academicGroup: group || null, category: null, status: "unresolved",
    catalogVersion: MAJOR_CATALOG.version, catalogHash: MAJOR_CATALOG.hash,
    source: entry ? { ...catalog.source, range: `C${entry.row}:G${entry.row}` } : null,
    basis: entry ? `本科目录：${entry.code} ${entry.name}属于${entry.discipline}／${entry.group}${name === "德语" ? "（原表徳语，按教育部050203德语核对字形）" : ""}` : group ? `已核对的研究生学科映射：${major}属于${group}；不套用本科专业代码` : "未匹配当前学历的已核对专业归属", possibleCategories: [], materials: [] };
  if (entry && name === "德语") result.nameSource = "https://www.moe.gov.cn/srcsite/A08/moe_1034/s3882/202604/W020260427440749576927.pdf";
  if (!entry && group === "机械工程") result.academicSource = mechanicalSource;
  const decide = (category, basis) => ({ ...result, category, status: "resolved", basis: `${result.basis}；${basis}` });
  const pending = (basis, materials) => ({ ...result, basis: `${result.basis}；${basis}`, possibleCategories: ["hot"], materials });
  if (!name) return result;
  if (name === "人工智能") return decide("computer", "沿用已确认的计算机及AI相关专业口径");
  if (group && categoryFor(group)) return decide(categoryFor(group), `政策P1常规岗特殊专业覆盖${group}`);
  if (Object.hasOwn(listed, name)) return decide(listed[name], "政策P1明确列举的特殊专业");
  if (group === "机械工程") return decide("standard", "已核对的机械工程研究生专业不在政策P1特殊范围；不凭名称中的自动化或研究方向升档");
  // 政策写“器械”，本科目录写“器件”，保留差异供HR确认，不静默改写政策。
  if (["新能源材料与器件", "新能源材料与器械"].includes(name)) return pending("政策与目录专业名称存在器械/器件差异，特殊资格待确认", ["学位/在读专业证明", "HR确认政策名称差异及适用口径"]);
  if (battery.has(name)) {
    if (roleType === "battery") return decide("hot", "政策P1电池岗列举专业，已确认录用岗位为电池岗");
    if (!roleType) return pending("仅电池岗适用特殊定薪，录用岗位尚未确认", ["录用岗位为电池岗的确认材料", "最高学历专业证明"]);
    if (entry) return decide("standard", "当前录用岗位不属于电池岗，不满足电池岗特殊定薪条件");
    return result;
  }
  if (languages.has(name)) {
    if (roleType === "language" && jobRelevance === true) return decide("hot", "政策P1所列外语专业，已确认高度对口外语岗及岗位相关性");
    if (!roleType || roleType === "language") return pending("外语特殊定薪须确认录用岗位高度对口", ["高度对口外语岗说明", "HR确认岗位相关性及专业证明"]);
    if (entry) return decide("standard", "当前岗位未按高度对口外语岗录用，不适用外语特殊定薪");
    return result;
  }
  if (entry?.group === "外国语言文学类" && (!roleType || roleType === "language")) return pending("政策外语范围含“等”，该语种未被明确列举，须确认适用范围及岗位高度对口", ["HR确认语种属于政策适用范围", "高度对口外语岗及专业证明"]);
  if (entry) return decide("standard", "该专业类及专业名称不在政策P1常规岗特殊专业范围内；指定院校/岗位规则另行核对");
  return result;
}
