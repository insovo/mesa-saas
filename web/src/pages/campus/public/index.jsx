// 学生端路由(AuthGuard 外):/campus/:slug/*
import { Route, Routes, Navigate } from "react-router-dom";
import { CampusProvider } from "./shell.jsx";
import CampusHome from "./CampusHome.jsx";
import CampusJobs from "./CampusJobs.jsx";
import CampusJobDetail from "./CampusJobDetail.jsx";
import CampusUpload from "./CampusUpload.jsx";
import CampusContact from "./CampusContact.jsx";
import CampusMine from "./CampusMine.jsx";
import CampusMatch from "./CampusMatch.jsx";
import CampusRecover from "./CampusRecover.jsx";

export default function CampusPublic() {
  return (
    <CampusProvider>
      <Routes>
        <Route index element={<CampusHome />} />
        <Route path="jobs" element={<CampusJobs />} />
        <Route path="jobs/:id" element={<CampusJobDetail />} />
        <Route path="upload" element={<CampusUpload />} />
        <Route path="contact" element={<CampusContact />} />
        <Route path="mine" element={<CampusMine />} />
        <Route path="match" element={<CampusMatch />} />
        <Route path="recover" element={<CampusRecover />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </CampusProvider>
  );
}
