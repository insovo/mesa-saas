import { extractJdFacts, isKimiConfigured } from "../kimi.js";
import { jobText } from "../jd/jobText.js";
import { draftEvaluationModel, validateEvaluationModel, EVAL_SCHEMA_VERSION } from "../evaluation/templates.js";
import { SETTING_KEYS, getEffectiveJson } from "../settings.js";
import { httpError } from "./service.js";

export async function buildCampusJobModel(job) {
  if (!(await isKimiConfigured())) throw httpError("请先配置 Kimi 服务", 424, "kimi_not_configured");
  // 编辑 JD 后旧事实可能已过期,每次生成都从当前原文重新抽取。
  const { jdFacts } = await extractJdFacts({ text: jobText(job) });
  const model = draftEvaluationModel(jdFacts, { templateId: "tpl.campus.general", defaultWeights: await getEffectiveJson(SETTING_KEYS.EVAL_DEFAULT_WEIGHTS, null) });
  const validation = validateEvaluationModel(model);
  if (!validation.ok) throw httpError("评价模型生成失败,请补充 JD 后重试", 422, "invalid_evaluation_model");
  return {
    jdFacts, jdFactsVersion: jdFacts.schemaVersion,
    evaluationModel: { ...model, schemaVersion: EVAL_SCHEMA_VERSION, source: "manual", lintWarnings: validation.warnings },
    evaluationModelVersion: { increment: 1 },
    evaluationModelUpdatedAt: new Date(), evaluationModelSource: "manual",
  };
}
