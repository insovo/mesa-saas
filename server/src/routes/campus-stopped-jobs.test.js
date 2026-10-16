import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import campusPublicRoutes from "./campus-public.js";

const jobId = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
async function fixture(t) {
  const app = Fastify();
  const jobs = [{ id: jobId, title: "停止招聘岗位", campusActive: true, recruitmentType: "campus", campusKind: "stopped" }, { id: otherId, title: "招聘岗位", campusActive: true, recruitmentType: "campus", campusKind: "referral" }];
  const session = { id: "session", slug: "test", status: "live", maxApplyJobs: 3 };
  const run = { id: "run", status: "done", results: jobs.map(job=>({ jobId:job.id, title:job.title, kind:"onsite", scoreShown:80, reasons:[] })) };
  const applicant = { id:"student", candidateId:"candidate", tokenVersion:0, lastSeenAt:new Date(), session, currentResumeVersionId:"version", contactConfirmedAt:new Date(), applications:[] };
  const matches = (job, where) => Object.entries(where).every(([key, value])=>value?.in ? value.in.includes(job[key]) : value?.not !== undefined ? job[key] !== value.not : job[key] === value);
  const prisma = {
    campusSession: { findUnique:async()=>session, findFirst:async()=>session },
    campusApplicant: { findUnique:async()=>applicant },
    campusMatchRun: { findFirst:async()=>run },
    campusSessionJob: {
      findMany:async({where})=>jobs.filter(job=>matches(job,where.job)).map(job=>({kind:job.campusKind,job})),
      findUnique:async({where})=>{const job=jobs.find(job=>job.id===where.sessionId_jobId.jobId);return job?{id:job.id,kind:job.campusKind,job}:null;},
    },
    job: { findMany:async({where})=>jobs.filter(job=>matches(job,where)) },
    $executeRaw:async()=>0,
  };
  prisma.$transaction=async run=>run(prisma);
  app.decorate("prisma",prisma);
  app.decorateRequest("jwtVerify",async function(){return {aud:"campus-public",sub:applicant.id,tv:0};});
  await app.register(campusPublicRoutes,{prefix:"/api/campus/public"});
  t.after(()=>app.close());
  return {app,jobs};
}

test("学生列表及旧 JD 链接不展示停止招聘岗位，恢复后可重新浏览",async t=>{
  const {app,jobs}=await fixture(t);
  const list=await app.inject({url:"/api/campus/public/session/current/jobs?slug=test"});
  assert.deepEqual(list.json().referral.map(job=>job.id),[otherId]);
  assert.equal(list.body.includes("停止招聘岗位"),false);
  const detail=()=>app.inject({url:`/api/campus/public/jobs/${jobId}?slug=test`});
  assert.equal((await detail()).statusCode,404);
  jobs[0].campusKind="onsite";
  assert.equal((await detail()).statusCode,200);
});

test("历史智能匹配结果不再泄露已停止岗位，恢复后按当前类型展示",async t=>{
  const {app,jobs}=await fixture(t);
  const headers={authorization:"Bearer local-student"};
  for(const path of ["latest","run"]){
    const response=await app.inject({url:`/api/campus/public/match-runs/${path}`,headers});
    assert.equal(response.statusCode,200,response.body);
    assert.deepEqual(response.json().run.results.map(row=>[row.jobId,row.kind]),[[otherId,"referral"]]);
    assert.equal(response.body.includes("停止招聘岗位"),false);
  }
  jobs[0].campusKind="referral";
  const response=await app.inject({url:"/api/campus/public/match-runs/latest",headers});
  assert.equal(response.json().run.results.length,2);
});

test("停止招聘或移除后旧页面发起的新投递被后端拒绝",async t=>{
  const {app,jobs}=await fixture(t);
  for (const state of [{campusKind:"stopped",campusActive:true},{campusKind:"onsite",campusActive:false}]) {
    Object.assign(jobs[0],state);
    const response=await app.inject({method:"POST",url:"/api/campus/public/applications",headers:{authorization:"Bearer local-student"},payload:{jobId,source:"direct"}});
    assert.equal(response.statusCode,404,response.body);
    assert.equal(response.json().error,"campus_job_not_in_session");
  }
});
