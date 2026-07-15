import { Card, Empty } from "../components/Primitives.jsx";

/**
 * 绩效评价 — 占位页。
 * 侧栏入口已接线;/performance 可达。业务功能(评价周期/员工绩效表等)后续迭代。
 */
export default function Performance() {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <Empty
          icon="clipboard-check"
          title="绩效评价"
          desc="功能建设中，敬请期待。可在此管理员工绩效周期、评分与复盘。"
        />
      </Card>
    </div>
  );
}
