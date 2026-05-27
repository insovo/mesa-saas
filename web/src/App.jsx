import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import AuthGuard from "./components/AuthGuard.jsx";
import Layout from "./components/Layout.jsx";
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
      {/* 公开候选人分享页 — 不在 AuthGuard 内 */}
      <Route path="/share/:token" element={<SharedCandidate />} />
      {/* 公开上传简历页 — 不在 AuthGuard 内,/upload/:token 在 /upload(登录页)前匹配 */}
      <Route path="/upload/:token" element={<PublicUpload />} />
      <Route
        element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/candidates/:id" element={<CandidateDetail />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/staff/:id" element={<EmployeeDetail />} />
        <Route path="/newhire" element={<NewHire />} />
        <Route path="/newhire/:id" element={<EmployeeDetail />} />
        <Route path="/departments" element={<Departments />} />
        <Route path="/interviews" element={<Interviews />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/users" element={<Users />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
