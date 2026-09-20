可以。按照你这个招聘 SaaS 的场景，我建议不要把 **Kimi、TextIn、JEV** 做成“三个模型分别打一次分”，而是把它们设计成三个不同职责的层：

> **TextIn = 看懂简历文件**
> **Kimi = 理解、标准化、分析简历和 JD**
> **JEV = 做候选人的最终评估/验证与分类**

这样比“把简历丢给三个 AI，然后取平均分”可靠得多。

![Image](https://images.openai.com/static-rsc-4/pLIBj-SdA1oZCSHQHZpxvU0BQAgb1zty12Ckl2efz4L_76Cj-ComrXHyLT5dY27TQrjLmZ5NbyzAUYe-oBQQBOGZtTQapwddFv9HlPsj8MmlsWDor77EyMtx_kvyDurfrE1OXjBP_eQBCP8uex83PzrXDQDOXRcup6b3CNO1OB8tuKieNdf1SmGf9M3nOvY1?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/VvyR_PIDQXhlBbkmxxaMH82ewetNG_3Nc3O_ZcErEiQsG2bT8UAgC6O94HlNH-cyiQReDZDqIp_W1gEic6HqHKurNOYZUkjaNQhZXIp7znNJEkGXGoNfPl5wvCZBonMcDj1g2rgx49r-OtIFvqscZgYRpsuvB07FkZnFjRTmZKpwNU5-sjzCihUIEBZJIHWi?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/eFvJmdj2PkM35TsLFC4xeTSkxqQWc-2HZ1q3sOzC4nSLaWf1Yqo5cwGKc7rSv6E2WemTb0sslPvqt4xu9zpJ78XqXBR-ZdyrCQbLoloMOs8YoHALAhV2UZyeecdzU6J0M9y_m21UTr3to612PWS8gqF9Z6Iq7RhLiE_zWvDcD3Zpv7_ZWYW2JfC7t-oBlhRA?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/f5CsKojCvzHujBGeWHeeFhbcG-OSjXYfsQskEoO4rdEWsLGAVOJMiZoLdUJUB862OzABzZP20FvSVpDU7ZDfDljLrUyfYMA87YCpGEv3iWWMAZ3_oRMtKPYO4jkVXYmjyPewaSJOQBVDu7Frss9eHR_D1-dJGR5LjBJHPwOdMy2qrhr0oT-g8k0tvsZ5Eqpl?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/5IeGBBO39y3l6fu_jsCB60gG88F2zCDsaKf6cmjQXUJ3IZhYmCQyjvEhYPWNQ8_VaK9_91BVHL_RukR7BPZvE_lUveFK2p9YEzpKQLzZcM8J1nfGRJY4YwNSR3BBdkr8r9njys4TBpz6PJLfJGUXG3jBSWxyA95F7JPYsptGbwm3kY8f0T4M3prgzLkOCk9z?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/-nXpifyU1bhH6yK-SkgUxz69GD9yX2js6BarenZ6x5anoPH7wHpYOgOP2MwO26cCqqaM-IbZHTACB7F1MrM2hhZv018YXdh1AStandw_W3ICfg2IphCObT3j2IRSUI4lP3q8o9rM_UFyd-lhBV1UN-evqNYJsSOKWiMBRosl7UrIwxYtQLiC06RlSdWxnNer?purpose=fullsize)

## 一、我建议的整体架构

```text
                         ┌──────────────┐
                         │   招聘岗位 JD  │
                         └──────┬───────┘
                                ↓
                         ┌──────────────┐
                         │ Kimi：JD解析  │
                         └──────┬───────┘
                                ↓
                         标准化 JD Schema
                                │
                                │
┌─────────────┐                 │
│ PDF/DOC/DOCX│                 │
│ 图片简历     │                 │
└──────┬──────┘                 │
       ↓                        │
┌──────────────┐                │
│   TextIn     │                │
│ 文档解析/OCR  │                │
└──────┬───────┘                │
       ↓                        │
  Markdown/JSON                 │
       ↓                        │
┌──────────────┐                │
│ Kimi         │                │
│ 简历结构化    │                │
└──────┬───────┘                │
       ↓                        │
Candidate Schema                │
       │                        │
       └──────────┬─────────────┘
                  ↓
          ┌───────────────┐
          │ 规则预筛       │
          │ Hard Filter   │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ JEV 深度评估   │
          │ 匹配/风险/分类  │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Kimi复核       │
          │ 解释/生成报告   │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ 最终 Candidate │
          │ Score + Class  │
          └───────────────┘
```

TextIn 的优势就在最前面的文档理解层：目前 xParse 可以把 PDF、Office、扫描件、图片等转成结构化内容，并提供 Markdown、JSON、表格、坐标等结果，比较适合作为 LLM 前面的 Document AI 层。([TextIn][1])

---

# 二、第一层：TextIn——只负责“把简历读对”

这一层**不要让它负责判断候选人好不好**。

输入：

```text
resume.pdf
resume.doc
resume.docx
resume.jpg
resume.png
```

输出：

```json
{
  "document_id": "xxx",
  "pages": 2,
  "content": "...",
  "tables": [],
  "images": [],
  "layout": "...",
  "parse_confidence": 0.98
}
```

或者直接使用 Markdown：

```markdown
# 张三

男 | 28岁 | 上海
手机：xxx
邮箱：xxx

## 教育经历
...

## 工作经历
...

## 项目经历
...
```

TextIn 官方目前明确支持 PDF、DOC/DOCX、图片等，并且会尽量恢复阅读顺序、标题、表格和复杂版面。([TextIn][2])

### 这里非常重要：

**TextIn 原始结果必须保存。**

数据库最好保存：

```text
original_file
textin_raw_result
textin_markdown
parse_version
parse_time
```

以后如果 Kimi 换模型，你不需要重新解析所有简历。

---

# 三、第二层：Kimi——把“人话简历”变成标准人才数据

这一层是整个系统的核心之一。

不要让 Kimi 输出：

> “这个候选人看起来不错。”

而是强制输出固定 Schema。

例如：

```json
{
  "basic": {
    "name": "张三",
    "gender": "男",
    "age": 28,
    "location": "上海"
  },

  "education": [
    {
      "school": "浙江大学",
      "degree": "本科",
      "major": "计算机科学与技术",
      "start": "2016",
      "end": "2020"
    }
  ],

  "experience": [
    {
      "company": "XX科技",
      "position": "产品经理",
      "start": "2020-07",
      "end": "2023-06",
      "industry": "互联网",
      "responsibilities": [
        "负责产品规划",
        "..."
      ]
    }
  ],

  "skills": [
    "产品设计",
    "项目管理",
    "SQL"
  ],

  "languages": [
    {
      "language": "英语",
      "level": "CET-6"
    }
  ],

  "management": {
    "has_management_experience": true,
    "team_size": 8
  },

  "overseas": {
    "has_overseas_experience": true,
    "regions": ["欧洲"]
  }
}
```

### 最重要的是加入“证据”

不要只有：

```json
"has_overseas_experience": true
```

最好：

```json
{
  "value": true,
  "evidence": "2023-2025 XX欧洲区域HRBP",
  "source_page": 2
}
```

这样 HR 点一下就能回到简历原文。

---

# 四、第三层：JD也让 Kimi 结构化

例如 JD：

> 海外 HRBP，5年以上工作经验，英语流利，有海外业务经验，最好有半导体行业经验……

Kimi 转成：

```json
{
  "position": "海外HRBP",

  "hard_requirements": [
    {
      "requirement": "工作年限",
      "condition": ">=5",
      "weight": 20
    },
    {
      "requirement": "英语",
      "condition": "能够作为工作语言",
      "weight": 15
    }
  ],

  "core_requirements": [
    {
      "requirement": "海外业务经验",
      "weight": 25
    },
    {
      "requirement": "HRBP经验",
      "weight": 20
    }
  ],

  "preferred_requirements": [
    {
      "requirement": "半导体行业",
      "weight": 10
    }
  ]
}
```

这样你以后就不是：

```text
简历 ←→ JD
```

而是：

```text
Candidate Schema
       ↓
      VS
JD Requirement Schema
```

---

# 五、第四层：规则引擎先做“硬筛”

这个非常重要。

**不要把所有候选人都直接交给 JEV。**

先用程序做 Hard Filter。

例如：

```text
年龄要求
学历要求
专业要求
工作年限
语言要求
工作地点
是否接受出差
是否需要某证书
是否具备某硬技能
```

例如 JD：

```text
本科以上
5年以上经验
英语工作语言
必须接受上海工作
```

那么：

```text
候选人 A
本科
7年经验
英语
上海
       ↓
PASS

候选人 B
本科
3年经验
英语
上海
       ↓
FAIL

候选人 C
大专
8年经验
英语
上海
       ↓
FAIL
```

这一步不需要昂贵的大模型。

而且**规则结果必须解释清楚**：

```json
{
  "hard_filter": "FAIL",
  "reason": [
    {
      "requirement": "本科以上",
      "candidate": "大专",
      "result": "不满足"
    }
  ]
}
```

---

# 六、第五层：JEV做“深度评估”

这里才是我建议你把 JEV 放进去的位置。

如果你这里说的 JEV 是你之前提到的、用于招聘判断/评估的 JEV，那么我建议它不要重新做 OCR，也不要重新解析原始 PDF。

它接收：

```text
JD Schema
+
Candidate Schema
+
Candidate Evidence
```

然后负责：

### ① 岗位匹配

```text
岗位要求
      ↓
候选人经历
      ↓
逐项匹配
```

例如：

| 能力项  | 要求 | 候选人  | 结果  |
| ---- | -- | ---- | --- |
| HRBP | 核心 | 6年   | 满足  |
| 海外经验 | 核心 | 3年   | 满足  |
| 英语   | 核心 | 工作语言 | 满足  |
| 半导体  | 加分 | 无    | 不满足 |
| 团队管理 | 加分 | 8人   | 满足  |

---

# 七、不要只产生一个“总分”

这是你这个 SaaS 非常值得做的地方。

不要：

> **张三：87分**

HR 会不知道 87 是怎么来的。

应该拆成：

```text
              张三

总体匹配       87
━━━━━━━━━━━━━━━━━━━━

硬性要求       100%
核心能力        91
行业匹配        72
经验匹配        94
技能匹配        88
岗位稳定性      80
```

然后：

### 结论分类

```text
A  高匹配
B  较匹配
C  待确认
D  不匹配
```

但这里的 A/B/C/D 是**系统根据预先定义规则产生的分类**，而不是让模型自由发挥。

例如：

```text
90-100 → A
75-89  → B
60-74  → C
<60    → D
```

并且：

**硬性条件不满足时，可以直接进入“不匹配/人工复核”，而不是被总分掩盖。**

---

# 八、我更建议你设计成“三种结果”

实际 HR 使用的时候，我不会只给：

> 推荐 / 不推荐

而是：

### 🟢 直接进入面试

```text
高匹配
硬性要求全部满足
核心能力匹配度高
证据充分
```

### 🟡 人工复核

```text
部分匹配

或者

简历信息不足
```

例如：

```text
英语能力：简历没有明确说明
海外经验：只有项目经历，真实性/深度需要确认
```

这种候选人非常适合进入：

> **AI面试 / HR电话确认**

### 🔴 暂不进入

```text
硬性条件明显不满足
```

---

# 九、JEV和Kimi最好形成“双模型复核”

我会这样安排：

```text
TextIn
   ↓
Kimi
   ↓
Candidate JSON
   ↓
JEV
   ↓
Evaluation JSON
   ↓
Kimi
   ↓
最终报告
```

也就是：

### Kimi第一次

负责：

> **“这个人的简历到底写了什么？”**

### JEV

负责：

> **“这个人和这个岗位到底匹不匹配？”**

### Kimi第二次

负责：

> **“把评估结果整理成人类 HR 看得懂的结果。”**

这样三个模型职责非常清晰。

---

# 十、最终数据库应该长这样

你的 Candidate 表可以有：

```text
Candidate
├── id
├── name
├── phone
├── email
├── resume_file
├── resume_text
├── parsed_profile
├── education
├── experience
├── skills
├── languages
├── location
└── created_at
```

另外建立：

```text
CandidateEvaluation
├── candidate_id
├── job_id
├── hard_filter_result
├── overall_score
├── core_score
├── experience_score
├── skill_score
├── industry_score
├── education_score
├── matched_requirements
├── missing_requirements
├── risk_flags
├── evidence
├── classification
├── model
├── prompt_version
└── evaluated_at
```

这里的：

```text
model
prompt_version
```

**一定要保存。**

否则你以后修改 Prompt，发现：

> “为什么上个月张三是 A，这个月变成 B？”

你很难追溯。

---

# 十一、整个招聘流程就会非常漂亮

比如校园招聘现场：

```text
学生扫码
   ↓
上传简历
   ↓
TextIn
   ↓
Kimi结构化
   ↓
Hard Filter
   ↓
JEV评估
   ↓
      ┌──────────────┐
      │              │
      ↓              ↓
   高匹配          待复核
      ↓              ↓
  现场面试        HR查看
```

HR 手机/电脑直接看到：

```text
张三

匹配度：92
分类：高匹配

✓ 985本科
✓ 计算机专业
✓ 2段相关实习
✓ Java / Python
✓ 有AI项目

⚠ 实习时间较短

建议：
进入技术面试
```

然后 HR 点：

> **安排面试**

系统直接进入你的面试流程。

这就把你之前说的**“校园招聘 → 快速收简历 → 自动筛选 → 现场安排面试”**串起来了。

---

# 十二、还有一个非常重要的设计：不要让 AI“偷偷改变分数”

我建议最终分数采用：

```text
最终分数
=
规则分
+
JEV评估分
+
必要的人工修正
```

而不是：

```text
Kimi：92
JEV：84
另一个模型：89
→ 平均 88.3
```

后者实际上很难解释。

更好的方式是：

```text
Hard Filter       通过
        ↓
JEV:
核心能力         91
经验匹配         94
技能匹配         87
行业匹配         72
        ↓
规则权重计算
        ↓
最终 88
```

**AI负责判断每一个维度，程序负责最终计算。**

这样你的系统才真正适合 HR 使用。

---

## 最终我会把这三个产品定位成

| 模块     | 工具          | 主要职责                      |
| ------ | ----------- | ------------------------- |
| 📄 文档层 | **TextIn**  | PDF/DOC/DOCX/图片 → 可靠文本与结构 |
| 🧠 理解层 | **Kimi**    | 简历/JD → 标准 JSON、证据提取      |
| 🎯 评估层 | **JEV**     | 候选人与岗位的深度匹配评估             |
| ⚙️ 规则层 | **你的 SaaS** | 硬条件、权重、阈值、分类              |
| 👤 决策层 | **HR**      | 查看证据、复核、面试、最终决定           |

**这比单纯做一个“AI简历评分器”强很多。**

尤其你后面还要接**AI 视频面试**的话，可以进一步变成：

```text
简历
 ↓
TextIn
 ↓
Kimi
 ↓
JEV
 ↓
候选人初筛
 ↓
AI视频面试
 ↓
ASR
 ↓
Kimi/JEV
 ↓
简历 + 面试综合评估
 ↓
HR最终决策
```

这样你的 SaaS 就不只是“简历筛选”，而是完整的 **AI Recruiting Pipeline**。

[1]: https://www.textin.com/solutions/ai-document-parse?utm_source=chatgpt.com "AI原生应用文档解析解决方案 | xParse"
[2]: https://www.textin.com/market/detail/pdf_to_markdown?utm_source=chatgpt.com "TextIn xParse - 智能文档解析 - 搭建RAG知识库 | TextIn"
