// 校招模块入口页:先挂菜单 + 路由 + pageKey 权限,具体业务(宣讲 / 网申 / 笔试等)待需求确定后再填充。

import { Card, Empty } from "../components/Primitives.jsx";

export default function Campus() {
  return (
    <Card className="p-6">
      <Empty icon="graduation-cap" title="校招模块建设中" desc="功能规划中,敬请期待" />
    </Card>
  );
}
