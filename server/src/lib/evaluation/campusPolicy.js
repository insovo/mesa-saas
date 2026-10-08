export const CAMPUS_SCORE_FLOOR = 60;
export const CAMPUS_TIER_WEIGHTS = { MUST: 25, CORE: 50, PREFERRED: 25, STABILITY: 0 };

const CAMPUS_BONUS = [
  {
    key: "campus_academic", label: "学习成绩与专业学习", tier: "BONUS", method: "jev_score", source: "campus.academic", weight: 0, bonus: 6, unknownPolicy: "ignore",
    jev: {
      type: "score",
      instructions: "根据 profile.education 中的 GPA、排名、专业课程、研究方向及奖学金,评价与岗位相关的学习表现。没有成绩信息不作负面推断。",
      criteria: ["简历未提及成绩或专业学习证据", "列出相关课程或学习内容", "有较好的成绩、排名、研究成果或奖学金", "成绩突出且有多个与岗位相关的学习成果"],
    },
  },
  {
    key: "campus_achievement", label: "校园表现与竞赛获奖", tier: "BONUS", method: "jev_score", source: "campus.achievement", weight: 0, bonus: 6, unknownPolicy: "ignore",
    jev: {
      type: "score",
      instructions: "根据 profile.campus 中的竞赛、荣誉、学生干部、社团、志愿活动及 profile.projects,评价与岗位相关的校园表现。没有校园活动记录不作负面推断。",
      criteria: ["简历未提及校园表现", "有社团、志愿活动或项目参与", "有明确个人贡献、竞赛成绩或校级荣誉", "有突出获奖或持续组织领导并产生成果"],
    },
  },
];

const CAMPUS_CRITERIA = ["简历未提及相关证据", "课程、校园项目或实习中接触过相关内容", "在课程项目、竞赛、科研或实习中有具体实践", "独立完成相关任务并有可核实成果"];

export function campusEvaluationModel(model) {
  if (!model?.requirements) return model;
  const requirements = model.requirements.map((r) => {
    if (/^years_/.test(r.key)) return { ...r, tier: "INFO", method: "none", weight: 0, bonus: 0 };
    if (/^ind_/.test(r.key)) r = { ...r, tier: "PREFERRED", unknownPolicy: "ignore" };
    if (!/^(cap_|tools_|proj_|resp_|soft_|ind_)/.test(r.key) || !r.jev) return r;
    return {
      ...r,
      jev: r.jev.type === "score"
        ? { ...r.jev, instructions: `结合课程项目、科研、竞赛、校园活动与实习判断「${r.label}」的相关能力;不要求全职工作年限或长期负责经历。`, criteria: CAMPUS_CRITERIA }
        : { ...r.jev, instructions: `结合课程项目、科研、竞赛、校园活动与实习判断是否具备「${r.label}」的相关能力;不要求全职工作经历。` },
    };
  });
  const keys = new Set(requirements.map((r) => r.key));
  for (const bonus of CAMPUS_BONUS) if (!keys.has(bonus.key)) requirements.push(bonus);
  return {
    ...model,
    templateId: "tpl.campus.general",
    scoringContext: "campus",
    requirements,
    tierWeights: CAMPUS_TIER_WEIGHTS,
    bonusCap: Math.max(12, model.bonusCap || 0),
    fixedQuestions: (model.fixedQuestions || ["stability", "sufficiency", "inflation"]).filter((name) => name !== "stability"),
  };
}
