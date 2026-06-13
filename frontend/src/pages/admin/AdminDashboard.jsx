import { Fragment, useEffect, useState } from "react";
import { Activity, AlertTriangle, Bell, CalendarDays, Camera, CheckCircle2, Clock, Eye, FileSpreadsheet, FileText, HelpCircle, Pencil, Search, Trash2, UserPlus, Users } from "lucide-react";
import { API_URL, api } from "../../api/client.js";
import { EmptyState, MetricCard } from "../../components/common.jsx";
import AssistantAnalytics from "../../components/AssistantAnalytics.jsx";
import FeatureHub from "../../components/FeatureHub.jsx";
import { classNames, DATE_INPUT_LIMITS, DATETIME_INPUT_LIMITS, formatDate, roleLabels } from "../../utils/helpers.js";

function generateInitialPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function AdminDashboard({ token, activeSection, setActiveSection }) {
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [labHelpers, setLabHelpers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [technicalReports, setTechnicalReports] = useState([]);
  const [adminNotifications, setAdminNotifications] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [rubrics, setRubrics] = useState([]);
  const [riskDashboard, setRiskDashboard] = useState(null);
  const [terms, setTerms] = useState([]);
  const [selectedTermId, setSelectedTermId] = useState("");
  const [termCapacities, setTermCapacities] = useState([]);
  const [capacityDraft, setCapacityDraft] = useState({});
  const [surveyAnalytics, setSurveyAnalytics] = useState(null);
  const [toast, setToast] = useState({ section: "", message: "" });
  const [selectedApprovalIds, setSelectedApprovalIds] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userEditForm, setUserEditForm] = useState({ fullName: "", department: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState({ password: "", savedPassword: "" });
  const [userSearch, setUserSearch] = useState("");
  const [userForm, setUserForm] = useState({ email: "", password: generateInitialPassword(), role: "student", fullName: "", department: "هندسة المعلومات" });
  const [helperForm, setHelperForm] = useState({ fullName: "", department: "هندسة المعلومات", contact: "", languages: "", frameworks: "", bio: "" });
  const [deadlineForm, setDeadlineForm] = useState({ title: "", dueDate: "", department: "", notificationType: "academic", recipientIds: [] });
  const [defenseForm, setDefenseForm] = useState({ projectIds: [], dueDate: "" });
  const [meetingForm, setMeetingForm] = useState({ supervisorId: "", studentId: "", scheduledAt: "", notes: "" });
  const [overrideForm, setOverrideForm] = useState({ studentId: "", supervisorId: "" });
  const [evaluationForm, setEvaluationForm] = useState({ projectId: "", supervisorId: "" });
  const [surveyForm, setSurveyForm] = useState({
    title: "",
    description: "",
    audience: "student",
    questions: [{ id: "q_1", label: "", type: "text", required: true, options: [] }]
  });
  const [rubricForm, setRubricForm] = useState({
    title: "",
    criteria: [{ id: "c_1", name: "", max: 10 }]
  });
  const [termForm, setTermForm] = useState({
    id: "",
    code: "",
    label: "",
    startsAt: "",
    endsAt: "",
    registrationStartsAt: "",
    registrationEndsAt: "",
    isActive: true
  });

  async function load() {
    const [dashboard, allUsers, allStudents, allSupervisors, allLabHelpers, allProjects, allDeadlines, allMeetings, allTechnicalReports, allNotifications, allSurveys, allRubrics, allTerms, risk] = await Promise.all([
      api("/dashboards/admin", token),
      api("/admin/users", token),
      api("/admin/students", token),
      api("/admin/supervisors", token),
      api("/admin/lab-helpers", token),
      api("/admin/projects", token),
      api("/admin/deadlines", token),
      api("/admin/meetings", token),
      api("/admin/technical-reports", token),
      api("/admin/notifications", token),
      api("/surveys/admin", token),
      api("/features/rubrics", token),
      api("/admin/terms", token),
      api("/ai/risk-dashboard", token).catch(() => null)
    ]);
    setData(dashboard);
    setUsers(allUsers);
    setStudents(allStudents);
    setSupervisors(allSupervisors);
    setLabHelpers(allLabHelpers);
    setProjects(allProjects);
    setDeadlines(allDeadlines);
    setMeetings(allMeetings);
    setTechnicalReports(allTechnicalReports);
    setAdminNotifications(allNotifications);
    setSurveys(allSurveys);
    setRubrics(allRubrics);
    setTerms(allTerms);
    setRiskDashboard(risk);
    if (!selectedTermId && allTerms[0]) setSelectedTermId(String(allTerms.find((term) => term.is_active)?.id || allTerms[0].id));
  }
  useEffect(() => { load(); }, []);

  async function loadTermCapacities(termId) {
    if (!termId) {
      setTermCapacities([]);
      setCapacityDraft({});
      return;
    }
    const rows = await api(`/admin/terms/${termId}/capacities`, token);
    setTermCapacities(rows);
    setCapacityDraft(Object.fromEntries(rows.map((item) => [item.supervisor_id, item.max_students])));
  }

  useEffect(() => { loadTermCapacities(selectedTermId); }, [selectedTermId]);

  async function downloadProjectReportExcel() {
    const response = await fetch(`${API_URL}/admin/reports/projects.xls`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "capstone-projects.xls";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function createUser(event) {
    event.preventDefault();
    if (userForm.role === "lab_helper") {
      await api("/admin/lab-helpers", token, { method: "POST", body: JSON.stringify(helperForm) });
      setToast({ section: "createUser", message: "تمت إضافة مدرّس المخبر كمصدر مساعدة للطلاب" });
      setHelperForm({ fullName: "", department: "هندسة المعلومات", contact: "", languages: "", frameworks: "", bio: "" });
      await load();
      return;
    }
    await api("/admin/users", token, { method: "POST", body: JSON.stringify(userForm) });
    setToast({ section: "createUser", message: "تمت إضافة المستخدم" });
    setUserForm({ email: "", password: generateInitialPassword(), role: "student", fullName: "", department: "هندسة المعلومات" });
    await load();
  }

  async function approveProfile(id) {
    await api(`/admin/users/${id}/approve-profile`, token, { method: "PATCH" });
    setToast({ section: "users", message: "تمت الموافقة على ملف المستخدم" });
    setSelectedApprovalIds((ids) => ids.filter((item) => item !== id));
    await load();
  }

  async function approveSelectedProfiles() {
    await api("/admin/users/approve-profiles", token, {
      method: "PATCH",
      body: JSON.stringify({ ids: selectedApprovalIds })
    });
    setToast({ section: "users", message: `تمت الموافقة على ${selectedApprovalIds.length} مستخدم` });
    setSelectedApprovalIds([]);
    await load();
  }

  function openUserPage(user) {
    if (selectedUserId === user.id) {
      setSelectedUserId("");
      setUserEditForm({ fullName: "", department: "", phone: "" });
      setPasswordForm({ password: "", savedPassword: "" });
      return;
    }
    setSelectedUserId(user.id);
    setUserEditForm({ fullName: user.full_name || "", department: user.department || "", phone: user.phone || "" });
    setPasswordForm({ password: "", savedPassword: "" });
  }

  async function saveUserDetails(event) {
    event.preventDefault();
    await api(`/admin/users/${selectedUserId}`, token, {
      method: "PUT",
      body: JSON.stringify(userEditForm)
    });
    setToast({ section: "users", message: "تم تعديل بيانات المستخدم" });
    await load();
  }

  function generatePassword() {
    setPasswordForm({ password: generateInitialPassword(), savedPassword: "" });
  }

  async function saveUserPassword(event) {
    event.preventDefault();
    await api(`/admin/users/${selectedUserId}/password`, token, {
      method: "PATCH",
      body: JSON.stringify({ password: passwordForm.password })
    });
    setPasswordForm((form) => ({ ...form, savedPassword: form.password }));
    setToast({ section: "users", message: "تم تغيير كلمة السر. انسخ الكلمة الجديدة للمستخدم" });
  }

  function toggleApprovalSelection(id) {
    setSelectedApprovalIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  function toggleDeadlineRecipient(id) {
    setDeadlineForm((form) => ({
      ...form,
      recipientIds: form.recipientIds.includes(id) ? form.recipientIds.filter((item) => item !== id) : [...form.recipientIds, id]
    }));
  }

  async function deleteUser(id) {
    await api(`/admin/users/${id}`, token, { method: "DELETE" });
    setToast({ section: "users", message: "تم حذف المستخدم" });
    await load();
  }

  async function deleteLabHelper(id) {
    await api(`/admin/lab-helpers/${id}`, token, { method: "DELETE" });
    setToast({ section: "createUser", message: "تم حذف مدرّس المخبر" });
    await load();
  }

  async function createDeadline(event) {
    event.preventDefault();
    const created = await api("/admin/deadlines", token, { method: "POST", body: JSON.stringify(deadlineForm) });
    setToast({ section: "calendar", message: `تمت إضافة الموعد وإرسال ${created.notifiedCount || 0} تنبيه` });
    setDeadlineForm({ title: "", dueDate: "", department: "", notificationType: "academic", recipientIds: [] });
    await load();
  }

  function resetTermForm() {
    setTermForm({
      id: "",
      code: "",
      label: "",
      startsAt: "",
      endsAt: "",
      registrationStartsAt: "",
      registrationEndsAt: "",
      isActive: true
    });
  }

  function editTerm(term) {
    setSelectedTermId(String(term.id));
    setTermForm({
      id: term.id,
      code: term.code || "",
      label: term.label || "",
      startsAt: term.starts_at?.slice(0, 10) || "",
      endsAt: term.ends_at?.slice(0, 10) || "",
      registrationStartsAt: term.registration_starts_at?.slice(0, 10) || "",
      registrationEndsAt: term.registration_ends_at?.slice(0, 10) || "",
      isActive: Boolean(term.is_active)
    });
  }

  async function saveTerm(event) {
    event.preventDefault();
    const payload = { ...termForm };
    const saved = await api(termForm.id ? `/admin/terms/${termForm.id}` : "/admin/terms", token, {
      method: termForm.id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    setToast({ section: "terms", message: termForm.id ? "تم تعديل الفصل" : "تم إنشاء الفصل" });
    setSelectedTermId(String(saved.id));
    resetTermForm();
    await load();
  }

  async function saveSupervisorCapacity(supervisorId) {
    await api(`/admin/terms/${selectedTermId}/capacities/${supervisorId}`, token, {
      method: "PUT",
      body: JSON.stringify({ maxStudents: Number(capacityDraft[supervisorId] || 0) })
    });
    setToast({ section: "terms", message: "تم حفظ سعة المشرف لهذا الفصل" });
    await loadTermCapacities(selectedTermId);
    await load();
  }

  async function setDefenseDate(event) {
    event.preventDefault();
    if (!defenseForm.projectIds.length) {
      setToast({ section: "calendar", message: "اختر مشروعاً واحداً على الأقل" });
      return;
    }
    await Promise.all(defenseForm.projectIds.map((projectId) => (
      api(`/admin/projects/${projectId}/defense-date`, token, { method: "PATCH", body: JSON.stringify({ dueDate: defenseForm.dueDate }) })
    )));
    setToast({ section: "calendar", message: `تم تحديد موعد المناقشة وإرسال تنبيه إلى ${defenseForm.projectIds.length} طالب` });
    setDefenseForm({ projectIds: [], dueDate: "" });
    await load();
  }

  function toggleDefenseProject(projectId) {
    setDefenseForm((form) => ({
      ...form,
      projectIds: form.projectIds.includes(projectId)
        ? form.projectIds.filter((item) => item !== projectId)
        : [...form.projectIds, projectId]
    }));
  }

  async function createMeeting(event) {
    event.preventDefault();
    await api("/admin/meetings", token, { method: "POST", body: JSON.stringify(meetingForm) });
    setToast({ section: "meetings", message: "تم جدولة الاجتماع" });
    setMeetingForm({ supervisorId: "", studentId: "", scheduledAt: "", notes: "" });
    await load();
  }

  async function overrideMatch(event) {
    event.preventDefault();
    await api("/admin/matchings/override", token, { method: "POST", body: JSON.stringify({ studentId: Number(overrideForm.studentId), supervisorId: Number(overrideForm.supervisorId) }) });
    setToast({ section: "matching", message: "تم تعيين المشرف يدوياً" });
    await load();
  }

  async function assignProjectEvaluator(event) {
    event.preventDefault();
    await api(`/admin/projects/${evaluationForm.projectId}/evaluator`, token, {
      method: "PATCH",
      body: JSON.stringify({ supervisorId: Number(evaluationForm.supervisorId) })
    });
    setToast({ section: "matching", message: "تم تعيين مشرف تقييم للمشروع" });
    setEvaluationForm({ projectId: "", supervisorId: "" });
    await load();
  }

  async function updateTechnicalReport(id, status) {
    await api(`/admin/technical-reports/${id}`, token, { method: "PATCH", body: JSON.stringify({ status }) });
    setToast({ section: "technicalReports", message: "تم تحديث حالة التقرير التقني" });
    await load();
  }

  async function deleteNotification(id) {
    await api(`/admin/notifications/${id}`, token, { method: "DELETE" });
    setToast({ section: "notificationsAdmin", message: "تم حذف الإشعار من حساب المستخدم" });
    await load();
  }

  async function archiveProject(projectId) {
    await api(`/admin/projects/${projectId}/archive`, token, { method: "PATCH" });
    setToast({ section: "projects", message: "تم حفظ المشروع كمرجع مستقبلي" });
    await load();
  }

  function updateSurveyQuestion(index, patch) {
    setSurveyForm((form) => ({
      ...form,
      questions: form.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question)
    }));
  }

  function updateSurveyQuestionType(index, type) {
    const needsOptions = ["select", "radio", "checkbox"].includes(type);
    updateSurveyQuestion(index, { type, options: needsOptions ? ["", ""] : [] });
  }

  function addSurveyQuestion() {
    setSurveyForm((form) => ({
      ...form,
      questions: [...form.questions, { id: `q_${form.questions.length + 1}`, label: "", type: "text", required: false, options: [] }]
    }));
  }

  function removeSurveyQuestion(index) {
    setSurveyForm((form) => ({
      ...form,
      questions: form.questions.length === 1 ? form.questions : form.questions.filter((_, questionIndex) => questionIndex !== index)
    }));
  }

  function updateSurveyOption(questionIndex, optionIndex, value) {
    setSurveyForm((form) => ({
      ...form,
      questions: form.questions.map((question, currentQuestionIndex) => {
        if (currentQuestionIndex !== questionIndex) return question;
        const options = [...(question.options || [])];
        options[optionIndex] = value;
        return { ...question, options };
      })
    }));
  }

  function addSurveyOption(questionIndex) {
    setSurveyForm((form) => ({
      ...form,
      questions: form.questions.map((question, currentQuestionIndex) => (
        currentQuestionIndex === questionIndex
          ? { ...question, options: [...(question.options || []), ""] }
          : question
      ))
    }));
  }

  function removeSurveyOption(questionIndex, optionIndex) {
    setSurveyForm((form) => ({
      ...form,
      questions: form.questions.map((question, currentQuestionIndex) => {
        if (currentQuestionIndex !== questionIndex) return question;
        const options = (question.options || []).filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex);
        return { ...question, options: options.length ? options : [""] };
      })
    }));
  }

  async function createSurvey(event) {
    event.preventDefault();
    await api("/surveys/admin", token, { method: "POST", body: JSON.stringify(surveyForm) });
    setToast({ section: "surveys", message: "تم نشر الاستبيان وإرسال تنبيه للمستهدفين" });
    setSurveyForm({ title: "", description: "", audience: "student", questions: [{ id: "q_1", label: "", type: "text", required: true, options: [] }] });
    await load();
  }

  async function toggleSurveyActive(survey) {
    await api(`/surveys/admin/${survey.id}`, token, { method: "PATCH", body: JSON.stringify({ isActive: !survey.is_active }) });
    setToast({ section: "surveys", message: survey.is_active ? "تم إيقاف الاستبيان" : "تم تفعيل الاستبيان" });
    await load();
  }

  async function downloadSurveyResponses(surveyId) {
    const response = await fetch(`${API_URL}/surveys/admin/${surveyId}/responses.xls`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `survey-${surveyId}-responses.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function loadSurveyAnalytics(surveyId) {
    setSurveyAnalytics(await api(`/features/survey-analytics/${surveyId}`, token));
  }

  function updateRubricCriterion(index, patch) {
    setRubricForm((form) => ({
      ...form,
      criteria: form.criteria.map((criterion, criterionIndex) => criterionIndex === index ? { ...criterion, ...patch } : criterion)
    }));
  }

  async function createRubric(event) {
    event.preventDefault();
    await api("/features/rubrics", token, { method: "POST", body: JSON.stringify(rubricForm) });
    setToast({ section: "rubrics", message: "تم إنشاء نموذج التقييم" });
    setRubricForm({ title: "", criteria: [{ id: "c_1", name: "", max: 10 }] });
    await load();
  }

  if (!data) return <p>جاري التحميل...</p>;
  const totalProjects = data.projectsByStatus.reduce((sum, item) => sum + item.total, 0);
  const selectedUser = users.find((user) => user.id === selectedUserId);
  const pendingApprovalUsers = users.filter((user) => user.profile_status === "pending_approval");
  const allPendingSelected = pendingApprovalUsers.length > 0 && pendingApprovalUsers.every((user) => selectedApprovalIds.includes(user.id));
  const statusLabel = (status) => status === "approved" ? "موافق عليه" : status === "pending_approval" ? "بانتظار الموافقة" : "بانتظار التأكيد";
  const projectStatusLabel = (status) => ({
    pending_review: "بانتظار مراجعة المشرف",
    approved: "مقبول",
    revision_requested: "بحاجة إلى تعديل",
    rejected: "مرفوض",
    pending_admin_approval: "طلب قديم غير مرحّل"
  }[status] || status || "غير محدد");
  const notificationTypeLabel = (type) => ({
    profile_approved: "موافقة ملف",
    profile_approval: "طلب تأكيد ملف",
    profile_update: "طلب تعديل ملف",
    project_request: "طلب مشروع",
    review: "مراجعة مشروع",
    review_required: "مراجعة مطلوبة",
    update_required: "تحديث مطلوب",
    milestone: "مرحلة",
    overdue: "تأخير",
    deadline: "موعد",
    defense: "مناقشة",
    meeting: "اجتماع",
    meeting_request: "طلب اجتماع",
    technical_report: "مشكلة تقنية",
    archive_review: "حفظ مرجعي",
    message: "رسالة",
    survey: "استبيان"
  }[type] || type || "تنبيه");
  const filteredUsers = users.filter((user) => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return true;
    return [
      user.full_name,
      user.email,
      user.role,
      user.department,
      user.phone,
      statusLabel(user.profile_status)
    ].some((value) => String(value || "").toLowerCase().includes(term));
  });
  const pendingProfileCount = data.pendingProfiles?.length || 0;
  const pendingProjectCount = data.pendingProjects?.length || 0;
  const openTechnicalCount = data.openTechnicalReports?.length || 0;
  const studentsWithoutProjectsCount = data.studentsWithoutProjects?.length || 0;
  const overviewTasks = [
    {
      title: "ملفات تنتظر الموافقة",
      value: pendingProfileCount,
      hint: pendingProfileCount ? "راجع صفحة الحسابات وتأكيد الملفات" : "لا توجد ملفات بانتظار الموافقة",
      tone: pendingProfileCount ? "text-amber-700 bg-amber-50" : "text-nile bg-green-50",
      target: "users"
    },
    {
      title: "مشاريع بانتظار المشرف",
      value: pendingProjectCount,
      hint: pendingProjectCount ? "تأكد من تعيين المشرف المناسب ومتابعة المراجعة" : "لا توجد طلبات مشروع معلقة",
      tone: pendingProjectCount ? "text-amber-700 bg-amber-50" : "text-nile bg-green-50",
      target: "matching"
    },
    {
      title: "مشاكل تقنية مفتوحة",
      value: openTechnicalCount,
      hint: openTechnicalCount ? "تابع قسم المشاكل التقنية" : "كل المشاكل التقنية محلولة",
      tone: openTechnicalCount ? "text-red-700 bg-red-50" : "text-nile bg-green-50",
      target: "technicalReports"
    },
    {
      title: "طلاب بدون مشروع",
      value: studentsWithoutProjectsCount,
      hint: studentsWithoutProjectsCount ? "تظهر التفاصيل في تقرير المشاريع" : "كل الطلاب لديهم مشاريع حالياً",
      tone: studentsWithoutProjectsCount ? "text-amber-700 bg-amber-50" : "text-nile bg-green-50",
      target: "projects"
    }
  ];
  const overviewMetricTargets = [
    { id: "users", icon: Users, label: "الطلاب", value: data.totals.students },
    { id: "users", icon: Users, label: "المشرفون", value: data.totals.supervisors },
    { id: "projects", icon: FileText, label: "المشاريع", value: totalProjects },
    { id: "users", icon: CheckCircle2, label: "الإدارة", value: data.totals.admins }
  ];
  const projectStatusMeta = {
    pending_review: { label: "بانتظار المشرف", hint: "طلبات تحتاج قرار المشرف", icon: Clock, className: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-100" },
    approved: { label: "مقبولة", hint: "مشاريع فعالة أو مكتملة", icon: CheckCircle2, className: "bg-green-50 text-nile dark:bg-emerald-950 dark:text-emerald-100" },
    revision_requested: { label: "بحاجة تعديل", hint: "عادها المشرف للطالب", icon: Pencil, className: "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-100" },
    rejected: { label: "مرفوضة", hint: "طلبات غير مقبولة", icon: AlertTriangle, className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-100" }
  };
  const projectStatuses = ["pending_review", "approved", "revision_requested", "rejected"];
  const projectStatusTotal = (status) => data.projectsByStatus.find((item) => item.status === status)?.total || 0;
  function goToSection(sectionId) {
    if (sectionId) setActiveSection?.(sectionId);
  }
  function activityTarget(item) {
    if (item.type === "user") return "users";
    if (item.type === "project") return "projects";
    if (item.type === "technical") return "technicalReports";
    if (item.type === "deadline") return "calendar";
    return "overview";
  }
  return (
    <div className="grid gap-6">
      {toast.message && toast.section === activeSection && <div className="toast">{toast.message}</div>}
      {activeSection === "overview" && <section className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {overviewMetricTargets.map((metric) => (
            <button key={`${metric.id}-${metric.label}`} type="button" onClick={() => goToSection(metric.id)} className="text-right transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-nile/30">
              <MetricCard icon={metric.icon} label={metric.label} value={metric.value} />
            </button>
          ))}
        </div>
        <div className="panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="panel-title">مهام الإدارة العاجلة</h2>
            <AlertTriangle className="text-nile" size={22} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overviewTasks.map((task) => (
              <button key={task.title} type="button" onClick={() => goToSection(task.target)} className="rounded-lg border border-black/10 bg-white p-4 text-right transition hover:-translate-y-0.5 hover:border-nile/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-nile/30 dark:border-white/10 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{task.title}</p>
                    <p className="mt-1 text-3xl font-black text-ink dark:text-white">{task.value}</p>
                  </div>
                  <span className={classNames("rounded-lg px-3 py-1 text-xs font-extrabold", task.tone)}>{task.value ? "بحاجة متابعة" : "مكتمل"}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{task.hint}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="panel-title">الإنذار المبكر لتعثر المشاريع</h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">تصنيف تنبؤي مساعد حسب النشاط، رفع الملفات، والمراحل المنجزة.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm font-extrabold">
              <span className="rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950 dark:text-red-100">خطرة: {riskDashboard?.summary?.high || 0}</span>
              <span className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-950 dark:text-amber-100">متوسطة: {riskDashboard?.summary?.medium || 0}</span>
              <span className="rounded-lg bg-green-50 px-3 py-2 text-nile dark:bg-emerald-950 dark:text-emerald-100">آمنة: {riskDashboard?.summary?.low || 0}</span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(riskDashboard?.projects || []).slice(0, 6).map((project) => (
              <div key={`${project.student_id}-${project.project_id}`} className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-extrabold">{project.project_title || "مشروع غير محدد"}</p>
                    <p className="mt-1 text-sm text-zinc-500">{project.student_name}</p>
                  </div>
                  <span className={classNames(
                    "rounded-lg px-3 py-1 text-xs font-extrabold",
                    project.level === "high" ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-100" :
                      project.level === "medium" ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-100" :
                        "bg-green-50 text-nile dark:bg-emerald-950 dark:text-emerald-100"
                  )}>
                    {project.risk_score}%
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div className={classNames("h-full rounded-full", project.level === "high" ? "bg-red-600" : project.level === "medium" ? "bg-amber-500" : "bg-nile")} style={{ width: `${project.risk_score}%` }} />
                </div>
                <p className="mt-3 text-xs leading-6 text-zinc-600 dark:text-zinc-300">{project.recommendations?.[0] || "لا توجد توصيات حالياً."}</p>
              </div>
            ))}
            {!riskDashboard?.projects?.length && <EmptyState>لا توجد بيانات مخاطر كافية حالياً.</EmptyState>}
          </div>
        </div>
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="panel-title">حسابات تنتظر تأكيد الملف</h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">الحسابات الجديدة أو الملفات التي تحتاج موافقة الإدارة قبل فتح كامل الصلاحيات.</p>
            </div>
            <button type="button" onClick={() => goToSection("users")} className="secondary-btn mt-0">فتح إدارة الحسابات</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(data.pendingProfiles || []).map((user) => (
              <button key={user.id} type="button" onClick={() => goToSection("users")} className="rounded-lg border border-black/10 p-4 text-right transition hover:border-nile/40 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-nile/30 dark:border-white/10 dark:hover:bg-emerald-950">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-nile">{user.full_name}</p>
                    <p className="mt-1 text-sm text-zinc-500">{roleLabels[user.role] || user.role} - {user.department}</p>
                  </div>
                  <span className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-700">بانتظار الموافقة</span>
                </div>
              </button>
            ))}
            {!(data.pendingProfiles || []).length && <EmptyState>لا توجد حسابات تنتظر الموافقة.</EmptyState>}
          </div>
        </div>
        <div className="panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="panel-title">آخر النشاطات</h2>
            <Activity className="text-nile" size={22} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(data.recentActivity || []).map((item, index) => (
              <button key={`${item.type}-${item.created_at}-${index}`} type="button" onClick={() => goToSection(activityTarget(item))} className="flex items-start gap-3 rounded-lg bg-zinc-50 p-3 text-right transition hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-nile/30 dark:bg-zinc-800 dark:hover:bg-emerald-950">
                <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-nile text-white"><Clock size={17} /></span>
                <div className="min-w-0">
                  <p className="font-extrabold">{item.label}</p>
                  <p className="truncate text-sm text-zinc-600 dark:text-zinc-300">{item.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">{item.details} - {formatDate(item.created_at)}</p>
                </div>
              </button>
            ))}
            {!(data.recentActivity || []).length && <EmptyState>لا يوجد نشاط حديث بعد.</EmptyState>}
          </div>
        </div>
      </section>}
      {activeSection === "technicalReports" && <section className="panel">
        <h2 className="panel-title">المشاكل التقنية</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>الطالب</th><th>الملاحظة</th><th>الحالة</th><th>الصورة</th><th>إجراء</th></tr></thead>
            <tbody>
              {technicalReports.map((report) => (
                <tr key={report.id}>
                  <td>
                    <p className="font-bold">{report.student_name}</p>
                    <p className="text-xs text-zinc-500">{report.student_email}</p>
                  </td>
                  <td>{report.note}</td>
                  <td>{report.status}</td>
                  <td><a className="font-bold text-nile underline" href={`${API_URL.replace("/api", "")}${report.screenshot_url}`} target="_blank" rel="noreferrer">عرض اللقطة</a></td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => updateTechnicalReport(report.id, "in_progress")} className="mini-action text-amber-700">قيد المعالجة</button>
                      <button onClick={() => updateTechnicalReport(report.id, "resolved")} className="mini-action text-emerald-700">محلولة</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!technicalReports.length && <div className="mt-4"><EmptyState>لا توجد مشاكل تقنية مسجلة.</EmptyState></div>}
        </div>
      </section>}
      {activeSection === "notificationsAdmin" && <section className="panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="panel-title">إدارة التنبيهات</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">احذف أي تنبيه أُرسل بالخطأ حتى يختفي من حساب المستخدم ولا يعود للظهور.</p>
          </div>
          <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-extrabold text-nile dark:bg-emerald-950 dark:text-emerald-100">
            {adminNotifications.length} تنبيه ظاهر
          </span>
        </div>
        <div className="mt-5 grid gap-3">
          {adminNotifications.map((notification) => (
            <div key={notification.id} className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-nile text-white"><Bell size={17} /></span>
                    <div>
                      <p className="font-extrabold text-nile">{notificationTypeLabel(notification.type)}</p>
                      <p className="mt-1 text-xs font-bold text-zinc-500">{formatDate(notification.created_at)} · {notification.is_read ? "مقروء" : "غير مقروء"}</p>
                    </div>
                  </div>
                  <p className="mt-3 leading-7 text-zinc-700 dark:text-zinc-200">{notification.message}</p>
                  <p className="mt-2 text-sm text-zinc-500">
                    المستلم: <b>{notification.recipient_name}</b> · {roleLabels[notification.recipient_role] || notification.recipient_role} · {notification.recipient_email}
                  </p>
                </div>
                <button type="button" onClick={() => deleteNotification(notification.id)} className="mini-action text-red-700">
                  <Trash2 size={16} /> حذف الإشعار
                </button>
              </div>
            </div>
          ))}
          {!adminNotifications.length && <EmptyState>لا توجد تنبيهات ظاهرة حالياً.</EmptyState>}
        </div>
      </section>}
      {activeSection === "projects" && <section className="grid gap-6">
        <div className="grid gap-6">
          <div className="panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="panel-title">حالة المشاريع</h2>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">متابعة دورة حياة طلبات ومشاريع التخرج من مكان واحد.</p>
              </div>
              <button onClick={downloadProjectReportExcel} className="secondary-btn mt-0"><FileSpreadsheet size={16} /> تصدير Excel</button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {projectStatuses.map((status) => {
                const meta = projectStatusMeta[status];
                const Icon = meta.icon;
                const value = projectStatusTotal(status);
                const pct = totalProjects ? Math.round((value / totalProjects) * 100) : 0;
                return (
                  <div key={status} className="rounded-lg border border-emerald-950/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
                    <div className="flex items-center justify-between gap-3">
                      <span className={classNames("grid h-10 w-10 place-items-center rounded-lg", meta.className)}><Icon size={18} /></span>
                      <span className="text-3xl font-black">{value}</span>
                    </div>
                    <p className="mt-3 font-extrabold">{meta.label}</p>
                    <p className="mt-1 text-xs font-bold text-zinc-500">{meta.hint}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div className="h-full rounded-full bg-nile" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="panel-title">عبء المشرفين</h2>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">نسبة الطلاب المسجلين من الطاقة المتاحة.</p>
              </div>
              <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-extrabold text-nile dark:bg-emerald-950 dark:text-emerald-100">
                {data.dashboardMetrics?.avg_supervisor_load || 0}% وسطياً
              </span>
            </div>
            <div className="mt-4 grid gap-3">
              {data.workload.map((item) => {
                const capacity = Math.max(Number(item.max_students_capacity || 0), 1);
                const pct = Math.min(100, Math.round((Number(item.current_load || 0) / capacity) * 100));
                return (
                  <div key={item.full_name} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                    <div className="flex items-center justify-between gap-3 text-sm font-bold">
                      <span className="truncate">{item.full_name}</span>
                      <span className="shrink-0 text-nile">{item.current_load}/{item.max_students_capacity}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <div className={classNames("h-full rounded-full", pct >= 90 ? "bg-red-600" : pct >= 70 ? "bg-amber-500" : "bg-nile")} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {!data.workload.length && <EmptyState>لا توجد بيانات مشرفين حالياً.</EmptyState>}
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="panel-title">مراجعة الحفظ المستقبلي</h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">المشاريع التي انتهت من المناقشة ويمكن تحويلها إلى مرجع للطلاب.</p>
            </div>
            <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-extrabold text-nile dark:bg-emerald-950 dark:text-emerald-100">
              {data.archiveCandidates?.length || 0} بانتظار المراجعة
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            {data.archiveCandidates?.map((project) => (
              <div key={project.id} className="rounded-lg border border-emerald-950/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-extrabold">{project.title}</p>
                    <p className="mt-1 text-sm text-zinc-500">{project.student_name} · {project.department} · المناقشة: {formatDate(project.defense_date)}</p>
                    <p className="mt-2 leading-7 text-zinc-600 dark:text-zinc-300">{project.abstract}</p>
                  </div>
                  <button type="button" onClick={() => archiveProject(project.id)} className="mini-action text-emerald-700">
                    <CheckCircle2 size={16} /> حفظ كمرجع
                  </button>
                </div>
              </div>
            ))}
            {!data.archiveCandidates?.length && <EmptyState>لا توجد مشاريع منتهية بانتظار الحفظ حالياً.</EmptyState>}
          </div>
        </div>
        <div className="grid gap-6">
          <div className="panel">
            <div className="flex items-center justify-between gap-3">
              <h2 className="panel-title">المراجع المحفوظة</h2>
              <span className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-extrabold dark:bg-zinc-800">{projects.filter((project) => project.is_archived).length}</span>
            </div>
            <div className="mt-4 grid gap-3">
              {projects.filter((project) => project.is_archived).slice(0, 6).map((project) => (
                <div key={project.id} className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold">{project.title}</p>
                      <p className="mt-1 text-zinc-500">{project.student_name} · {project.department}</p>
                    </div>
                    <span className="rounded-lg bg-green-50 px-2 py-1 text-xs font-bold text-nile dark:bg-emerald-950">{project.archived_at ? new Date(project.archived_at).toLocaleDateString("ar") : "محفوظ"}</span>
                  </div>
                </div>
              ))}
              {!projects.some((project) => project.is_archived) && <EmptyState>لا توجد مشاريع محفوظة بعد.</EmptyState>}
            </div>
          </div>
          <div className="panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="panel-title">طلاب بدون مشروع</h2>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">للمتابعة الإدارية والتنبيه فقط.</p>
              </div>
              <span className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-100">{data.studentsWithoutProjects?.length || 0}</span>
            </div>
            <div className="mt-4 grid gap-3">
              {(data.studentsWithoutProjects || []).slice(0, 8).map((student) => (
                <div key={student.id} className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
                  <p className="font-extrabold text-nile">{student.full_name}</p>
                  <p className="mt-1 text-zinc-500">{student.student_id} · {student.department}</p>
                  <p className="mt-1 text-xs text-zinc-500">{student.email}</p>
                </div>
              ))}
              {!(data.studentsWithoutProjects || []).length && <EmptyState>كل الطلاب المسجلين لديهم مشاريع حالياً.</EmptyState>}
            </div>
          </div>
        </div>
      </section>}
      {activeSection === "createUser" && <section className="grid gap-6">
        <form onSubmit={createUser} className="panel">
          <h2 className="panel-title">إنشاء حساب جديد</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            أنشئ حساب طالب أو مشرف أو إدارة، أو أضف مدرّس مخبر كمصدر مساعدة للطلاب بدون حساب دخول.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select className="field mt-0" value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}>
              <option value="student">طالب</option>
              <option value="supervisor">مشرف</option>
              <option value="admin">إدارة</option>
              <option value="lab_helper">مدرّس مخبر - بدون دخول للنظام</option>
            </select>
            {userForm.role !== "lab_helper" ? (
              <>
                <input className="field mt-0" placeholder="الاسم الكامل" value={userForm.fullName} onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })} required />
                <input className="field mt-0" type="email" placeholder="البريد الإلكتروني" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} required />
                <input className="field mt-0" placeholder="القسم" value={userForm.department} onChange={(event) => setUserForm({ ...userForm, department: event.target.value })} required />
                <input className="field mt-0" placeholder="كلمة المرور الابتدائية" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} required />
              </>
            ) : (
              <>
                <input className="field mt-0" placeholder="اسم مدرّس المخبر" value={helperForm.fullName} onChange={(event) => setHelperForm({ ...helperForm, fullName: event.target.value })} required />
                <input className="field mt-0" placeholder="القسم" value={helperForm.department} onChange={(event) => setHelperForm({ ...helperForm, department: event.target.value })} required />
                <input className="field mt-0" placeholder="وسيلة التواصل أو رقم المكتب" value={helperForm.contact} onChange={(event) => setHelperForm({ ...helperForm, contact: event.target.value })} />
                <input className="field mt-0" placeholder="اللغات: Python, JavaScript, Java" value={helperForm.languages} onChange={(event) => setHelperForm({ ...helperForm, languages: event.target.value })} />
                <input className="field mt-0" placeholder="الأطر والأدوات: React, Flutter, Laravel" value={helperForm.frameworks} onChange={(event) => setHelperForm({ ...helperForm, frameworks: event.target.value })} />
                <textarea className="field mt-0 min-h-24 md:col-span-2" placeholder="كيف يمكنه مساعدة الطلاب بالمشاريع؟" value={helperForm.bio} onChange={(event) => setHelperForm({ ...helperForm, bio: event.target.value })} />
              </>
            )}
          </div>
          <button className="primary-btn">
            <UserPlus size={18} /> {userForm.role === "lab_helper" ? "إضافة مدرّس المخبر" : "إنشاء الحساب"}
          </button>
        </form>
        <div className="panel">
          <h2 className="panel-title">مدرّسو المخابر المساعدون</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">هؤلاء لا يملكون حسابات دخول، ويظهرون للطلاب كمراجع تقنية للمساعدة بالمشاريع.</p>
          <div className="mt-4 grid gap-3">
            {labHelpers.map((helper) => (
              <div key={helper.id} className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{helper.full_name}</p>
                    <p className="mt-1 text-sm text-zinc-500">{helper.department}</p>
                  </div>
                  <button type="button" onClick={() => deleteLabHelper(helper.id)} className="mini-action text-red-700"><Trash2 size={16} /> حذف</button>
                </div>
                <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">{helper.bio || "لا توجد ملاحظات مضافة."}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[...(helper.languages || []), ...(helper.frameworks || [])].map((item) => (
                    <span key={item} className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-nile dark:bg-emerald-950 dark:text-emerald-100">{item}</span>
                  ))}
                </div>
                {helper.contact && <p className="mt-3 text-sm font-bold text-nile">{helper.contact}</p>}
              </div>
            ))}
            {!labHelpers.length && <EmptyState>لم تتم إضافة مدرّسي مخابر بعد.</EmptyState>}
          </div>
        </div>
      </section>}

      {activeSection === "users" && <section className="grid gap-6">
        <div className="grid gap-6">
          <div className="panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="panel-title">الحسابات وتأكيد الملفات</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">ابحث عن الحسابات، افتح صفحة المستخدم، وافق على الملفات التي تم تأكيدها من أصحابها.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedApprovalIds(allPendingSelected ? [] : pendingApprovalUsers.map((user) => user.id))}
                  className="secondary-btn"
                >
                  {allPendingSelected ? "إلغاء تحديد الكل" : "تحديد المنتظرين"}
                </button>
                <button type="button" onClick={approveSelectedProfiles} disabled={!selectedApprovalIds.length} className="secondary-btn disabled:cursor-not-allowed disabled:opacity-50">
                  موافقة جماعية ({selectedApprovalIds.length})
                </button>
              </div>
            </div>
            <label className="mt-4 flex h-11 items-center gap-2 rounded-lg border border-emerald-950/15 bg-white px-3 dark:border-white/10 dark:bg-zinc-900">
              <Search size={18} className="text-nile" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="ابحث بالاسم، البريد، الدور، القسم، أو حالة الملف..."
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
              />
            </label>
            <div className="mt-4 overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>تحديد</th><th>الاسم</th><th>الدور</th><th>القسم</th><th>البريد</th><th>حالة الملف</th><th>إجراء</th></tr></thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const hasNote = Boolean(user.profile_confirmation?.notes);
                    const selectable = user.profile_status === "pending_approval";
                    return (
                      <Fragment key={user.id}>
                        <tr className={selectedUserId === user.id ? "bg-green-50/70 dark:bg-emerald-950/40" : ""}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedApprovalIds.includes(user.id)}
                              disabled={!selectable}
                              onChange={() => toggleApprovalSelection(user.id)}
                              className="h-4 w-4 accent-emerald-800 disabled:opacity-30"
                              title={selectable ? "تحديد للموافقة" : "لا يحتاج موافقة"}
                            />
                          </td>
                          <td>
                            <button type="button" onClick={() => openUserPage(user)} className="font-extrabold text-nile underline-offset-4 hover:underline">
                              {user.full_name}
                            </button>
                          </td>
                          <td>{user.role}</td>
                          <td>{user.department}</td>
                          <td>{user.email}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="font-bold">{statusLabel(user.profile_status)}</span>
                              {hasNote && <HelpCircle size={17} className="text-amber-600" title={user.profile_confirmation.notes} />}
                            </div>
                            {user.profile_submitted_at && <p className="mt-1 text-xs text-zinc-500">{new Date(user.profile_submitted_at).toLocaleString("ar")}</p>}
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => openUserPage(user)} className="mini-action text-nile"><Eye size={16} /> عرض</button>
                              {user.profile_status === "pending_approval" && <button type="button" onClick={() => approveProfile(user.id)} className="mini-action text-emerald-700"><CheckCircle2 size={16} /> موافقة</button>}
                              <button title="حذف" onClick={() => deleteUser(user.id)} className="mini-action text-red-700"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                        {selectedUserId === user.id && (
                          <tr key={`${user.id}-details`}>
                            <td colSpan="7" className="bg-green-50/50 p-0 dark:bg-emerald-950/20">
                              <div className="grid gap-4 p-4">
                              <form onSubmit={saveUserDetails} className="grid gap-4">
                                <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-white p-4 dark:bg-zinc-900">
                                  <div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-300">البريد الإلكتروني</p>
                                    <p className="font-extrabold">{user.email}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-300">حالة الملف</p>
                                    <p className="font-extrabold text-nile dark:text-emerald-100">{statusLabel(user.profile_status)}</p>
                                  </div>
                                  {user.profile_status === "pending_approval" && (
                                    <button type="button" onClick={() => approveProfile(user.id)} className="mini-action text-emerald-700">
                                      <CheckCircle2 size={16} /> موافقة على الملف
                                    </button>
                                  )}
                                </div>
                                <div className="grid gap-3 md:grid-cols-3">
                                  <label className="grid gap-2 text-sm font-bold">
                                    الاسم
                                    <input className="field mt-0" value={userEditForm.fullName} onChange={(event) => setUserEditForm({ ...userEditForm, fullName: event.target.value })} />
                                  </label>
                                  <label className="grid gap-2 text-sm font-bold">
                                    القسم
                                    <input className="field mt-0" value={userEditForm.department} onChange={(event) => setUserEditForm({ ...userEditForm, department: event.target.value })} />
                                  </label>
                                  <label className="grid gap-2 text-sm font-bold">
                                    رقم التواصل
                                    <input className="field mt-0" value={userEditForm.phone} onChange={(event) => setUserEditForm({ ...userEditForm, phone: event.target.value })} placeholder="غير محدد" />
                                  </label>
                                </div>
                                {user.profile_confirmation?.notes && (
                                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                    <p className="flex items-center gap-2 font-extrabold"><HelpCircle size={17} /> ملاحظة المستخدم</p>
                                    <p className="mt-2 leading-7">{user.profile_confirmation.notes}</p>
                                  </div>
                                )}
                                <button className="primary-btn mt-0"><Pencil size={18} /> حفظ التعديلات</button>
                              </form>
                              <form onSubmit={saveUserPassword} className="grid gap-4 rounded-lg border border-emerald-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <h3 className="font-extrabold text-nile dark:text-emerald-100">كلمة السر</h3>
                                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-300">لا يمكن كشف كلمة السر القديمة لأنها محفوظة بشكل مشفر، لكن يمكن تعيين كلمة جديدة وإظهارها هنا.</p>
                                  </div>
                                  <button type="button" onClick={generatePassword} className="secondary-btn mt-0 py-2 text-sm">
                                    توليد كلمة سر
                                  </button>
                                </div>
                                <label className="grid gap-2 text-sm font-bold">
                                  كلمة السر الجديدة
                                  <input
                                    className="field mt-0"
                                    type="text"
                                    dir="ltr"
                                    minLength="8"
                                    value={passwordForm.password}
                                    onChange={(event) => setPasswordForm({ password: event.target.value, savedPassword: "" })}
                                    placeholder="اكتب كلمة جديدة أو اضغط توليد"
                                    required
                                  />
                                </label>
                                {passwordForm.savedPassword && (
                                  <div className="rounded-lg bg-green-50 p-3 text-sm font-bold text-nile dark:bg-emerald-950 dark:text-emerald-100">
                                    كلمة السر الجديدة: <span dir="ltr" className="select-all font-black">{passwordForm.savedPassword}</span>
                                  </div>
                                )}
                                <button className="primary-btn mt-0"><CheckCircle2 size={18} /> تغيير كلمة السر</button>
                              </form>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {!filteredUsers.length && <div className="mt-4"><EmptyState>لا توجد حسابات مطابقة للبحث.</EmptyState></div>}
            </div>
          </div>

        </div>
      </section>}
      {activeSection === "meetings" && <section className="grid gap-6">
        <form onSubmit={createMeeting} className="panel">
          <h2 className="panel-title">تعيين اجتماع</h2>
          <select className="field" value={meetingForm.supervisorId} onChange={(event) => setMeetingForm({ ...meetingForm, supervisorId: event.target.value })} required>
            <option value="">المشرف</option>
            {supervisors.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
          </select>
          <select className="field" value={meetingForm.studentId} onChange={(event) => setMeetingForm({ ...meetingForm, studentId: event.target.value })} required>
            <option value="">الطالب</option>
            {students.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
          </select>
          <input className="field" type="datetime-local" value={meetingForm.scheduledAt} onChange={(event) => setMeetingForm({ ...meetingForm, scheduledAt: event.target.value })} {...DATETIME_INPUT_LIMITS} required />
          <textarea className="field min-h-20" placeholder="ملاحظات" value={meetingForm.notes} onChange={(event) => setMeetingForm({ ...meetingForm, notes: event.target.value })} />
          <button className="primary-btn"><CalendarDays size={18} /> جدولة</button>
        </form>
        <div className="panel">
          <h2 className="panel-title">الاجتماعات المجدولة</h2>
          <div className="mt-4 grid gap-3">
            {meetings.map((meeting) => <div key={meeting.id} className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800"><p className="font-bold">{meeting.student_name} مع {meeting.supervisor_name}</p><p className="text-sm text-zinc-500">{new Date(meeting.scheduled_at).toLocaleString("ar")}</p><p className="text-sm">{meeting.notes}</p></div>)}
            {!meetings.length && <EmptyState>لا توجد اجتماعات مجدولة.</EmptyState>}
          </div>
        </div>
      </section>}
      {activeSection === "calendar" && <section className="grid gap-6">
        <form onSubmit={createDeadline} className="panel">
          <h2 className="panel-title">التقويم الأكاديمي</h2>
          <select className="field" value={deadlineForm.notificationType} onChange={(event) => setDeadlineForm({ ...deadlineForm, notificationType: event.target.value })}>
            <option value="academic">موعد أكاديمي</option>
            <option value="supervisor_review">مراجعة المشرف</option>
            <option value="secretariat_review">مراجعة السكرتاريا</option>
            <option value="defense">موعد مناقشة عام</option>
          </select>
          <input className="field" placeholder="عنوان الموعد" value={deadlineForm.title} onChange={(event) => setDeadlineForm({ ...deadlineForm, title: event.target.value })} required />
          <input className="field" type="date" value={deadlineForm.dueDate} onChange={(event) => setDeadlineForm({ ...deadlineForm, dueDate: event.target.value })} {...DATE_INPUT_LIMITS} required />
          <input className="field" placeholder="القسم، اتركه فارغاً للجميع أو اختر طلاب محددين" value={deadlineForm.department} onChange={(event) => setDeadlineForm({ ...deadlineForm, department: event.target.value })} />
          <div className="mt-4 rounded-lg border border-emerald-950/10 bg-green-50/60 p-4 dark:border-white/10 dark:bg-emerald-950/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-extrabold">إرسال التنبيه للطلاب</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDeadlineForm({ ...deadlineForm, recipientIds: students.map((student) => student.id) })}
                  className="mini-action text-nile"
                >
                  تحديد كل الطلاب
                </button>
                <button
                  type="button"
                  onClick={() => setDeadlineForm({ ...deadlineForm, recipientIds: [] })}
                  className="mini-action text-zinc-600"
                >
                  حسب القسم/الجميع
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">إذا لم تحدد طلاباً، سيتم الإرسال حسب القسم، أو لكل الطلاب إذا تركت القسم فارغاً.</p>
            <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1">
              {students.map((student) => (
                <label key={student.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm dark:bg-zinc-900">
                  <span>
                    <span className="block font-bold">{student.full_name}</span>
                    <span className="block text-xs text-zinc-500">{student.student_id} - {student.supervisor_name || "بدون مشرف"}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={deadlineForm.recipientIds.includes(student.id)}
                    onChange={() => toggleDeadlineRecipient(student.id)}
                    className="h-4 w-4 accent-emerald-800"
                  />
                </label>
              ))}
            </div>
          </div>
          <button className="primary-btn"><CalendarDays size={18} /> إضافة موعد</button>
          <div className="mt-4 grid gap-2">
            {deadlines.map((item) => <div key={item.id} className="rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800"><b>{item.title}</b><span className="block text-zinc-500">{item.due_date?.slice(0, 10)} · {item.department || "كل الأقسام"}</span></div>)}
          </div>
        </form>
        <form onSubmit={setDefenseDate} className="panel">
          <h2 className="panel-title">موعد المناقشة</h2>
          <input className="field" type="date" value={defenseForm.dueDate} onChange={(event) => setDefenseForm({ ...defenseForm, dueDate: event.target.value })} {...DATE_INPUT_LIMITS} required />
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-extrabold">اختر مشاريع الطلاب</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDefenseForm((form) => ({ ...form, projectIds: projects.map((project) => project.id) }))}
                  className="secondary-btn py-2 text-xs"
                >
                  تحديد الكل
                </button>
                <button
                  type="button"
                  onClick={() => setDefenseForm((form) => ({ ...form, projectIds: [] }))}
                  className="secondary-btn py-2 text-xs"
                >
                  إلغاء التحديد
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">يمكن اختيار أكثر من مشروع لإضافة نفس موعد المناقشة لهم دفعة واحدة.</p>
            <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
              {projects.map((project) => (
                <label key={project.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm dark:bg-zinc-900">
                  <span>
                    <span className="block font-bold">{project.student_name}</span>
                    <span className="block text-xs text-zinc-500">{project.title} - {projectStatusLabel(project.status)}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={defenseForm.projectIds.includes(project.id)}
                    onChange={() => toggleDefenseProject(project.id)}
                    className="h-4 w-4 accent-emerald-800"
                  />
                </label>
              ))}
              {!projects.length && <EmptyState>لا توجد مشاريع حالياً.</EmptyState>}
            </div>
          </div>
          <button className="primary-btn" disabled={!defenseForm.projectIds.length} title={!defenseForm.projectIds.length ? "اختر مشروعاً واحداً على الأقل" : ""}>
            <CalendarDays size={18} /> حفظ موعد المناقشة ({defenseForm.projectIds.length})
          </button>
          <div className="mt-4 grid gap-2">
            {projects.filter((project) => project.defense_date).map((project) => (
              <div key={project.id} className="rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
                <b>{project.student_name}</b>
                <span className="block text-zinc-500">{project.title}</span>
                <span className="block font-bold text-nile">المناقشة: {project.defense_date?.slice(0, 10)}</span>
              </div>
            ))}
            {!projects.some((project) => project.defense_date) && <EmptyState>لم يتم تحديد مواعيد مناقشة بعد.</EmptyState>}
          </div>
        </form>
      </section>}
      {activeSection === "terms" && <section className="grid gap-6">
        <form onSubmit={saveTerm} className="panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="panel-title">إدارة الفصول وفترة تسجيل المشاريع</h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">حدد بداية ونهاية الفصل، ومتى يفتح أو يغلق تسجيل المشاريع للطلاب.</p>
            </div>
            {termForm.id && <button type="button" onClick={resetTermForm} className="secondary-btn mt-0 py-2 text-sm">إضافة فصل جديد</button>}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input className="field mt-0" placeholder="رمز الفصل: 2027-2028-1" value={termForm.code} onChange={(event) => setTermForm({ ...termForm, code: event.target.value })} required />
            <input className="field mt-0" placeholder="اسم الفصل: الفصل الأول 2027-2028" value={termForm.label} onChange={(event) => setTermForm({ ...termForm, label: event.target.value })} required />
            <label className="grid gap-2 text-sm font-bold text-zinc-600 dark:text-zinc-300">
              بداية الفصل
              <input className="field mt-0" type="date" value={termForm.startsAt} onChange={(event) => setTermForm({ ...termForm, startsAt: event.target.value })} {...DATE_INPUT_LIMITS} required />
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-600 dark:text-zinc-300">
              نهاية الفصل
              <input className="field mt-0" type="date" value={termForm.endsAt} onChange={(event) => setTermForm({ ...termForm, endsAt: event.target.value })} {...DATE_INPUT_LIMITS} required />
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-600 dark:text-zinc-300">
              فتح تسجيل المشاريع
              <input className="field mt-0" type="date" value={termForm.registrationStartsAt} onChange={(event) => setTermForm({ ...termForm, registrationStartsAt: event.target.value })} {...DATE_INPUT_LIMITS} required />
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-600 dark:text-zinc-300">
              إغلاق تسجيل المشاريع
              <input className="field mt-0" type="date" value={termForm.registrationEndsAt} onChange={(event) => setTermForm({ ...termForm, registrationEndsAt: event.target.value })} {...DATE_INPUT_LIMITS} required />
            </label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-extrabold text-nile">
            <input type="checkbox" checked={termForm.isActive} onChange={(event) => setTermForm({ ...termForm, isActive: event.target.checked })} className="h-4 w-4 accent-emerald-800" />
            تفعيل هذا الفصل كفصل العمل الحالي
          </label>
          <button className="primary-btn"><CalendarDays size={18} /> {termForm.id ? "حفظ تعديل الفصل" : "إنشاء الفصل"}</button>
        </form>

        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="panel-title">الفصول المسجلة</h2>
            <select className="field mt-0 max-w-xs" value={selectedTermId} onChange={(event) => setSelectedTermId(event.target.value)}>
              <option value="">اختر فصل لتحديد سعة المشرفين</option>
              {terms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}
            </select>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {terms.map((term) => (
              <button key={term.id} type="button" onClick={() => editTerm(term)} className={classNames("rounded-lg border p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md", selectedTermId === String(term.id) ? "border-nile bg-green-50 dark:bg-emerald-950" : "border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-nile">{term.label}</p>
                    <p className="mt-1 text-xs text-zinc-500">{term.code}</p>
                  </div>
                  <span className={classNames("rounded-lg px-3 py-1 text-xs font-extrabold", term.is_active ? "bg-green-100 text-nile" : "bg-zinc-100 text-zinc-600")}>{term.is_active ? "فعال" : "غير فعال"}</span>
                </div>
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">الفصل: {term.starts_at?.slice(0, 10)} إلى {term.ends_at?.slice(0, 10)}</p>
                <p className="mt-1 text-sm font-bold text-nile">التسجيل: {term.registration_starts_at?.slice(0, 10)} إلى {term.registration_ends_at?.slice(0, 10)}</p>
                <p className={classNames("mt-2 text-xs font-extrabold", term.registration_is_open ? "text-emerald-700" : "text-amber-700")}>{term.registration_is_open ? "تسجيل المشاريع مفتوح الآن" : "تسجيل المشاريع مغلق الآن"}</p>
              </button>
            ))}
            {!terms.length && <EmptyState>لم يتم إنشاء فصول بعد.</EmptyState>}
          </div>
        </div>

        <div className="panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="panel-title">سعة المشرفين ضمن الفصل</h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">حدد كم طالب يمكن لكل مشرف استلامه في الفصل المحدد. العدد المستخدم يُحسب من طلبات ومشاريع هذا الفصل.</p>
            </div>
            {selectedTermId && <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-extrabold text-nile dark:bg-emerald-950">{termCapacities.length} مشرف</span>}
          </div>
          {!selectedTermId && <EmptyState>اختر فصلاً أولاً حتى تظهر سعات المشرفين.</EmptyState>}
          {selectedTermId && <div className="mt-4 grid gap-3">
            {termCapacities.map((item) => {
              const load = Number(item.current_load || 0);
              const max = Math.max(Number(capacityDraft[item.supervisor_id] || 0), 0);
              const percent = max ? Math.min(100, Math.round((load / max) * 100)) : 0;
              return (
                <div key={item.supervisor_id} className="grid gap-3 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900 md:grid-cols-[1fr_11rem_auto] md:items-center">
                  <div>
                    <p className="font-extrabold text-nile">{item.full_name}</p>
                    <p className="mt-1 text-sm text-zinc-500">{item.department}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div className="h-full rounded-full bg-nile" style={{ width: `${percent}%` }} />
                    </div>
                    <p className="mt-1 text-xs font-bold text-zinc-500">مسجل حالياً: {load} / {max}</p>
                  </div>
                  <input
                    className="field mt-0"
                    type="number"
                    min="0"
                    max="100"
                    value={capacityDraft[item.supervisor_id] ?? item.max_students}
                    onChange={(event) => setCapacityDraft((draft) => ({ ...draft, [item.supervisor_id]: event.target.value }))}
                    aria-label={`سعة ${item.full_name}`}
                  />
                  <button type="button" onClick={() => saveSupervisorCapacity(item.supervisor_id)} className="primary-btn mt-0 md:w-36">
                    <CheckCircle2 size={18} /> حفظ
                  </button>
                </div>
              );
            })}
            {!termCapacities.length && <EmptyState>لا يوجد مشرفون حالياً.</EmptyState>}
          </div>}
        </div>
      </section>}
      {activeSection === "surveys" && <section className="grid gap-6">
        <form onSubmit={createSurvey} className="panel">
          <h2 className="panel-title">إنشاء استبيان جديد</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">صمم نموذجاً شبيهاً   وحدد هل سيظهر للطلاب أو للمشرفين أو للجميع.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input className="field mt-0" placeholder="عنوان الاستبيان" value={surveyForm.title} onChange={(event) => setSurveyForm({ ...surveyForm, title: event.target.value })} required />
            <select className="field mt-0" value={surveyForm.audience} onChange={(event) => setSurveyForm({ ...surveyForm, audience: event.target.value })}>
              <option value="student">الطلاب فقط</option>
              <option value="supervisor">المشرفون فقط</option>
              <option value="all">الطلاب والمشرفون</option>
            </select>
            <textarea className="field mt-0 min-h-24 md:col-span-2" placeholder="وصف قصير يظهر للمستخدمين" value={surveyForm.description} onChange={(event) => setSurveyForm({ ...surveyForm, description: event.target.value })} />
          </div>
          <div className="mt-5 grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-extrabold text-nile">أسئلة الاستبيان</h3>
              <button type="button" onClick={addSurveyQuestion} className="secondary-btn py-2 text-sm"><UserPlus size={16} /> إضافة سؤال</button>
            </div>
            {surveyForm.questions.map((question, index) => {
              const needsOptions = ["select", "radio", "checkbox"].includes(question.type);
              return (
                <div key={question.id} className="rounded-lg border border-black/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
                  <div className="grid gap-3 md:grid-cols-[1fr_11rem_8rem_auto]">
                    <input className="field mt-0" placeholder={`نص السؤال ${index + 1}`} value={question.label} onChange={(event) => updateSurveyQuestion(index, { label: event.target.value })} required />
                    <select className="field mt-0" value={question.type} onChange={(event) => updateSurveyQuestionType(index, event.target.value)}>
                      <option value="text">نص قصير</option>
                      <option value="textarea">نص طويل</option>
                      <option value="select">قائمة</option>
                      <option value="radio">اختيار واحد</option>
                      <option value="checkbox">عدة اختيارات</option>
                    </select>
                    <label className="flex items-center gap-2 rounded-lg bg-white px-3 text-sm font-bold dark:bg-zinc-900">
                      <input type="checkbox" checked={question.required} onChange={(event) => updateSurveyQuestion(index, { required: event.target.checked })} className="h-4 w-4 accent-emerald-800" />
                      مطلوب
                    </label>
                    <button type="button" onClick={() => removeSurveyQuestion(index)} className="mini-action text-red-700"><Trash2 size={16} /> حذف</button>
                  </div>
                  {needsOptions && (
                    <div className="mt-3 rounded-lg bg-white p-3 dark:bg-zinc-900">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-extrabold text-nile">خيارات الإجابة</p>
                        <button type="button" onClick={() => addSurveyOption(index)} className="secondary-btn py-2 text-xs">
                          إضافة خيار
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {(question.options || []).map((option, optionIndex) => (
                          <div key={`${question.id}-option-${optionIndex}`} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                            <input
                              className="field mt-0"
                              placeholder={`الخيار ${optionIndex + 1}`}
                              value={option}
                              onChange={(event) => updateSurveyOption(index, optionIndex, event.target.value)}
                              required
                            />
                            <button type="button" onClick={() => removeSurveyOption(index, optionIndex)} className="mini-action text-red-700">
                              <Trash2 size={16} /> حذف
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button className="primary-btn"><FileText size={18} /> نشر الاستبيان</button>
        </form>
        <div className="panel">
          <h2 className="panel-title">الاستبيانات المنشورة</h2>
          <div className="mt-4 grid gap-3">
            {surveys.map((survey) => (
              <div key={survey.id} className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-nile">{survey.title}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {survey.audience === "student" ? "للطلاب" : survey.audience === "supervisor" ? "للمشرفين" : "للطلاب والمشرفين"} - {survey.response_count || 0} إجابة
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => downloadSurveyResponses(survey.id)} className="secondary-btn py-2 text-sm"><FileSpreadsheet size={16} /> Excel</button>
                    <button type="button" onClick={() => loadSurveyAnalytics(survey.id)} className="secondary-btn py-2 text-sm"><Activity size={16} /> تحليل</button>
                    <button type="button" onClick={() => toggleSurveyActive(survey)} className={classNames("secondary-btn py-2 text-sm", survey.is_active ? "text-red-700" : "text-emerald-700")}>
                      {survey.is_active ? "إيقاف" : "تفعيل"}
                    </button>
                  </div>
                </div>
                {survey.description && <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">{survey.description}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(survey.questions || []).map((question) => (
                    <span key={question.id} className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-nile dark:bg-emerald-950 dark:text-emerald-100">{question.label}</span>
                  ))}
                </div>
              </div>
            ))}
            {!surveys.length && <EmptyState>لم يتم إنشاء استبيانات بعد.</EmptyState>}
          </div>
          {surveyAnalytics && (
            <div className="mt-6 rounded-lg bg-green-50 p-4 dark:bg-emerald-950/40">
              <h3 className="font-extrabold text-nile">تحليل: {surveyAnalytics.survey.title}</h3>
              <p className="mt-1 text-sm font-bold text-zinc-600 dark:text-zinc-300">عدد الإجابات: {surveyAnalytics.totalResponses}</p>
              <div className="mt-4 grid gap-3">
                {surveyAnalytics.analytics.map((item) => (
                  <div key={item.question} className="rounded-lg bg-white p-3 dark:bg-zinc-900">
                    <p className="font-extrabold">{item.question}</p>
                    <div className="mt-2 grid gap-2">
                      {Object.entries(item.counts).map(([answer, total]) => (
                        <div key={answer} className="flex justify-between text-sm"><span>{answer}</span><b>{total}</b></div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>}
      {activeSection === "ideas" && <FeatureHub token={token} role="admin" showToast={(section, message) => setToast({ section, message })} section="ideas" mode="ideas" />}
      {activeSection === "library" && <FeatureHub token={token} role="admin" showToast={(section, message) => setToast({ section, message })} section="library" mode="library" />}
      {activeSection === "assistantAnalytics" && <AssistantAnalytics token={token} />}
      {activeSection === "rubrics" && <section className="grid gap-6">
        <form onSubmit={createRubric} className="panel">
          <h2 className="panel-title">إنشاء Rubric تقييم</h2>
          <input className="field" placeholder="عنوان نموذج التقييم" value={rubricForm.title} onChange={(event) => setRubricForm({ ...rubricForm, title: event.target.value })} required />
          <div className="mt-4 grid gap-3">
            {rubricForm.criteria.map((criterion, index) => (
              <div key={criterion.id} className="grid gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800 md:grid-cols-[1fr_10rem_auto]">
                <input className="field mt-0" placeholder="اسم المعيار: الفكرة، التنفيذ، التوثيق..." value={criterion.name} onChange={(event) => updateRubricCriterion(index, { name: event.target.value })} required />
                <input className="field mt-0" type="number" min="1" max="100" value={criterion.max} onChange={(event) => updateRubricCriterion(index, { max: Number(event.target.value) })} required />
                <button type="button" onClick={() => setRubricForm((form) => ({ ...form, criteria: form.criteria.filter((_, i) => i !== index) }))} className="mini-action text-red-700"><Trash2 size={16} /> حذف</button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setRubricForm((form) => ({ ...form, criteria: [...form.criteria, { id: `c_${form.criteria.length + 1}`, name: "", max: 10 }] }))} className="secondary-btn">إضافة معيار</button>
            <button className="primary-btn mt-0"><CheckCircle2 size={18} /> حفظ النموذج</button>
          </div>
        </form>
        <div className="panel">
          <h2 className="panel-title">نماذج التقييم الحالية</h2>
          <div className="mt-4 grid gap-3">
            {rubrics.map((rubric) => (
              <div key={rubric.id} className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <p className="font-extrabold text-nile">{rubric.title}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(rubric.criteria || []).map((criterion) => <span key={criterion.id} className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-nile dark:bg-emerald-950">{criterion.name} / {criterion.max}</span>)}
                </div>
              </div>
            ))}
            {!rubrics.length && <EmptyState>لا توجد نماذج تقييم بعد.</EmptyState>}
          </div>
        </div>
      </section>}
      {activeSection === "matching" && <section className="grid gap-6">
        <div className="panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="panel-title">أكثر التقنيات استخداماً</h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">تساعدك هذه القائمة على توزيع الطلاب على المشرفين حسب التقنيات المتكررة في المشاريع.</p>
            </div>
            <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-extrabold text-nile dark:bg-emerald-950 dark:text-emerald-100">
              {(data.topTechnologies || []).length} تقنية
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(data.topTechnologies || []).map((item) => (
              <div key={item.tech} className="rounded-lg border border-emerald-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-extrabold text-nile">{item.tech}</span>
                  <span className="rounded-lg bg-green-50 px-3 py-1 text-sm font-black text-nile dark:bg-emerald-950">{item.total}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-nile"
                    style={{ width: `${Math.min(100, Math.round((Number(item.total || 0) / Math.max(...(data.topTechnologies || [{ total: 1 }]).map((tech) => Number(tech.total || 1)))) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
            {!(data.topTechnologies || []).length && <EmptyState>لا توجد تقنيات مسجلة بعد.</EmptyState>}
          </div>
        </div>
        <form onSubmit={assignProjectEvaluator} className="panel">
          <h2 className="panel-title">تعيين مشرف لتقييم مشروع</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">استخدم هذا الخيار إذا احتاج مشروع إلى مشرف تقييم أو تغيير المشرف الذي سيقرأ الطلب.</p>
          <select className="field" value={evaluationForm.projectId} onChange={(event) => setEvaluationForm({ ...evaluationForm, projectId: event.target.value })} required>
            <option value="">اختر المشروع</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.student_name} - {project.title} - {projectStatusLabel(project.status)}</option>)}
          </select>
          <select className="field" value={evaluationForm.supervisorId} onChange={(event) => setEvaluationForm({ ...evaluationForm, supervisorId: event.target.value })} required>
            <option value="">مشرف التقييم</option>
            {supervisors.map((item) => <option key={item.id} value={item.id}>{item.full_name} ({item.current_load}/{item.max_students_capacity})</option>)}
          </select>
          <button className="primary-btn"><Users size={18} /> تعيين مشرف التقييم</button>
        </form>
        <form onSubmit={overrideMatch} className="panel">
          <h2 className="panel-title">تعيين مشرف لطالب يدوياً</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">هذا يربط الطالب بالمشرف كإشراف فعلي، ويستخدم للحالات الإدارية الخاصة.</p>
          <select className="field" value={overrideForm.studentId} onChange={(event) => setOverrideForm({ ...overrideForm, studentId: event.target.value })} required>
            <option value="">الطالب</option>
            {students.map((item) => <option key={item.id} value={item.id}>{item.full_name} - {item.student_id}</option>)}
          </select>
          <select className="field" value={overrideForm.supervisorId} onChange={(event) => setOverrideForm({ ...overrideForm, supervisorId: event.target.value })} required>
            <option value="">المشرف</option>
            {supervisors.map((item) => <option key={item.id} value={item.id}>{item.full_name} ({item.current_load}/{item.max_students_capacity})</option>)}
          </select>
          <button className="primary-btn"><Users size={18} /> تطبيق التعيين</button>
          <div className="mt-4 grid gap-2">
            {students.slice(0, 6).map((item) => <div key={item.id} className="rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800"><b>{item.full_name}</b><span className="block text-zinc-500">{item.supervisor_name || "بدون مشرف"}</span></div>)}
          </div>
        </form>
      </section>}
    </div>
  );
}
