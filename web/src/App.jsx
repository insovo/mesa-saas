import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import AuthGuard from "./components/AuthGuard.jsx";
import Layout from "./components/Layout.jsx";
import RequirePermission from "./components/RequirePermission.jsx";
import { LoadingBlock } from "./components/Primitives.jsx";
import Forbidden from "./pages/Forbidden.jsx"; // 已被 RequirePermission 静态依赖,lazy 无意义
import { setUnauthorizedHandler } from "./lib/api.js";

// 页面组件全部走 React.lazy 动态导入 → 每个页面单独 chunk,首屏只下载当前路由所需代码。
// 新增页面只需在此追加一行 lazy() 并在下方挂路由,保持与原 import 列表一致的可读性。
const Login = lazy(() => import("./pages/Login.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Candidates = lazy(() => import("./pages/Candidates.jsx"));
const CandidateDetail = lazy(() => import("./pages/CandidateDetail.jsx"));
const Jobs = lazy(() => import("./pages/Jobs.jsx"));
const Upload = lazy(() => import("./pages/Upload.jsx"));
const Staff = lazy(() => import("./pages/Staff.jsx"));
const EmployeeDetail = lazy(() => import("./pages/EmployeeDetail.jsx"));
const NewHire = lazy(() => import("./pages/NewHire.jsx"));
const Departments = lazy(() => import("./pages/Departments.jsx"));
const Interviews = lazy(() => import("./pages/Interviews.jsx"));
const Performance = lazy(() => import("./pages/Performance.jsx"));
const Reports = lazy(() => import("./pages/Reports.jsx"));
const SharedCandidate = lazy(() => import("./pages/SharedCandidate.jsx"));
const PublicUpload = lazy(() => import("./pages/PublicUpload.jsx"));
const Users = lazy(() => import("./pages/Users.jsx"));
const AuditLog = lazy(() => import("./pages/AuditLog.jsx"));
const PublicInterviewEval = lazy(() => import("./pages/PublicInterviewEval.jsx"));
const PublicPerformanceEval = lazy(() => import("./pages/PublicPerformanceEval.jsx"));
const ShareSettings = lazy(() => import("./pages/ShareSettings.jsx"));

// 路由 → 所需 pageKey 映射
const PAGE = {
  dashboard: "dashboard",
  candidates: "candidates",
  candidateDetail: "candidate.detail",
  jobs: "jobs",
  upload: "upload",
  staff: "staff",
  newhire: "newhire",
  departments: "departments",
  interviews: "interviews",
  performance: "performance",
  reports: "reports",
  users: "users",
  shareSettings: "share.settings",
};

function Page({ pageKey, element }) {
  return <RequirePermission pageKey={pageKey}>{element}</RequirePermission>;
}

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      navigate("/login", { replace: true });
    });
  }, [navigate]);

  return (
    <Suspense fallback={<LoadingBlock height="h-screen" label="页面加载中..." />}>
      <Routes>
      <Route path="/login" element={<Login />} />
      {/* 公开页 — 不在 AuthGuard 内 */}
      <Route path="/share/:token" element={<SharedCandidate />} />
      <Route path="/upload/:token" element={<PublicUpload />} />
      {/* 公开面试评价页 — 不在 AuthGuard 内,面试官通过 token 直接填写 */}
      <Route path="/interview-eval/:token" element={<PublicInterviewEval />} />
      <Route path="/performance-eval/:token" element={<PublicPerformanceEval />} />
      <Route
        element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }
      >
        <Route path="/dashboard" element={<Page pageKey={PAGE.dashboard} element={<Dashboard />} />} />
        <Route path="/candidates" element={<Page pageKey={PAGE.candidates} element={<Candidates />} />} />
        <Route path="/candidates/:id" element={<Page pageKey={PAGE.candidateDetail} element={<CandidateDetail />} />} />
        <Route path="/jobs" element={<Page pageKey={PAGE.jobs} element={<Jobs />} />} />
        <Route path="/upload" element={<Page pageKey={PAGE.upload} element={<Upload />} />} />
        <Route path="/staff" element={<Page pageKey={PAGE.staff} element={<Staff />} />} />
        <Route path="/staff/:id" element={<Page pageKey={PAGE.staff} element={<EmployeeDetail />} />} />
        <Route path="/newhire" element={<Page pageKey={PAGE.newhire} element={<NewHire />} />} />
        <Route path="/newhire/:id" element={<Page pageKey={PAGE.newhire} element={<EmployeeDetail />} />} />
        <Route path="/departments" element={<Page pageKey={PAGE.departments} element={<Departments />} />} />
        <Route path="/interviews" element={<Page pageKey={PAGE.interviews} element={<Interviews />} />} />
        <Route path="/performance" element={<Page pageKey={PAGE.performance} element={<Performance />} />} />
        <Route path="/reports" element={<Page pageKey={PAGE.reports} element={<Reports />} />} />
        <Route path="/share-settings" element={<Page pageKey={PAGE.shareSettings} element={<ShareSettings />} />} />
        <Route path="/users" element={<RequirePermission pageKey={PAGE.users} adminOnly><Users /></RequirePermission>} />
        <Route path="/audit" element={<RequirePermission adminOnly><AuditLog /></RequirePermission>} />
        <Route path="/forbidden" element={<Forbidden />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
