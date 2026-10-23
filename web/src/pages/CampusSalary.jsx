import { Card, Empty } from "../components/Primitives.jsx";

export default function CampusSalary() {
  return (
    <Card className="px-5 md:px-8">
      <Empty
        icon="calculator"
        title="校招定薪"
        desc="后续在此管理校招候选人的定薪信息。"
      />
    </Card>
  );
}
