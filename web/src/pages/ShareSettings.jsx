// 独立「分享设置」页:机器人自动分享候选人详情链接的默认设置(全局策略 / 我的偏好),
// 不针对单个候选人。复用候选人分享弹窗里同款的 BotShareSettings 面板。

import { BotShareSettings } from "../components/ShareDefaultsPanel.jsx";
import { I } from "../components/Primitives.jsx";

export default function ShareSettings() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-[#1B254B] flex items-center gap-2">
          <I name="share-2" size={20} className="text-[#422AFB]" />
          飞书 Bot 分享设置
        </h1>
        <p className="text-sm text-[#707EAE] mt-1">
          机器人解析完成后,自动分享候选人详情公开链接所用的默认设置。管理员设全局策略(默认 + 上限 + 模块关停),招聘官设自己的偏好(受全局约束)。
        </p>
      </div>
      <div className="bg-white rounded-card shadow-card p-6">
        <BotShareSettings open={true} />
      </div>
    </div>
  );
}
