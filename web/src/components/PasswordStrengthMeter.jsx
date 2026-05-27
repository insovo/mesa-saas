// 密码强度条 + 错误列表 — 实时镜像 lib/passwordPolicy.js validate 输出
// 用法:<PasswordStrengthMeter password={pw} context={{ email, name }} />

import { useMemo } from "react";
import { validatePassword } from "../lib/passwordPolicy.js";

const SCORE_LABEL = ["极弱", "弱", "中等", "强", "非常强"];
const SCORE_COLOR = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

export default function PasswordStrengthMeter({ password, context = {}, hideWhenEmpty = true }) {
  const result = useMemo(() => validatePassword(password, context), [password, context.email, context.name]);
  if (hideWhenEmpty && !password) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${SCORE_COLOR[result.score]}`}
            style={{ width: `${(result.score + 1) * 20}%` }}
          />
        </div>
        <span className="text-[11px] text-gray-700 w-10 text-right">{SCORE_LABEL[result.score]}</span>
      </div>
      {result.errors.length > 0 && (
        <ul className="text-[11px] text-red-500 space-y-0.5">
          {result.errors.map((e, i) => (
            <li key={i}>• {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
