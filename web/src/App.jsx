import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import AuthGuard from "./components/AuthGuard.jsx";
import Layout from "./components/Layout.jsx";
import RequirePermission from "./components/RequirePermission.jsx";
import { setUnauthorizedHandler } from "./lib/api.js";

import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Candidates from "./pages/Candidates.jsx";
import CandidateDetail from "./pages/CandidateDetail.jsx";
import Jobs from "./pages/Jobs.jsx";
import Upload from "./pages/Upload.jsx";
import Staff from "./pages/Staff.jsx";
import EmployeeDetail from "./pages/EmployeeDetail.jsx";
import NewHire from "./pages/NewHire.jsx";
import Departments from "./pages/Departments.jsx";
import Interviews from "./pages/Interviews.jsx";
import Reports from "./pages/Reports.jsx";
import SharedCandidate from "./pages/SharedCandidate.jsx";
import PublicUpload from "./pages/PublicUpload.jsx";
import Users from "./pages/Users.jsx";
import AuditLog from "./pages/AuditLog.jsx";
import Forbidden from "./pages/Forbidden.jsx";
import PublicInterviewEval from "./pages/PublicInterviewEval.jsx";

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
  reports: "reports",
  users: "users",
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
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* 公开页 — 不在 AuthGuard 内 */}
      <Route path="/share/:token" element={<SharedCandidate />} />
      <Route path="/upload/:token" element={<PublicUpload />} />
      {/* 公开面试评价页 — 不在 AuthGuard 内,面试官通过 token 直接填写 */}
      <Route path="/interview-eval/:token" element={<PublicInterviewEval />} />
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
        <Route path="/reports" element={<Page pageKey={PAGE.reports} element={<Reports />} />} />
        <Route path="/users" element={<RequirePermission pageKey={PAGE.users} adminOnly><Users /></RequirePermission>} />
        <Route path="/audit" element={<RequirePermission adminOnly><AuditLog /></RequirePermission>} />
        <Route path="/forbidden" element={<Forbidden />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
