import { Fragment, useEffect, useState } from "react";
import { Bell, Bot, CalendarDays, Camera, CheckCircle2, Eye, FileText, Pencil, Users, XCircle } from "lucide-react";
import { api } from "../../api/client.js";
import { Avatar, EmptyState, MetricCard } from "../../components/common.jsx";
import AssistantAnalytics from "../../components/AssistantAnalytics.jsx";
import FeatureHub from "../../components/FeatureHub.jsx";
import SurveyList from "../../components/SurveyList.jsx";
import { assetUrl, classNames, csvList, DATE_INPUT_LIMITS, formatDate } from "../../utils/helpers.js";

function diagramDetails(body = "") {
  const image = body.match(/صورة المخطط:\s*(\/uploads\/[^\s]+)/)?.[1] || "";
  const code = body.match(/كود Mermaid:\s*\n?([\s\S]*)$/)?.[1]?.trim() || "";
  const note = body
    .replace(/صورة المخطط:\s*\/uploads\/[^\s]+/g, "")
    .replace(/كود Mermaid:\s*\n?[\s\S]*$/g, "")
    .trim();
  return { image, code, note };
}

export default function SupervisorDashboard({ token, user, activeSection, setSession }) {
  const [data, setData] = useState(null);
  const [score, setScore] = useState(null);
  const [toast, setToast] = useState({ section: "", message: "" });
  const [reviewFeedback, setReviewFeedback] = useState({});
  const [milestoneForm, setMilestoneForm] = useState({ projectId: "", title: "", dueDate: "" });
  const [supervisorForm, setSupervisorForm] = useState({ specialization: "", bio: "", expertiseKeywords: "", languages: "", tools: "" });
  const [supervisorSaving, setSupervisorSaving] = useState(false);
  const [selectedAssignedId, setSelectedAssignedId] = useState("");
  const [rubrics, setRubrics] = useState([]);
  const [rubricEval, setRubricEval] = useState({ projectId: "", templateId: "", scores: {}, notes: "" });
  const [blueprintReview, setBlueprintReview] = useState({});
  const [aiReviewProjectId, setAiReviewProjectId] = useState("");
  const [aiReviewResult, setAiReviewResult] = useState(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  async function load() {
    const [dashboard, rubricRows] = await Promise.all([api("/dashboards/supervisor", token), api("/features/rubrics", token)]);
    setData(dashboard);
    setRubrics(rubricRows);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!data?.profile) return;
    setSupervisorForm({
      specialization: data.profile.specialization || "",
      bio: data.profile.bio || "",
      expertiseKeywords: csvList(data.profile.expertise_keywords),
      languages: csvList(data.profile.languages),
      tools: csvList(data.profile.tools)
    });
  }, [data?.profile]);
  async function scoreProposal(project) {
    const result = await api(`/ai/score-proposal/${project.id}`, token, { method: "POST" });
    setScore({ ...result, projectTitle: project.title, studentName: project.student_name });
    setToast({ section: "proposals", message: "تم توليد بطاقة AI للمقترح" });
  }
  async function review(projectId, decision) {
    await api(`/projects/${projectId}/review`, token, { method: "PATCH", body: JSON.stringify({ decision, feedback: reviewFeedback[projectId] || `قرار المشرف: ${decision}` }) });
    setReviewFeedback((current) => ({ ...current, [projectId]: "" }));
    setToast({ section: "proposals", message: "تم حفظ قرار المراجعة" });
    await load();
  }
  async function addMilestone(event) {
    event.preventDefault();
    await api(`/projects/${milestoneForm.projectId}/milestones`, token, { method: "POST", body: JSON.stringify({ title: milestoneForm.title, dueDate: milestoneForm.dueDate }) });
    setToast({ section: "timeline", message: "تمت إضافة المرحلة للطالب" });
    setMilestoneForm({ projectId: "", title: "", dueDate: "" });
    await load();
  }
  async function updateMilestone(event, milestoneId) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api(`/projects/milestones/${milestoneId}`, token, {
      method: "PATCH",
      body: JSON.stringify({
        title: form.get("title"),
        dueDate: form.get("dueDate"),
        status: form.get("status")
      })
    });
    setToast({ section: "timeline", message: "تم تحديث المرحلة" });
    await load();
  }
  async function saveSupervisorProfile(event) {
    event.preventDefault();
    setSupervisorSaving(true);
    try {
      const nextSession = await api("/auth/supervisor-profile", token, {
        method: "PUT",
        body: JSON.stringify(supervisorForm)
      });
      setSession(nextSession);
      setToast({
        section: "profile",
        message: nextSession.user.supervisorProfileComplete
          ? "تم حفظ ملفك التعريفي وفتح باقي الخيارات"
          : "تم حفظ بياناتك. بقي رفع الصورة الشخصية حتى تنفتح باقي الخيارات"
      });
      await load();
    } catch (err) {
      setToast({ section: "profile", message: err.message });
    } finally {
      setSupervisorSaving(false);
    }
  }
  async function uploadSupervisorPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("avatar", file);
    try {
      const nextSession = await api("/auth/avatar", token, { method: "POST", body: form });
      setSession(nextSession);
      setToast({ section: "profile", message: "تم تحديث الصورة الشخصية" });
      await load();
    } finally {
      event.target.value = "";
    }
  }
  async function submitRubric(event) {
    event.preventDefault();
    await api(`/features/rubrics/${rubricEval.templateId}/evaluate/${rubricEval.projectId}`, token, {
      method: "POST",
      body: JSON.stringify({ scores: rubricEval.scores, notes: rubricEval.notes })
    });
    setToast({ section: "score", message: "تم حفظ تقييم Rubric" });
    setRubricEval({ projectId: "", templateId: "", scores: {}, notes: "" });
  }
  async function saveBlueprintReview(projectId) {
    await api(`/projects/${projectId}/blueprint/review`, token, {
      method: "PATCH",
      body: JSON.stringify(blueprintReview[projectId] || {})
    });
    if (aiReviewResult && String(aiReviewProjectId) === String(projectId)) {
      const comparison = await api(`/features/project-blueprint/comparison/${projectId}`, token);
      setAiReviewResult((current) => ({ ...current, comparison }));
    }
    setToast({ section: activeSection, message: "تم حفظ تقييم التصميم الأولي" });
    await load();
  }
  async function analyzeProjectWithAssistant(event) {
    event.preventDefault();
    if (!aiReviewProjectId) return;
    setAiReviewLoading(true);
    setAiReviewResult(null);
    try {
      const result = await api(`/features/project-blueprint/project/${aiReviewProjectId}`, token, { method: "POST" });
      setAiReviewResult(result);
      setBlueprintReview((current) => ({
        ...current,
        [aiReviewProjectId]: {
          ...(current[aiReviewProjectId] || {}),
          tablesScore: result.blueprint.tables_score || "",
          relationshipsScore: result.blueprint.relationships_score || "",
          diagramsScore: result.blueprint.diagrams_score || "",
          feasibilityScore: result.blueprint.feasibility_score || "",
          notes: result.blueprint.supervisor_notes || ""
        }
      }));
      setToast({ section: "projectAiReview", message: "تم تحليل المشروع وتوليد Blueprint محفوظ" });
      await load();
    } catch (err) {
      setToast({ section: "projectAiReview", message: err.message });
    } finally {
      setAiReviewLoading(false);
    }
  }
  if (!data) return <p>جاري التحميل...</p>;
  const assignedProjects = data.assigned.filter((item) => item.project_id);
  const progressFor = (item) => {
    if (!item.project_id || !item.total_milestones) return 0;
    return Math.min(100, Math.round((item.completed_milestones / item.total_milestones) * 100));
  };
  const projectStatusLabel = (status) => ({
    pending_admin_approval: "بانتظار اعتماد الإدارة",
    pending_review: "بانتظار مراجعة المشرف",
    approved: "مقبول",
    revision_requested: "بحاجة إلى تعديل",
    rejected: "مرفوض"
  }[status] || status || "غير محدد");
  const profileReady = Boolean(user.avatarUrl && data.profile?.specialization && data.profile?.bio && data.profile?.expertise_keywords?.length && data.profile?.languages?.length && data.profile?.tools?.length);
  return (
    <div className="grid gap-6">
      {toast.message && toast.section === activeSection && <div className="toast">{toast.message}</div>}
      {activeSection === "profile" && <section className="grid gap-6">
        {!profileReady && <div className="toast">أكمل صورتك واختصاصك واللغات والبرامج التي تعمل عليها حتى تنفتح باقي خيارات المشرف.</div>}
        <div className="panel">
          <h2 className="panel-title">الملف التعريفي للمشرف</h2>
          <div className="mt-4 rounded-lg border border-emerald-900/10 bg-green-50 p-3 dark:border-white/10 dark:bg-emerald-950/40">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={user.fullName} src={user.avatarUrl} size="md" />
                <div>
                  <p className="font-extrabold text-nile dark:text-emerald-100">الصورة الشخصية</p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">الصورة مطلوبة ليظهر ملفك للطلاب بشكل واضح.</p>
                </div>
              </div>
              {!user.avatarUrl && (
                <label className="primary-btn mt-0 w-full cursor-pointer justify-center py-2 text-sm sm:w-auto">
                  <Camera size={17} />
                  رفع الصورة
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadSupervisorPhoto} />
                </label>
              )}
            </div>
          </div>
          {profileReady ? (
            <div className="mt-4 grid gap-3">
              <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
                <p className="text-xs font-bold text-zinc-500">الاسم</p>
                <p className="mt-1 text-lg font-extrabold">{user.fullName}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-zinc-900">
                  <p className="text-xs font-bold text-zinc-500">الاختصاص الرئيسي</p>
                  <p className="mt-1 font-extrabold">{data.profile.specialization}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-zinc-900">
                  <p className="text-xs font-bold text-zinc-500">القسم</p>
                  <p className="mt-1 font-extrabold">{user.department || "غير محدد"}</p>
                </div>
              </div>
              <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-zinc-900">
                <p className="text-xs font-bold text-zinc-500">نبذة الخبرة</p>
                <p className="mt-2 text-sm leading-7 text-zinc-600 dark:text-zinc-300">{data.profile.bio}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ["مجالات المساعدة", data.profile.expertise_keywords],
                  ["القدرات", data.profile.languages],
                  ["البرامج والأدوات", data.profile.tools]
                ].map(([label, values]) => (
                  <div key={label} className="rounded-lg bg-white p-3 shadow-sm dark:bg-zinc-900">
                    <p className="text-xs font-bold text-zinc-500">{label}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(values || []).map((item) => (
                        <span key={item} className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-nile dark:bg-emerald-950 dark:text-emerald-100">{item}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="rounded-lg bg-green-50 p-3 text-sm font-bold text-nile dark:bg-emerald-950 dark:text-emerald-100">
                تم تثبيت ملفك التعريفي. إذا احتجت تعديلاً لاحقاً تواصل مع الإدارة.
              </p>
            </div>
          ) : (
          <form onSubmit={saveSupervisorProfile} className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-extrabold text-nile dark:text-emerald-100">الاختصاص الرئيسي</span>
              <input className="field mt-0" placeholder="ذكاء اصطناعي، تطبيقات موبايل، قواعد بيانات..." value={supervisorForm.specialization} onChange={(event) => setSupervisorForm({ ...supervisorForm, specialization: event.target.value })} required />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-extrabold text-nile dark:text-emerald-100">نبذة الخبرة</span>
              <textarea className="field min-h-28" placeholder="نبذة قصيرة توضّح خبرتك ونوع المشاريع التي تستطيع مساعدة الطلاب فيها" value={supervisorForm.bio} onChange={(event) => setSupervisorForm({ ...supervisorForm, bio: event.target.value })} required />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-extrabold text-nile dark:text-emerald-100">مجالات المساعدة</span>
              <input className="field" placeholder="AI, NLP, Backend, Security" value={supervisorForm.expertiseKeywords} onChange={(event) => setSupervisorForm({ ...supervisorForm, expertiseKeywords: event.target.value })} required />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-extrabold text-nile dark:text-emerald-100">القدرات</span>
              <textarea className="field min-h-24" placeholder="أضف أي عدد من اللغات والتقنيات مفصولة بفواصل: Python, JavaScript, Dart, Java, Flutter, React" value={supervisorForm.languages} onChange={(event) => setSupervisorForm({ ...supervisorForm, languages: event.target.value })} required />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-extrabold text-nile dark:text-emerald-100">البرامج والأدوات</span>
              <input className="field" placeholder="Docker, PostgreSQL, Firebase, Git" value={supervisorForm.tools} onChange={(event) => setSupervisorForm({ ...supervisorForm, tools: event.target.value })} required />
            </label>
            {!user.avatarUrl && <p className="rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-100">بعد حفظ البيانات، لازم ترفع الصورة الشخصية حتى ينفتح باقي البرنامج.</p>}
            <button type="submit" disabled={supervisorSaving} className="primary-btn mt-0 disabled:opacity-60">
              <CheckCircle2 size={18} />
              {supervisorSaving ? "جار حفظ الملف..." : "حفظ الملف التعريفي"}
            </button>
          </form>
          )}
        </div>
      </section>}
      {activeSection === "overview" && <section className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard icon={Users} label="طلاب مشرف عليهم" value={data.assigned.length} />
          <MetricCard icon={FileText} label="مقترحات بانتظار المراجعة" value={data.pending.length} tone="saffron" />
          <MetricCard icon={Bell} label="رسائل" value={data.messages.length} tone="berry" />
        </div>
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="panel-title">طلابي ومشاريعهم</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">اضغط عرض لفتح معلومات الطالب والمشروع داخل نفس القائمة.</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>الطالب</th><th>الرقم الجامعي</th><th>المشروع</th><th>الحالة</th><th>التقدم</th><th>إجراء</th></tr></thead>
              <tbody>
                {data.assigned.map((item) => {
                  const selected = selectedAssignedId === `${item.user_id}-${item.project_id || "none"}`;
                  const progress = progressFor(item);
                  const rowId = `${item.user_id}-${item.project_id || "none"}`;
                  return (
                    <Fragment key={rowId}>
                      <tr className={selected ? "bg-green-50/70 dark:bg-emerald-950/40" : ""}>
                        <td className="font-extrabold text-nile">{item.full_name}</td>
                        <td>{item.student_id}</td>
                        <td>{item.title || "لا يوجد مشروع مسجل بعد"}</td>
                        <td>{projectStatusLabel(item.status || item.project_status)}</td>
                        <td>
                          <div className="min-w-32">
                            <div className="flex justify-between text-xs font-bold"><span>{progress}%</span><span>{item.completed_milestones || 0}/{item.total_milestones || 0}</span></div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                              <div className="h-full rounded-full bg-nile" style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => setSelectedAssignedId(selected ? "" : rowId)}
                            className="mini-action text-nile"
                          >
                            <Eye size={16} /> عرض
                          </button>
                        </td>
                      </tr>
                      {selected && (
                        <tr>
                          <td colSpan="6" className="bg-green-50/50 p-0 dark:bg-emerald-950/20">
                            <div className="grid gap-4 p-4">
                              <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded-lg bg-white p-4 dark:bg-zinc-900">
                                  <p className="text-sm text-zinc-500">البريد</p>
                                  <p className="mt-1 font-extrabold">{item.email}</p>
                                </div>
                                <div className="rounded-lg bg-white p-4 dark:bg-zinc-900">
                                  <p className="text-sm text-zinc-500">رقم التواصل</p>
                                  <p className="mt-1 font-extrabold">{item.phone || "غير محدد"}</p>
                                </div>
                                <div className="rounded-lg bg-white p-4 dark:bg-zinc-900">
                                  <p className="text-sm text-zinc-500">القسم</p>
                                  <p className="mt-1 font-extrabold">{item.department}</p>
                                </div>
                              </div>
                              <div className="rounded-lg bg-white p-4 dark:bg-zinc-900">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm text-zinc-500">معلومات المشروع</p>
                                    <h3 className="mt-1 text-xl font-extrabold">{item.title || "لا يوجد مشروع مسجل بعد"}</h3>
                                  </div>
                                  <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-extrabold text-nile dark:bg-emerald-950 dark:text-emerald-100">
                                    {projectStatusLabel(item.status)} · {progress}% جاهزية
                                  </span>
                                </div>
                                <p className="mt-3 leading-7 text-zinc-600 dark:text-zinc-300">{item.abstract || "لم تتم إضافة وصف للمشروع بعد."}</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {(item.tech_stack || []).map((tech) => (
                                    <span key={tech} className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-nile dark:bg-emerald-950 dark:text-emerald-100">{tech}</span>
                                  ))}
                                  {!item.tech_stack?.length && <span className="text-sm font-bold text-zinc-500">لا توجد تقنيات محددة.</span>}
                                </div>
                                {item.blueprint && (
                                  <div className="mt-4 rounded-lg bg-green-50 p-4 dark:bg-emerald-950/40">
                                    <p className="font-extrabold text-nile"><Bot size={16} className="inline" /> التصميم الأولي من المساعد</p>
                                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">المجال: {item.blueprint.domain} · الثقة: {item.blueprint.confidence}%</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {(item.blueprint.tables || []).slice(0, 8).map((table) => (
                                        <span key={table.name} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-nile dark:bg-zinc-900">{table.name}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded-lg bg-white p-4 dark:bg-zinc-900">
                                  <p className="text-sm text-zinc-500">المراحل المنجزة</p>
                                  <p className="mt-1 text-2xl font-black">{item.completed_milestones || 0}/{item.total_milestones || 0}</p>
                                </div>
                                <div className="rounded-lg bg-white p-4 dark:bg-zinc-900">
                                  <p className="text-sm text-zinc-500">الملفات المرفوعة</p>
                                  <p className="mt-1 text-2xl font-black">{item.total_submissions || 0}</p>
                                </div>
                                <div className="rounded-lg bg-white p-4 dark:bg-zinc-900">
                                  <p className="text-sm text-zinc-500">الموعد النهائي</p>
                                  <p className="mt-1 text-2xl font-black">{formatDate(item.deadline)}</p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {!data.assigned.length && <div className="mt-4"><EmptyState>لا يوجد طلاب مسجلون عندك حالياً.</EmptyState></div>}
          </div>
        </div>
      </section>}
      {activeSection === "proposals" && <section className="grid gap-6">
        <div className="panel">
          <h2 className="panel-title">المقترحات</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>الطالب</th><th>العنوان</th><th>التقنيات</th><th>الحالة</th><th>إجراء</th></tr></thead>
              <tbody>
                {data.pending.map((project) => (
                  <tr key={project.id}>
                    <td>{project.student_name}</td>
                    <td>
                      <p className="font-bold">{project.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">{project.abstract}</p>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {(project.tech_stack || []).map((item) => <span key={item} className="rounded-full bg-green-50 px-2 py-1 text-xs font-bold text-nile dark:bg-emerald-950">{item}</span>)}
                        {!project.tech_stack?.length && <span className="text-xs text-zinc-500">غير محدد</span>}
                      </div>
                    </td>
                    <td>{project.status}</td>
                    <td>
                      <textarea
                        className="field mb-2 mt-0 min-h-20"
                        placeholder="اكتب ملاحظة للطالب قبل القرار"
                        value={reviewFeedback[project.id] || ""}
                        onChange={(event) => setReviewFeedback({ ...reviewFeedback, [project.id]: event.target.value })}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => scoreProposal(project)} className="secondary-btn">بطاقة AI</button>
                        <button onClick={() => review(project.id, "approve")} className="mini-action text-emerald-700"><CheckCircle2 size={16} /> قبول</button>
                        <button onClick={() => review(project.id, "revision")} className="mini-action text-amber-700"><Pencil size={16} /> تعديل</button>
                        <button onClick={() => review(project.id, "reject")} className="mini-action text-red-700"><XCircle size={16} /> رفض</button>
                      </div>
                      {project.blueprint && (
                        <div className="mt-3 rounded-lg bg-green-50 p-3 dark:bg-emerald-950/40">
                          <p className="font-extrabold text-nile">Blueprint محفوظ مع الطلب</p>
                          <p className="mt-1 text-xs text-zinc-500">المجال: {project.blueprint.domain} · الجداول: {project.blueprint.tables?.length || 0} · العلاقات: {project.blueprint.relationships?.length || 0}</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(project.blueprint.tables || []).slice(0, 7).map((table) => (
                              <span key={table.name} className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-nile dark:bg-zinc-900">{table.name}</span>
                            ))}
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-4">
                            {[
                              ["tablesScore", "الجداول"],
                              ["relationshipsScore", "العلاقات"],
                              ["diagramsScore", "المخططات"],
                              ["feasibilityScore", "التنفيذ"]
                            ].map(([key, label]) => (
                              <select
                                key={key}
                                className="field mt-0"
                                value={blueprintReview[project.id]?.[key] ?? project[key.replace("Score", "_score")] ?? ""}
                                onChange={(event) => setBlueprintReview({
                                  ...blueprintReview,
                                  [project.id]: { ...(blueprintReview[project.id] || {}), [key]: Number(event.target.value) }
                                })}
                              >
                                <option value="">{label}</option>
                                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            ))}
                          </div>
                          <textarea
                            className="field min-h-20"
                            placeholder="ملاحظات على التصميم الأولي"
                            value={blueprintReview[project.id]?.notes ?? project.supervisor_notes ?? ""}
                            onChange={(event) => setBlueprintReview({
                              ...blueprintReview,
                              [project.id]: { ...(blueprintReview[project.id] || {}), notes: event.target.value }
                            })}
                          />
                          <button type="button" onClick={() => saveBlueprintReview(project.id)} className="secondary-btn">حفظ تقييم Blueprint</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.pending.length && <div className="mt-4"><EmptyState>لا توجد مقترحات بانتظار المراجعة.</EmptyState></div>}
          </div>
        </div>
        {score && (
          <div className="panel">
            <h2 className="panel-title">بطاقة AI للمقترح</h2>
            <p className="mt-2 text-sm font-bold text-zinc-500">{score.studentName} - {score.projectTitle}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <MetricCard compact icon={CheckCircle2} label="النتيجة العامة" value={`${score.overall_score}/10`} />
              <MetricCard compact icon={FileText} label="وضوح المشكلة" value={`${score.problem_statement_clarity}/10`} />
              <MetricCard compact icon={FileText} label="الأدبيات" value={`${score.literature_review_adequacy}/10`} />
              <MetricCard compact icon={FileText} label="المنهجية" value={`${score.methodology_logic}/10`} />
            </div>
            <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm font-bold text-nile dark:bg-emerald-950">{score.smart_objectives_check}</p>
            <div className="mt-3 grid gap-2">
              {score.weaknesses.map((weakness) => (
                <p key={weakness} className="rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800">{weakness}</p>
              ))}
            </div>
          </div>
        )}
      </section>}
      {activeSection === "projectTracking" && <section className="grid gap-6">
        <div className="panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="panel-title">متابعة المشاريع</h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                ملخص عملي لما أنجزه كل طالب: المخططات المرسلة، الفصول المرفوعة، المراحل، وملاحظات المتابعة.
              </p>
            </div>
            <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-extrabold text-nile dark:bg-emerald-950">
              {(data.tracking || []).length} مشروع
            </span>
          </div>
        </div>

        {(data.tracking || []).map((project) => {
          const milestones = project.milestones || [];
          const submissions = project.submissions || [];
          const diagrams = project.diagrams || [];
          const notes = project.notes || [];
          const doneMilestones = milestones.filter((item) => item.status === "done" || item.completed_at).length;
          const progress = milestones.length ? Math.round((doneMilestones / milestones.length) * 100) : 0;
          return (
            <div key={project.project_id} className="panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-zinc-500">{project.student_name} · {project.university_id}</p>
                  <h3 className="mt-1 text-2xl font-extrabold text-nile">{project.project_title}</h3>
                  <p className="mt-1 text-sm text-zinc-500">الحالة: {projectStatusLabel(project.status)} · الموعد النهائي: {formatDate(project.deadline)}</p>
                </div>
                <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-extrabold text-nile dark:bg-emerald-950">
                  منجز {progress}%
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <MetricCard compact icon={Pencil} label="المخططات" value={diagrams.length} />
                <MetricCard compact icon={FileText} label="الفصول" value={submissions.length} />
                <MetricCard compact icon={CalendarDays} label="المراحل" value={`${doneMilestones}/${milestones.length}`} />
                <MetricCard compact icon={Bell} label="الملاحظات" value={notes.length + (project.supervisor_notes ? 1 : 0)} />
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                  <h4 className="font-extrabold text-nile">المخططات المرسلة</h4>
                  <div className="mt-3 grid gap-3">
                    {diagrams.map((message) => {
                      const details = diagramDetails(message.body);
                      return (
                        <div key={message.id} className="rounded-lg bg-white p-3 dark:bg-zinc-800">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold text-zinc-500">{new Date(message.created_at).toLocaleString("ar")}</p>
                            {details.image && <a className="mini-action text-nile" href={assetUrl(details.image)} target="_blank" rel="noreferrer">فتح الصورة</a>}
                          </div>
                          {details.note && <p className="mt-2 text-sm leading-7">{details.note}</p>}
                          {details.image && <img src={assetUrl(details.image)} alt="مخطط الطالب" className="mt-3 max-h-56 w-full rounded-lg border border-black/10 object-contain dark:border-white/10" />}
                          {details.code && (
                            <details className="mt-3 rounded-lg bg-zinc-950 p-3 text-left text-xs text-emerald-100" dir="ltr">
                              <summary className="cursor-pointer text-right font-bold text-white" dir="rtl">كود Mermaid</summary>
                              <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap">{details.code}</pre>
                            </details>
                          )}
                        </div>
                      );
                    })}
                    {!diagrams.length && <EmptyState>لم يرسل الطالب مخططات بعد.</EmptyState>}
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                  <h4 className="font-extrabold text-nile">الفصول والملفات المرفوعة</h4>
                  <div className="mt-3 grid gap-3">
                    {submissions.map((submission) => (
                      <div key={submission.id} className="rounded-lg bg-white p-3 dark:bg-zinc-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-extrabold">{submission.chapter_name}</p>
                            <p className="mt-1 text-xs text-zinc-500">{new Date(submission.submitted_at).toLocaleString("ar")}</p>
                          </div>
                          <a className="mini-action text-nile" href={assetUrl(submission.file_url)} target="_blank" rel="noreferrer">فتح الملف</a>
                        </div>
                        {submission.score && <p className="mt-2 text-sm font-bold text-nile">العلامة: {submission.score}</p>}
                        {submission.feedback && <p className="mt-2 rounded-lg bg-green-50 p-2 text-sm dark:bg-emerald-950">{submission.feedback}</p>}
                      </div>
                    ))}
                    {!submissions.length && <EmptyState>لا توجد فصول مرفوعة لهذا المشروع.</EmptyState>}
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                  <h4 className="font-extrabold text-nile">المراحل</h4>
                  <div className="mt-3 grid gap-2">
                    {milestones.map((milestone) => (
                      <div key={milestone.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm dark:bg-zinc-800">
                        <span className="font-extrabold">{milestone.title}</span>
                        <span className={classNames("rounded-full px-3 py-1 text-xs font-bold", milestone.status === "done" || milestone.completed_at ? "bg-green-100 text-nile" : "bg-zinc-100 text-zinc-600")}>
                          {milestone.status === "done" || milestone.completed_at ? "منجزة" : "قيد العمل"} · {formatDate(milestone.due_date)}
                        </span>
                      </div>
                    ))}
                    {!milestones.length && <EmptyState>لم تُضف مراحل بعد.</EmptyState>}
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                  <h4 className="font-extrabold text-nile">ملاحظات ومحادثات المتابعة</h4>
                  <div className="mt-3 grid gap-3">
                    {project.supervisor_notes && (
                      <div className="rounded-lg bg-green-50 p-3 text-sm dark:bg-emerald-950">
                        <p className="text-xs font-bold text-zinc-500">ملاحظة تقييم Blueprint</p>
                        <p className="mt-1 leading-7">{project.supervisor_notes}</p>
                      </div>
                    )}
                    {notes.slice(0, 6).map((note) => (
                      <div key={note.id} className="rounded-lg bg-white p-3 text-sm dark:bg-zinc-800">
                        <p className="text-xs font-bold text-zinc-500">{note.sender_id === user.id ? "ملاحظة من المشرف" : "رسالة من الطالب"} · {new Date(note.created_at).toLocaleString("ar")}</p>
                        <p className="mt-2 whitespace-pre-wrap leading-7">{note.body}</p>
                      </div>
                    ))}
                    {!project.supervisor_notes && !notes.length && <EmptyState>لا توجد ملاحظات متابعة بعد.</EmptyState>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {!(data.tracking || []).length && <div className="panel"><EmptyState>لا توجد مشاريع مرتبطة بك حالياً.</EmptyState></div>}
      </section>}
      {activeSection === "timeline" && <section className="grid gap-6">
        <form onSubmit={addMilestone} className="panel">
          <h2 className="panel-title">إضافة مرحلة لطالب</h2>
          <select className="field" value={milestoneForm.projectId} onChange={(event) => setMilestoneForm({ ...milestoneForm, projectId: event.target.value })} required>
            <option value="">اختر المشروع</option>
            {assignedProjects.map((project) => <option key={project.project_id} value={project.project_id}>{project.full_name} - {project.title}</option>)}
          </select>
          <input className="field" placeholder="اسم المرحلة" value={milestoneForm.title} onChange={(event) => setMilestoneForm({ ...milestoneForm, title: event.target.value })} required />
          <input className="field" type="date" value={milestoneForm.dueDate} onChange={(event) => setMilestoneForm({ ...milestoneForm, dueDate: event.target.value })} {...DATE_INPUT_LIMITS} />
          <button className="primary-btn"><CalendarDays size={18} /> إضافة المرحلة</button>
        </form>
        <div className="panel">
          <h2 className="panel-title">تعديل المخطط الزمني</h2>
          <div className="mt-4 grid gap-3">
            {data.milestones.map((milestone) => (
              <form key={milestone.id} onSubmit={(event) => updateMilestone(event, milestone.id)} className="grid gap-3 rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800 xl:grid-cols-[1fr_1fr_150px_auto]">
                <div>
                  <p className="mb-2 text-xs font-bold text-zinc-500">{milestone.student_name} - {milestone.project_title}</p>
                  <input name="title" className="field mt-0" defaultValue={milestone.title} required />
                </div>
                <input name="dueDate" className="field mt-5" type="date" defaultValue={milestone.due_date?.slice(0, 10)} {...DATE_INPUT_LIMITS} />
                <select name="status" className="field mt-5" defaultValue={milestone.status}>
                  <option value="todo">قيد العمل</option>
                  <option value="done">منجزة</option>
                </select>
                <button className="secondary-btn mt-5">حفظ</button>
              </form>
            ))}
            {!data.milestones.length && <EmptyState>لا توجد مراحل لطلابك بعد.</EmptyState>}
          </div>
        </div>
      </section>}
      {activeSection === "score" && <section className="grid gap-6">
        <form onSubmit={submitRubric} className="panel">
          <h2 className="panel-title">Rubric التقييم الرسمي</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select className="field mt-0" value={rubricEval.projectId} onChange={(event) => setRubricEval({ ...rubricEval, projectId: event.target.value })} required>
              <option value="">اختر المشروع</option>
              {assignedProjects.map((project) => <option key={project.project_id} value={project.project_id}>{project.full_name} - {project.title}</option>)}
            </select>
            <select className="field mt-0" value={rubricEval.templateId} onChange={(event) => setRubricEval({ ...rubricEval, templateId: event.target.value, scores: {} })} required>
              <option value="">اختر نموذج التقييم</option>
              {rubrics.map((rubric) => <option key={rubric.id} value={rubric.id}>{rubric.title}</option>)}
            </select>
          </div>
          <div className="mt-4 grid gap-3">
            {(rubrics.find((rubric) => String(rubric.id) === String(rubricEval.templateId))?.criteria || []).map((criterion) => (
              <label key={criterion.id} className="grid gap-2 rounded-lg bg-zinc-100 p-3 text-sm font-bold dark:bg-zinc-800">
                {criterion.name} / {criterion.max}
                <input
                  type="number"
                  min="0"
                  max={criterion.max}
                  className="field mt-0"
                  value={rubricEval.scores[criterion.id] || ""}
                  onChange={(event) => setRubricEval({ ...rubricEval, scores: { ...rubricEval.scores, [criterion.id]: Number(event.target.value) } })}
                  required
                />
              </label>
            ))}
          </div>
          <textarea className="field min-h-24" placeholder="ملاحظات التقييم" value={rubricEval.notes} onChange={(event) => setRubricEval({ ...rubricEval, notes: event.target.value })} />
          <button className="primary-btn"><CheckCircle2 size={18} /> حفظ تقييم Rubric</button>
        </form>
      </section>}
      {activeSection === "projectAiReview" && <section className="grid gap-6">
        <form onSubmit={analyzeProjectWithAssistant} className="panel">
          <h2 className="panel-title">تقييم مشروع بالمساعد</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            اختر مشروع طالب من طلابك ليولّد المساعد Blueprint أولي، ثم قيّم جودة الجداول والعلاقات والمخططات وقابلية التنفيذ.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <select className="field mt-0" value={aiReviewProjectId} onChange={(event) => setAiReviewProjectId(event.target.value)} required>
              <option value="">اختر مشروع الطالب</option>
              {assignedProjects.map((project) => (
                <option key={project.project_id} value={project.project_id}>{project.full_name} - {project.title}</option>
              ))}
            </select>
            <button className="primary-btn mt-0" disabled={aiReviewLoading}>
              <Bot size={18} /> {aiReviewLoading ? "جاري التحليل..." : "تحليل المشروع"}
            </button>
          </div>
          {!assignedProjects.length && <div className="mt-4"><EmptyState>لا يوجد مشاريع طلاب مسجلة عندك حالياً.</EmptyState></div>}
        </form>

        {aiReviewResult && (
          <div className="panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="panel-title">{aiReviewResult.project.title}</h2>
                <p className="mt-1 text-sm text-zinc-500">{aiReviewResult.project.student_name} · {projectStatusLabel(aiReviewResult.project.status)}</p>
              </div>
              <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-extrabold text-nile dark:bg-emerald-950 dark:text-emerald-100">
                Quality {aiReviewResult.blueprint.blueprint?.qualityScore || 0}%
              </span>
            </div>
            <p className="mt-4 leading-7 text-zinc-600 dark:text-zinc-300">{aiReviewResult.project.abstract}</p>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                ["الجداول", aiReviewResult.blueprint.blueprint?.tables?.length || 0],
                ["العلاقات", aiReviewResult.blueprint.blueprint?.relationships?.length || 0],
                ["الصفحات", aiReviewResult.blueprint.blueprint?.pages?.length || 0],
                ["المخاطر", aiReviewResult.blueprint.blueprint?.risks?.length || 0]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-zinc-100 p-3 text-center dark:bg-zinc-800">
                  <p className="text-2xl font-black text-nile">{value}</p>
                  <p className="text-xs font-bold text-zinc-500">{label}</p>
                </div>
              ))}
            </div>

            {aiReviewResult.comparison && (
              <div className="mt-5 rounded-lg border border-emerald-900/10 bg-green-50 p-4 dark:border-white/10 dark:bg-emerald-950/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-nile">مقارنة المساعد مع تقييم المشرف</h3>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      تظهر هذه المقارنة نقاط القوة والضعف بعد حفظ تقييم المشرف، وتصلح كجزء من التوثيق البحثي.
                    </p>
                  </div>
                  <span className="rounded-lg bg-white px-3 py-1 text-xs font-black text-nile dark:bg-zinc-900">
                    {aiReviewResult.comparison.reviewed ? "تمت المراجعة" : "بانتظار تقييم المشرف"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {[
                    ["جودة المساعد", `${aiReviewResult.comparison.assistantMetrics.qualityScore}%`],
                    ["ثقة التوليد", `${aiReviewResult.comparison.assistantMetrics.confidence}%`],
                    ["تقييم الجداول", aiReviewResult.comparison.supervisorScores.tables ? `${aiReviewResult.comparison.supervisorScores.tables}/5` : "غير مقيّم"],
                    ["قابلية التنفيذ", aiReviewResult.comparison.supervisorScores.feasibility ? `${aiReviewResult.comparison.supervisorScores.feasibility}/5` : "غير مقيّم"]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-white p-3 text-center dark:bg-zinc-900">
                      <p className="text-lg font-black text-nile">{value}</p>
                      <p className="text-xs font-bold text-zinc-500">{label}</p>
                    </div>
                  ))}
                </div>
                <ul className="mt-4 list-inside list-disc text-sm leading-7 text-zinc-700 dark:text-zinc-200">
                  {aiReviewResult.comparison.recommendations.map((item) => <li key={item}>{item}</li>)}
                </ul>
                {aiReviewResult.comparison.supervisorNotes && (
                  <p className="mt-3 rounded-lg bg-white p-3 text-sm dark:bg-zinc-900">{aiReviewResult.comparison.supervisorNotes}</p>
                )}
              </div>
            )}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                <h3 className="font-extrabold text-nile">الجداول المقترحة</h3>
                <div className="mt-3 grid gap-2">
                  {(aiReviewResult.blueprint.blueprint?.tables || []).slice(0, 8).map((table) => (
                    <details key={table.name} className="rounded-lg bg-white p-3 dark:bg-zinc-800">
                      <summary className="cursor-pointer font-extrabold">{table.name}</summary>
                      <p className="mt-2 text-xs text-zinc-500">{table.purpose}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {table.fields.slice(0, 8).map((field) => (
                          <span key={field} className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-bold text-nile dark:bg-emerald-950">{field}</span>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                <h3 className="font-extrabold text-nile">المخاطر ومعايير القبول</h3>
                <div className="mt-3 grid gap-3">
                  {(aiReviewResult.blueprint.blueprint?.risks || []).slice(0, 4).map((risk) => (
                    <div key={risk.title} className="rounded-lg bg-white p-3 text-sm dark:bg-zinc-800">
                      <p className="font-extrabold">{risk.title} <span className="text-red-700">({risk.level})</span></p>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-300">{risk.mitigation}</p>
                    </div>
                  ))}
                  <ul className="list-inside list-disc text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                    {(aiReviewResult.blueprint.blueprint?.acceptanceCriteria || []).slice(0, 5).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-lg bg-green-50 p-4 dark:bg-emerald-950/40">
              <h3 className="font-extrabold text-nile">تقييم المشرف للتصميم</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                {[
                  ["tablesScore", "الجداول"],
                  ["relationshipsScore", "العلاقات"],
                  ["diagramsScore", "المخططات"],
                  ["feasibilityScore", "قابلية التنفيذ"]
                ].map(([key, label]) => (
                  <select
                    key={key}
                    className="field mt-0"
                    value={blueprintReview[aiReviewProjectId]?.[key] || ""}
                    onChange={(event) => setBlueprintReview({
                      ...blueprintReview,
                      [aiReviewProjectId]: { ...(blueprintReview[aiReviewProjectId] || {}), [key]: Number(event.target.value) }
                    })}
                  >
                    <option value="">{label}</option>
                    {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}/5</option>)}
                  </select>
                ))}
              </div>
              <textarea
                className="field min-h-24"
                placeholder="ملاحظات المشرف على تحليل المساعد والتصميم المقترح"
                value={blueprintReview[aiReviewProjectId]?.notes || ""}
                onChange={(event) => setBlueprintReview({
                  ...blueprintReview,
                  [aiReviewProjectId]: { ...(blueprintReview[aiReviewProjectId] || {}), notes: event.target.value }
                })}
              />
              <button type="button" onClick={() => saveBlueprintReview(aiReviewProjectId)} className="primary-btn mt-0">
                <CheckCircle2 size={18} /> حفظ تقييم المشروع
              </button>
            </div>
          </div>
        )}
      </section>}
      {activeSection === "meetings" && <section className="grid gap-6">
        <div className="panel">
          <h2 className="panel-title">الاجتماعات</h2>
          <div className="mt-4 grid gap-3">
            {data.meetings.map((meeting) => <div key={meeting.id} className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800"><p className="font-bold">{meeting.student_name}</p><p className="text-sm text-zinc-500">{new Date(meeting.scheduled_at).toLocaleString("ar")}</p><p className="text-sm">{meeting.notes}</p></div>)}
            {!data.meetings.length && <EmptyState>لا توجد اجتماعات مجدولة.</EmptyState>}
          </div>
        </div>
      </section>}
      {activeSection === "surveys" && <SurveyList token={token} section="surveys" showToast={(section, message) => setToast({ section, message })} />}
      {activeSection === "ideas" && <FeatureHub token={token} role="supervisor" showToast={(section, message) => setToast({ section, message })} section="ideas" mode="ideas" />}
      {activeSection === "library" && <FeatureHub token={token} role="supervisor" showToast={(section, message) => setToast({ section, message })} section="library" mode="library" />}
      {activeSection === "assistantAnalytics" && <AssistantAnalytics token={token} />}
    </div>
  );
}
