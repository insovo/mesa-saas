import test from "node:test";
import assert from "node:assert/strict";
import { backfillApplicant } from "./extract.js";

function applicantStore(source, year) {
  const row = { id: "student-1", candidateId: "candidate-1", name: null, school: null, major: null, degree: null, email: null, gradYear: year, gradYearSource: source, contactConfirmedAt: null };
  const candidateRow = { derived: null };
  return {
    row, candidateRow,
    prisma: {
      campusApplicant: {
        findUnique: async () => ({ ...row }),
        update: async ({ data }) => { Object.assign(row, data); },
        updateMany: async ({ where, data }) => {
          if (row.id === where.id && row.gradYearSource !== where.gradYearSource.not && row.contactConfirmedAt === where.contactConfirmedAt) Object.assign(row, data);
        },
      },
      candidate: { update: async ({ data }) => { Object.assign(candidateRow, data); } },
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
  const { row, candidateRow, prisma } = applicantStore("default", 2026);
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
  assert.equal(candidateRow.derived.graduationYear, 2025);
});

test("确认联系方式后重新解析简历也不覆盖毕业年份", async () => {
  const { row, candidateRow, prisma } = applicantStore("default", 2026);
  row.contactConfirmedAt = new Date();
  await backfillApplicant(prisma, row.id, { derived: { graduationYear: 2027 } });
  assert.equal(row.gradYear, 2026);
  assert.equal(row.gradYearSource, "default");
  assert.equal(candidateRow.derived.graduationYear, 2026);
});

test("简历没有有效毕业年份时保留默认值", async () => {
  const { row, prisma } = applicantStore("default", 2026);
  await backfillApplicant(prisma, row.id, { derived: { graduationYear: 1800 } });
  assert.equal(row.gradYear, 2026);
  assert.equal(row.gradYearSource, "default");
});
