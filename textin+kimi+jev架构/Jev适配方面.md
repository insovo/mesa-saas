**Jev 很适合用于 HR 的简历判断，而且它更适合做“判断/评分层”，而不是直接生成一大段候选人分析。** Jev 本质上是一个 decision model：输入简历、JD 和规则，输出 **Choice / Score / Boolean + confidence**。现在 Recruitly 已经把 Jev 用于候选人与岗位匹配，对技能、经验、地点、签证、deal breaker 等分别判断并给出置信度。([Recruitly][1])

对 HR 来说，收到一批简历后，可以让 Jev 做这些事情：

| 场景           | Jev 输出示例        |
| ------------ | --------------- |
| 学历是否符合       | PASS · 99%      |
| 工作年限 ≥ 5 年   | YES · 97%       |
| 是否有整车项目经验    | YES · 91%       |
| 是否有海外项目经验    | YES · 76%       |
| 是否有 SOP/量产经验 | NO · 82%        |
| 是否来自主机厂      | YES · 93%       |
| 英语是否达到工作语言   | UNCERTAIN · 58% |
| 是否存在硬性不匹配项   | NO · 95%        |
| 岗位匹配度        | 82/100          |
| HR 查看优先级     | HIGH · 89%      |

这正符合 Jev 的能力定位：**分类、评分、布尔判断、置信度输出**，而不是开放式写作。([typesafeai.app][2])

如果放到你这种招聘 SaaS 里，我建议做成：

```text
JD ─────────→ JD结构化
                  ↓
简历 → 简历解析 → Candidate Profile
                  ↓
                Jev
          判断 / 分类 / 评分
                  ↓
      ┌───────────┼───────────┐
      ↓           ↓           ↓
    硬条件      能力匹配      风险疑点
    PASS        82/100        3项
      └───────────┼───────────┘
                  ↓
          Claude / DeepSeek
                  ↓
       候选人分析 + 面试建议
                  ↓
                 HR
                  ↓
              最终判断
```

这里最关键的是**职责拆分**：

**Jev = 判断**：是否符合条件、属于哪一类、某项能力匹配程度、是否值得优先查看。

**代码 = 计算**：例如专业能力 30%、项目经验 25%、行业经验 20%、海外经验 15%、管理能力 10%，最终加权分数由代码计算，不要让模型算。

**Claude / DeepSeek = 分析和表达**：根据 Jev 的结果解释“为什么”，提炼风险点、生成重点验证能力和面试问题。

例如 Jev 得到：

```text
专业能力：HIGH
海外经验：MEDIUM
英语能力：UNCERTAIN
项目管理：HIGH
团队管理：LOW CONFIDENCE
```

再交给 LLM，可以生成：

> 重点验证：海外项目实际参与深度、英语跨部门沟通能力、SOP 节点管理经验、跨部门冲突解决能力、团队管理规模与实际职责。

这样正好能串起你之前做的 **「JD → 岗位方向 → 重点验证能力 → 面试题 → 面试评价」**。

另外，Jev 特别适合**批量简历分流**。例如 500 份简历进来后，可以按统一规则形成：

```text
500份简历
   ↓
简历解析
   ↓
Jev
   ↓
A 优先查看   42
B 建议查看  137
C 信息不足   63
D 低匹配    258
```

产品上我更建议把它定义为 **Review Priority（HR 查看优先级）**，而不是直接“Jev 自动淘汰候选人”。AI 可以做 JD 映射、总结、差距识别和问题提示，但最终招聘判断应由 HR 负责；密歇根大学 HR 的 AI 指南也明确建议 AI 输出作为辅助，而不是直接作为淘汰依据。([Human Resources University of Michigan][3])

所以如果你准备把 **Jev 接进自己的招聘 SaaS**，它最有价值的位置其实非常明确：

> **简历解析器负责“读出来” → Jev 负责“判断” → Claude/DeepSeek 负责“解释和生成” → HR 负责“最终决策”。**

尤其当一次有几百、几千份简历时，Jev 的价值不是给每个人写一篇长报告，而是低成本地完成大量重复的结构化判断。Recruitly 目前的实际做法也很接近：**Jev 给 scorecard verdict，LLM 再负责写解释。** ([Recruitly][1])

[1]: https://recruitly.io/resources/decision-model-in-production-the-day-it-was-released?utm_source=chatgpt.com "We put a decision model in production the day it was released"
[2]: https://typesafeai.app/what-is-jev/?utm_source=chatgpt.com "What Is Jev? The Jev AI Model, Explained With Evidence | typesafeai.app"
[3]: https://hr.umich.edu/working-u-m/management-administration/hr-data-analytics-services/artificial-intelligence-human-resources/ai-hr-use-cases/resume-screening?utm_source=chatgpt.com "Resume Screening | Human Resources University of Michigan"
