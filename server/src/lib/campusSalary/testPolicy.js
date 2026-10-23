import { fileURLToPath } from "node:url";

// 仅由测试导入；应用未配置真实政策时必须保持待补充，不能使用测试金额。
if (!process.env.SALARY_POLICY_B64 && !process.env.SALARY_POLICY_FILE) {
  process.env.SALARY_POLICY_FILE = fileURLToPath(new URL("./fixtures/synthetic-policy.json", import.meta.url));
}
