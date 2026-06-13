import { useEffect, useMemo, useState } from "react";
import Login from "./pages/Login.jsx";
import PendingProfileDashboard from "./pages/PendingProfileDashboard.jsx";
import Shell from "./layout/Shell.jsx";
import StudentDashboard from "./pages/student/StudentDashboard.jsx";
import SupervisorDashboard from "./pages/supervisor/SupervisorDashboard.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import { flattenNav, roleNav } from "./config/navigation.jsx";

export default function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem("session") || "null"));
  const [activeSection, setActiveSection] = useState("overview");
  useEffect(() => {
    if (session) localStorage.setItem("session", JSON.stringify(session));
    else localStorage.removeItem("session");
  }, [session]);
  useEffect(() => {
    const waitingForProfileApproval = session?.user?.role !== "admin" && session?.user?.profileStatus !== "approved";
    const studentNeedsPhoto = session?.user?.role === "student" && session?.user?.profileStatus === "approved" && !session?.user?.avatarUrl;
    const supervisorNeedsProfile = session?.user?.role === "supervisor" && session?.user?.profileStatus === "approved" && !session?.user?.supervisorProfileComplete;
    if (waitingForProfileApproval || studentNeedsPhoto || supervisorNeedsProfile) {
      setActiveSection("profile");
      return;
    }
    setActiveSection(flattenNav(roleNav[session?.user?.role] || [])[0]?.id || "overview");
  }, [session?.user?.role, session?.user?.profileStatus, session?.user?.avatarUrl, session?.user?.supervisorProfileComplete]);
  const dashboard = useMemo(() => {
    if (!session) return null;
    if (session.user.role !== "admin" && session.user.profileStatus !== "approved") return <PendingProfileDashboard session={session} setSession={setSession} />;
    if (session.user.role === "student") return <StudentDashboard token={session.token} user={session.user} activeSection={activeSection} setActiveSection={setActiveSection} setSession={setSession} />;
    if (session.user.role === "supervisor") return <SupervisorDashboard token={session.token} user={session.user} activeSection={activeSection} setSession={setSession} />;
    return <AdminDashboard token={session.token} activeSection={activeSection} setActiveSection={setActiveSection} />;
  }, [session, activeSection]);
  if (!session) return <Login onLogin={setSession} />;
  return <Shell session={session} setSession={setSession} activeSection={activeSection} setActiveSection={setActiveSection}>{dashboard}</Shell>;
}
