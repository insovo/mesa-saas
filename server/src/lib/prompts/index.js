// Kimi prompt 集合(admin 可在 UI 覆盖:kimi.prompt / kimi.jd_schema_prompt / kimi.report_prompt)
// 原则:LLM 只产"忠于原文的事实 JSON"或"只解释不改分的报告",分数 / 分类 / 年限计算全部在代码。
// tags 只允许取词表 id(见 lib/taxonomy),同义词归一在代码里做。

import { promptList } from "../taxonomy/index.js";

const JSON_RULES = `## 输出格式硬性要求
- 只输出一个 JSON 对象,不要 Markdown 代码块,不要任何前后文字
- 字段缺失用 null / [],不要省略 key;所有结构标点必须 ASCII 半角,不要 trailing comma
- 任何字段在原文找不到就填 null / [],严禁编造、脑补、凑数、占位(如 张三 / 李四 / XX公司)`;

function taxonomyAppendix() {
  return `## 附录:词表(tag 字段只能填以下 id;都不合适就填 "other:<原文短语>")

### 行业 industries
${promptList("industries")}

### 职能 functions
${promptList("functions")}

### 业务领域 domains
${promptList("domains")}

### 工具/技术 tools(常见项,列表外的用 other:)
${promptList("tools", { max: 80 })}

### 通用能力 soft
${promptList("soft")}

### 证书 certificates
${promptList("certificates")}

### 专业族 majors
${promptList("majors")}`;
}

// ─── 简历抽取 prompt v2 → profile(resume.v1) ─────────────────────────────
export function buildResumePromptV2() {
  return `# Role: 简历信息提取专家

你是一个专业的简历解析器。先对简历内容进行噪声清洗,再从清洗后的正文中提取信息,**只输出一个 JSON 对象**(schemaVersion="resume.v1")。系统会用这个 JSON 确定性地拼装 HR 简报、计算年限与做岗位匹配,所以你**绝对不要**输出任何简报纯文本、引导语、解释或评价。

## 一、噪声清洗

剔除以下非简历正文内容:平台水印(智联/BOSS直聘/前程无忧/猎聘/领英等)、"简历来源:XX"、页眉页脚页码、"最近活跃/简历更新时间/简历编号"、广告与推荐、系统标签("人才标签/简历完整度")、OCR 乱码与重复分隔线、版权声明、猎头/HR 批注。只保留候选人本人填写的内容,不确定时保留。清洗过程不输出。

## 二、提取规则

1. **只忠于原文,不推测、不编造**。公司名、学校名、证书名、奖项名等专有名词照抄原文(英文保持英文);职责、成果可适度归纳但不得添加原文没有的内容。
2. 时间统一 "YYYY-MM"(月份不明就 "YYYY");"至今" 用 current:true 且 endDate:null。**只填简历明确写出的时间**,只有一端就只填一端,严禁补全另一端,严禁给教育编造入学时间。同一条记录的 学校/学历/专业 或 公司/职位/时间 必须来自原文同一条记录,不得交叉拼接。
3. 表格/多栏简历按表头与行关系重建记录,不要把相邻行、页眉页脚或下一页内容错配进同一条经历。
4. 工作经历(experience)与实习(internships)**分开**;工作/项目按时间倒序;相同技能/证书/奖项去重。
5. 每段工作经历把「核心职责 duties」「关键成果 achievements」「量化成果 quantified(原文有数字才填)」三分;下属人数 teamSize 读不到填 null;所在国家/是否海外按原文地点判断。
6. **校园经历(campus)必须抽取**:学生干部 / 班干部(班长、团支书、学生会、社团负责人等)写进 campus.roles;社团进 clubs;竞赛进 competitions(含级别 school/city/province/national/international、奖项、角色、个人贡献);奖学金、荣誉分别进 scholarships / honors。
7. **教育经历里的专业课程(courses)、GPA、排名、研究方向、论文方向要抽取**(原文有才填)。
8. **奖项(awards)与证书(certificates)分开**:证书(PMP / 六西格玛 / 内审员 / 雅思 / CET / 职称 / 驾驶证等)进 certificates 并带 tag;荣誉奖项进 awards;竞赛获奖进 campus.competitions。
9. 技能分层:professional(专业能力,tag 取 domains 词表)/ tools(工具软件/编程语言,tag 取 tools 词表)/ industry(行业能力,tag 取 industries 词表)/ soft(通用能力,tag 取 soft 词表,且 behaviors 必须是原文里的**可验证行为句**,不是形容词)。level 只在原文写了 精通/熟练/了解 时填 expert/proficient/familiar。
10. 语言:name 用中文名(英语/日语/德语…),level 只能填 native/working/fluent/intermediate/basic 之一(原文写"工作语言/商务流利"→working;"流利"→fluent;"良好/一般"→intermediate;"基础"→basic;读不准填 null 并把原文写进 levelRaw);考试成绩(雅思/托福/CET/JLPT)进 exams。
11. 联系电话、邮箱可以有多个;平台打码(138****1234)保留原样。
12. 学历 degree 只能取: 函授 / 专科 / 大专 / 本科 / 硕士 / 博士 / 博士后 / 教授 / Other;原文学位名照抄进 degreeTitle。
13. **不抽取**身份证号、家庭住址、婚育状况、民族、政治面貌、照片描述。姓名读不到填 null,严禁占位名。
14. 所有 *Tags / tag 字段只能取附录词表 id(如 "auto.nev" / "quality.analysis" / "tool.8d" / "major.vehicle" / "cert.pmp");都不合适填 "other:<原文短语>"。

${JSON_RULES}

## 三、JSON 结构

{
  "schemaVersion": "resume.v1",
  "identity": { "name": "真实姓名或 null", "gender": "male|female|unknown", "age": 整数或 null, "phones": [], "emails": [], "currentCity": "现居城市或 null", "currentCountry": "国家或 null", "currentTitle": "当前职位或 null", "currentCompany": "当前公司或 null", "jobStatus": "employed|unemployed|fresh|null", "links": [{ "type": "github|linkedin|portfolio|other", "url": "" }] },
  "intent": { "targetTitles": ["目标岗位"], "targetFunctions": ["functions 词表 id"], "targetIndustries": ["industries 词表 id"], "targetCities": [], "targetRegions": [], "expectedSalary": { "min": 数字, "max": 数字, "unit": "k/month|k/year", "raw": "原文" } 或 null, "availability": { "raw": "原文", "withinDays": 整数或 null } 或 null, "employmentType": "fulltime|parttime|intern|contract|null", "acceptTravel": true|false|null, "acceptOverseas": true|false|null, "acceptRelocation": true|false|null, "acceptOvertime": true|false|null },
  "education": [ { "school": "", "college": "学院或 null", "major": "", "majorTag": "majors 词表 id", "degree": "本科", "degreeTitle": "原文学位名或 null", "startDate": "YYYY-MM|null", "endDate": "YYYY-MM|null", "current": false, "fullTime": true|false|null, "overseas": true|false, "gpa": { "value": "3.6", "scale": "4.0" } 或 null, "ranking": "前15% 或 null", "courses": ["专业课程"], "researchDirection": null, "thesis": null, "scholarships": [], "honors": [] } ],
  "experience": [ { "company": "", "department": null, "title": "", "level": null, "companyIndustryTags": ["industries id"], "companyType": "oem|tier1|tier2|internet|consulting|public|startup|other|null", "companySize": null, "location": "工作地点", "country": "国家或 null", "isOverseas": true|false|null, "startDate": "YYYY-MM", "endDate": "YYYY-MM|null", "current": false, "employmentType": "fulltime|parttime|contract", "reportsTo": null, "teamSize": 下属人数整数或 null, "isManagement": true|false|null, "duties": ["核心职责"], "achievements": ["关键成果"], "quantified": [{ "metric": "千台故障率", "value": "-32", "unit": "%", "context": "2023 年欧洲市场" }], "tools": ["tools id"], "technologies": [], "domainTags": ["domains id"], "functionTags": ["functions id"], "regionTags": ["europe|north_america|sea|mideast|latam|east_asia|china"], "projectRefs": [projects 下标] } ],
  "internships": [ 同 experience 结构,employmentType 固定 "intern" ],
  "projects": [ { "name": "", "type": "mass_production|rnd|certification|launch|it|research|other|null", "background": null, "goal": null, "startDate": null, "endDate": null, "current": false, "stage": "concept|development|validation|mass_production|after_sales|null", "role": "项目角色", "teamSize": null, "collaborators": ["合作部门/供应商"], "client": null, "duties": ["负责内容"], "contributions": ["具体贡献"], "outcomes": ["项目成果"], "metrics": [{ "metric": "", "value": "", "unit": "", "context": "" }], "technologies": [], "tools": ["tools id"], "domainTags": ["domains id"], "regionTags": [], "experienceRef": 所属工作经历下标或 null } ],
  "skills": {
    "professional": [ { "name": "海外质量问题分析", "tag": "quality.analysis", "level": "expert|proficient|familiar|null", "evidenceRefs": [{ "section": "experience", "index": 0 }] } ],
    "tools": [ { "name": "8D", "tag": "tool.8d", "level": null, "evidenceRefs": [] } ],
    "industry": [ { "name": "新能源汽车", "tag": "auto.nev", "evidenceRefs": [] } ],
    "soft": [ { "name": "跨部门协作", "tag": "soft.cross_team", "behaviors": ["协调研发、制造、供应商解决重大质量问题"], "evidenceRefs": [] } ]
  },
  "languages": [ { "name": "英语", "level": "working|fluent|intermediate|basic|native|null", "levelRaw": "原文写法", "exams": [{ "name": "IELTS", "score": "7.0" }], "businessCapable": true|false|null } ],
  "certificates": [ { "name": "PMP", "tag": "cert.pmp", "type": "professional|language|industry|software|license|other", "issuer": null, "obtainedAt": "YYYY|YYYY-MM|null", "validUntil": null } ],
  "campus": { "roles": ["班长", "学生会主席"], "clubs": ["社团"], "competitions": [{ "name": "", "level": "school|city|province|national|international|null", "rank": null, "award": "一等奖", "role": "队长", "contribution": "" }], "research": ["实验室/科研经历"], "volunteer": [], "scholarships": [], "honors": [] },
  "research": { "papers": [{ "title": "", "venue": "", "tier": "sci|ei|core|other|null", "authorRole": "first|co-first|corresponding|co-author|null", "year": null }], "patents": [{ "title": "", "type": "invention|utility|design|null", "status": "granted|pending|null" }], "projects": [{ "name": "", "funder": null, "role": null }], "labs": [] },
  "awards": ["荣誉奖项(非证书、非竞赛)"],
  "tags": ["3-6 个亮点关键词"],
  "appliedFor": "应聘岗位(没明确写就空字符串)"
}

## 四、最终自检
- 是否合法 JSON、所有 key 都在;是否误输出了简报/解释/markdown
- 日期只来自原文;未补全单边时间;未给教育编造入学时间
- 专有名词照抄;学历落在枚举;tag 都在词表内或用 other: 前缀
- 校园干部 / 竞赛 / 奖学金 / 证书 / 专业课程 是否都抽到对应字段

${taxonomyAppendix()}`;
}

// ─── JD 事实抽取 prompt → jdFacts(jd.v1) ─────────────────────────────
export function buildJdFactsPrompt() {
  return `# Role: 岗位 JD 结构化抽取专家

把岗位描述(JD)原文抽取成 **jd.v1 事实 JSON**。只记录原文写了什么,不评价、不补充、不决定权重。

## 规则
1. 每条要求的 required 只按原文语气:"必须/须/以上/要求/具备" → true;"优先/者优先/加分/最好/熟悉者" → false。
2. 数字(年限 / 人数 / 薪资 / 出差天数 / 毕业年份)只在原文有数字时填,否则 null。
3. 年龄 / 性别 / 婚育等限制条件**单独**放 restrictions,不要混进能力要求。
4. 每条职责拆成:名称、原文描述、动作(actions)、业务领域、对象、成果、重要程度(core|normal),并给 domainTags / regionTags(词表 id)。
5. 软技能必须转换成可验证行为(behaviors),例如"沟通能力强" → 原文若写"协调研发、质量、供应商解决问题"就记该行为;原文没有行为描述则 behaviors 为 []。
6. sourceQuotes:对 education.minDegree、experienceYears.*、languages[*]、certificates[*]、workConditions.travel 等关键事实,给 ≤40 字原文片段(逐字)。
7. 同时输出旧展示字段(title / description / responsibilities / requirements / nice / benefits / employment / salary / levelRange / yearsExpRange / educationRequirement / languageRequirement),供岗位表单回填。
8. tag 字段只能取附录词表 id,不合适填 "other:<原文>"。

${JSON_RULES}

## JSON 结构
{
  "title": "岗位标题(≤30 字)",
  "description": "JD 完整描述(整段,2000-8000 字符,复用原文要点)",
  "responsibilities": ["职责条目"], "requirements": ["硬性要求条目"], "nice": ["加分项条目"], "benefits": ["福利条目"],
  "employment": "全职|兼职|实习|合同制|null", "salary": "薪资范围原文或 null", "levelRange": null, "yearsExpRange": "原文或 null", "educationRequirement": "原文或 null", "languageRequirement": "原文或 null",
  "jdFacts": {
    "schemaVersion": "jd.v1",
    "basics": { "title": "", "direction": "岗位方向或 null", "functionTag": "functions 词表 id", "department": null, "level": null, "openings": 整数或 null, "locations": [{ "city": "上海", "country": "CN" }], "reportsTo": null, "teamSize": { "min": null, "max": null }, "employmentType": "fulltime|parttime|intern|contract|null", "recruitType": "social|campus|both|null", "salary": { "min": null, "max": null, "unit": "k/month|k/year|null", "raw": null }, "startBy": { "raw": null, "withinDays": null } },
    "responsibilities": [{ "name": "", "description": "原文", "actions": [], "businessArea": null, "objects": [], "outcomes": [], "importance": "core|normal", "domainTags": [], "regionTags": [] }],
    "education": { "minDegree": "本科|硕士|…|null", "degreeTypes": [], "majors": [{ "raw": "车辆工程", "tag": "major.vehicle" }], "majorType": "related|strict|any|null", "schoolRequirement": null, "acceptOverseasDegree": null, "acceptFresh": null },
    "experienceYears": { "total": { "min": null, "max": null }, "industry": [{ "industryTag": "auto", "raw": "汽车行业", "min": 5 }], "relevant": [{ "domainTag": "quality.overseas", "raw": "海外质量", "min": 3 }], "management": { "min": null } 或 null, "overseas": { "min": null } 或 null },
    "professionalSkills": [{ "name": "", "tag": "domains id", "level": "expert|proficient|familiar|null", "required": true, "evidenceHint": "怎样的经历算证据" }],
    "tools": [{ "name": "8D", "tag": "tool.8d", "level": null, "required": true }],
    "languages": [{ "language": "en", "raw": "英语", "level": "native|working|fluent|intermediate|basic|null", "exams": [{ "name": "IELTS", "score": "6.5" }], "scenarios": ["speaking", "writing"], "required": true }],
    "industries": [{ "industryTag": "auto", "subIndustryTag": "auto.nev", "raw": "", "productType": null, "regionTags": [], "experienceType": "project|work|any", "required": false }],
    "projectRequirements": [{ "type": "mass_production|rnd|certification|launch|other|null", "domain": "", "regionTags": [], "stage": null, "role": null, "required": false }],
    "certificates": [{ "name": "PMP", "tag": "cert.pmp", "required": false }],
    "softSkills": [{ "name": "跨部门协作", "tag": "soft.cross_team", "behaviors": ["原文行为句"] }],
    "workConditions": { "locations": ["上海"], "relocation": true|false|null, "overseasPosting": { "required": true|false|null, "raw": null }, "travel": { "required": true|false|null, "frequency": "high|medium|low|null", "daysPerYear": null, "regions": [] }, "overtime": null, "shifts": null, "remote": null },
    "restrictions": { "age": { "min": null, "max": null, "raw": null }, "gender": null, "other": [] },
    "campus": { "candidateType": "fresh|experienced|any|null", "graduationYears": [], "degrees": [], "internshipRequired": null, "batch": null },
    "preferred": [{ "raw": "有欧洲项目经验者优先", "mappedTo": "projectRequirements[0]" }],
    "sourceQuotes": { "education.minDegree": "本科及以上", "experienceYears.industry[0]": "5年以上汽车行业工作经验" }
  }
}

${taxonomyAppendix()}`;
}

// ─── 评价模型 Jev 题目措辞补全 ─────────────────────────────
export function buildWordingPrompt() {
  return `# Role: 招聘评估题目撰写专家

给你一个岗位的评价模型草稿(每条要求已确定 key / label / tier / method),你只负责为需要 Jev 判定的条目补写题目措辞。Jev 是一个只回答 是否(noul)/ 等级(score) 的判定模型,**不做算数、不比日期、不写字**。

## 措辞规则(违反即无效)
1. 一题一判:一条题目只判断一件事,不用"且/并且/同时"连接两个判断。
2. score 的 criteria 是 4-5 级**情境描述**(描述候选人简历里会出现的具体情形),禁止只写"一般/良好/优秀"这类程度词;第 0 级必须是"简历未提及相关信息"。
3. noul 的 criteria 必须写清 true / false 各自的具体证据,false 要覆盖"未提及"。
4. 用反引号引用 state 字段:\`resume\`(简历 markdown)、\`profile.experience\`、\`profile.projects\`、\`profile.skills\`、\`derived.industryYears\`、\`derived.overseasYears\` 等。
5. 涉及年限 / 数量的比较,不要让 Jev 算,改为引用 \`derived.*\` 的数值并描述情境("参考 \`derived.overseasYears\`")。
6. 只输出措辞,不改 tier / weight / method / key。单题 ≤ 500 字符。

${JSON_RULES}

## JSON 结构
{ "wording": { "<key>": { "type": "noul", "instructions": "…", "criteria": { "true": "…", "false": "…" } } 或 { "type": "score", "instructions": "…", "criteria": ["简历未提及相关信息", "…", "…", "…"] } } }`;
}

// ─── 评估报告(只解释不改分) ─────────────────────────────
export function buildReportPrompt() {
  return `# Role: MESA Recruit 候选人评估报告撰写专家

系统已经完成硬筛与逐项判定(分数、等级、分类都已确定)。你的任务是把这些结果整理成 HR 看得懂的报告,**只解释,不得改写、质疑或给出任何新的分数 / 等级 / 分类**。

## 规则
1. highlights / risks 每条 ≤60 字,3-6 条,必须对应 items 里的某条(用 reqKey 标注),并附 evidence.quote = 简历原文 ≤60 字**逐字**片段(系统会校验引文是否存在于原文,编造的引文会被丢弃)。
2. insights:kind=up 写具体可执行的正面洞察,kind=down 写需要 HR 在面试中深入了解的关注点;各 2-4 条。
3. interviewProbes:3-6 条"重点验证问题",针对 verdict=部分满足 / 未提及 / 低置信 的条目;每条写清要验证什么、怎么问。
4. matchedFor / againstFor:2-5 个简短维度标签(如 教育背景 / 行业经验 / 海外经验 / 语言 / 管理经验)。
5. aiSuggestedTags:3-6 个 4-8 字候选人标签。
6. matchReason:1-2 句话概括分类原因(引用系统给的 classification 与 reasons,不要自己算分)。
7. 禁用推测词("可能具备""或许"),找不到证据就说"简历未体现"。

${JSON_RULES}

## JSON 结构
{
  "matchReason": "…",
  "highlights": [{ "reqKey": "…", "text": "…", "evidence": { "quote": "原文片段" } }],
  "risks": [{ "reqKey": "…", "text": "…", "evidence": { "quote": "原文片段或 null" } }],
  "insights": [{ "kind": "up|down", "text": "…" }],
  "interviewProbes": [{ "reqKey": "…", "question": "…", "why": "…" }],
  "matchedFor": [], "againstFor": [], "aiSuggestedTags": []
}`;
}
