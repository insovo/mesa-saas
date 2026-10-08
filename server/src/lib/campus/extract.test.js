import test from "node:test";
import assert from "node:assert/strict";
import { backfillApplicant } from "./extract.js";

function applicantStore(source, year) {
  const row = { id: "student-1", name: null, school: null, major: null, degree: null, email: null, gradYear: year, gradYearSource: source };
  return {
    row,
    prisma: {
      campusApplicant: {
        findUnique: async () => ({ ...row }),
        update: async ({ data }) => { Object.assign(row, data); },
        updateMany: async ({ where, data }) => {
          if (row.id === where.id && row.gradYearSource !== where.gradYearSource.not) Object.assign(row, data);
        },
      },
    },
  };
}

test("简历毕业年份覆盖默认值,后续新版简历可更新抽取值", async () => {
  const { row, prisma } = applicantStore("default", 2026);
  await backfillApplicant(prisma, row.id, { derived: { graduationYear: 2027 } });
  assert.equal(row.gradYear, 2027);
  assert.equal(row.gradYearSource, "resume");
  await backfillApplicant(prisma, row.id, { derived: { graduationYear: 2028 } });
  assert.equal(row.gradYear, 2028);
});

test("学生填写的年份在异步抽取完成后仍优先", async () => {
  const { row, prisma } = applicantStore("default", 2026);
  const findUnique = prisma.campusApplicant.findUnique;
  prisma.campusApplicant.findUnique = async () => {
    const snapshot = await findUnique();
    Object.assign(row, { gradYear: 2025, gradYearSource: "manual" });
    return snapshot;
  };
  await backfillApplicant(prisma, row.id, { school: "示例大学", derived: { graduationYear: 2027 } });
  assert.equal(row.school, "示例大学");
  assert.equal(row.gradYear, 2025);
  assert.equal(row.gradYearSource, "manual");
});

test("简历没有有效毕业年份时保留默认值", async () => {
  const { row, prisma } = applicantStore("default", 2026);
  await backfillApplicant(prisma, row.id, { derived: { graduationYear: 1800 } });
  assert.equal(row.gradYear, 2026);
  assert.equal(row.gradYearSource, "default");
});
