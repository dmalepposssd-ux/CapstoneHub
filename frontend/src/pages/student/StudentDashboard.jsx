import { lazy, Suspense, useEffect, useState } from "react";
import { Bell, Bot, CalendarDays, Camera, CheckCircle2, Download, FileText, Pencil, Send, Upload, User, Users } from "lucide-react";
import { api } from "../../api/client.js";
import { Avatar, EmptyState, MetricCard } from "../../components/common.jsx";
import FeatureHub from "../../components/FeatureHub.jsx";
import SurveyList from "../../components/SurveyList.jsx";
import { classNames, DATETIME_INPUT_LIMITS, formatDate, milestoneStatusLabel } from "../../utils/helpers.js";

const DiagramStudio = lazy(() => import("../../components/DiagramStudio.jsx"));

export default function StudentDashboard({ token, user, activeSection, setActiveSection, setSession }) {
  const [data, setData] = useState(null);
  const [toast, setToast] = useState({ section: "", message: "" });
  const [similarProjects, setSimilarProjects] = useState([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [profileUpdateOpen, setProfileUpdateOpen] = useState(false);
  const [profileUpdateBody, setProfileUpdateBody] = useState("");
  const [meetingRequest, setMeetingRequest] = useState({ desiredAt: "", notes: "" });
  const [documentAnalyses, setDocumentAnalyses] = useState([]);
  const [analyzingSubmissionId, setAnalyzingSubmissionId] = useState("");
  const [gradingSubmissionId, setGradingSubmissionId] = useState("");
  const [thesisGrade, setThesisGrade] = useState(null);
  const [blueprintPreview, setBlueprintPreview] = useState(null);
  const [blueprintLoading, setBlueprintLoading] = useState(false);
  const [aiAdvisor, setAiAdvisor] = useState(null);
  const [aiAdvisorLoading, setAiAdvisorLoading] = useState(false);
  const [draft, setDraft] = useState(() => ({ preferredSupervisorId: "", techStack: "", ...JSON.parse(localStorage.getItem("proposalDraft") || '{"title":"","abstract":""}') }));
  const showToast = (section, message) => setToast({ section, message });

  async function load() {
    setData(await api("/dashboards/student", token));
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { localStorage.setItem("proposalDraft", JSON.stringify(draft)); }, [draft]);
  useEffect(() => {
    if (!data?.projects?.[0]?.id) return;
    api(`/ai/analyses/project/${data.projects[0].id}`, token)
      .then(setDocumentAnalyses)
      .catch(() => setDocumentAnalyses([]));
  }, [data?.projects?.[0]?.id, token]);

  async function findSimilarProjects() {
    setSimilarLoading(true);
    try {
      const results = await api("/projects/similar", token, { method: "POST", body: JSON.stringify({ title: draft.title, abstract: draft.abstract, techStack: draft.techStack }) });
      setSimilarProjects(results);
      showToast("request", results.length ? `تم عرض ${results.length} مشاريع من هندسة المعلومات` : "لا توجد مشاريع سابقة حالياً");
    } finally {
      setSimilarLoading(false);
    }
  }

  function isSupervisorFull(supervisor) {
    return Number(supervisor?.current_load || 0) >= Number(supervisor?.max_students_capacity || 0);
  }

  function isSupervisorReady(supervisor) {
    return supervisor?.profile_complete !== false;
  }

  function canSelectSupervisor(supervisor) {
    return isSupervisorReady(supervisor) && !isSupervisorFull(supervisor);
  }

  function selectPreferredSupervisor(supervisor) {
    if (!supervisor) {
      setDraft({ ...draft, preferredSupervisorId: "" });
      return;
    }
    if (!isSupervisorReady(supervisor)) {
      showToast("request", `ملف ${supervisor.full_name} غير مكتمل حالياً ولا يمكن التسجيل عنده`);
      return;
    }
    if (isSupervisorFull(supervisor)) {
      showToast("request", `لا يمكنك التسجيل عند ${supervisor.full_name} لأن العدد مكتمل لديه`);
      return;
    }
    setDraft({ ...draft, preferredSupervisorId: String(supervisor.id) });
  }

  async function submitProposal(event) {
    event.preventDefault();
    const selectedSupervisor = data?.supervisors.find((supervisor) => String(supervisor.id) === String(draft.preferredSupervisorId));
    if (selectedSupervisor && !canSelectSupervisor(selectedSupervisor)) {
      showToast("request", !isSupervisorReady(selectedSupervisor)
        ? `ملف ${selectedSupervisor.full_name} غير مكتمل حالياً ولا يمكن التسجيل عنده`
        : `لا يمكنك التسجيل عند ${selectedSupervisor.full_name} لأن العدد مكتمل لديه`);
      return;
    }
    const form = new FormData(event.currentTarget);
    let blueprint = blueprintPreview;
    if (!blueprint) {
      blueprint = await api("/features/project-blueprint", token, {
        method: "POST",
        body: JSON.stringify({ idea: `${draft.title}\n${draft.abstract}`, techStack: draft.techStack })
      });
    }
    form.set("blueprintJson", JSON.stringify(blueprint));
    await api("/projects", token, { method: "POST", body: form });
    showToast("request", "تم إرسال طلب المشروع إلى المشرف بانتظار المراجعة");
    localStorage.removeItem("proposalDraft");
    setDraft({ title: "", abstract: "", preferredSupervisorId: "", techStack: "" });
    setSimilarProjects([]);
    setBlueprintPreview(null);
    await load();
  }

  async function generateBlueprintPreview() {
    if (!draft.title || !draft.abstract) return showToast("request", "اكتب اسم المشروع والشرح أولاً لتوليد التصميم");
    setBlueprintLoading(true);
    try {
      const result = await api("/features/project-blueprint", token, {
        method: "POST",
        body: JSON.stringify({ idea: `${draft.title}\n${draft.abstract}`, techStack: draft.techStack })
      });
      setBlueprintPreview(result);
      showToast("request", "تم توليد التصميم الأولي للمشروع");
    } finally {
      setBlueprintLoading(false);
    }
  }

  async function runAdvancedAiAdvisor() {
    if (!draft.title || !draft.abstract) return showToast("request", "اكتب اسم المشروع والشرح أولاً لتشغيل التحليل الذكي");
    setAiAdvisorLoading(true);
    try {
      const body = { title: draft.title, abstract: draft.abstract, techStack: draft.techStack };
      const [matches, concept, roadmap] = await Promise.all([
        api("/ai/advanced-match", token, { method: "POST", body: JSON.stringify(body) }),
        api("/ai/concept-check", token, { method: "POST", body: JSON.stringify(body) }),
        api("/ai/roadmap", token, { method: "POST", body: JSON.stringify({ ...body, durationWeeks: 12 }) })
      ]);
      setAiAdvisor({ matches, concept, roadmap });
      const bestSupervisor = matches.supervisors?.[0];
      if (bestSupervisor?.supervisor_id) {
        setDraft((current) => ({ ...current, preferredSupervisorId: String(bestSupervisor.supervisor_id) }));
      }
      showToast("request", "تم تشغيل التحليل الذكي الشامل للمقترح");
    } catch (err) {
      showToast("request", err.message || "تعذر تشغيل التحليل الذكي");
    } finally {
      setAiAdvisorLoading(false);
    }
  }

  async function sendProfileUpdateRequest(event) {
    event.preventDefault();
    await api("/messages/profile-update-request", token, { method: "POST", body: JSON.stringify({ body: profileUpdateBody }) });
    showToast("profile", "تم إرسال طلب تعديل الملف إلى الإدارة");
    setProfileUpdateBody("");
    setProfileUpdateOpen(false);
  }

  async function uploadProfilePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("avatar", file);
    try {
      setSession(await api("/auth/avatar", token, { method: "POST", body: form }));
      showToast("profile", "تم تحديث الصورة الشخصية، صار فيك تفتح باقي الخيارات");
    } catch (err) {
      showToast("profile", err.message);
    } finally {
      event.target.value = "";
    }
  }

  async function submitChapter(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const projectId = data.projects[0]?.id;
    if (!projectId) return showToast("submissions", "أنشئ مقترح مشروع أولاً قبل رفع الفصول");
    await api(`/projects/${projectId}/submissions`, token, { method: "POST", body: form });
    showToast("submissions", "تم رفع الفصل بنجاح");
    event.currentTarget.reset();
    await load();
  }

  async function analyzeSubmission(submissionId) {
    setAnalyzingSubmissionId(submissionId);
    try {
      const result = await api(`/ai/analyze-submission/${submissionId}`, token, { method: "POST" });
      setDocumentAnalyses((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      showToast("submissions", "تم تحليل الملف بالمساعد الشخصي");
    } finally {
      setAnalyzingSubmissionId("");
    }
  }

  async function gradeSubmission(submissionId) {
    setGradingSubmissionId(submissionId);
    try {
      const result = await api(`/ai/grade-submission/${submissionId}`, token, { method: "POST" });
      setThesisGrade(result);
      showToast("submissions", "تم توليد تقييم الأطروحة المساعد");
    } catch (err) {
      showToast("submissions", err.message || "تعذر تقييم الأطروحة");
    } finally {
      setGradingSubmissionId("");
    }
  }

  async function requestMeeting(event) {
    event.preventDefault();
    if (!activeProject) return showToast("overview", "لا يوجد مشروع لطلب اجتماع حوله");
    await api(`/projects/${activeProject.id}/meeting-request`, token, {
      method: "POST",
      body: JSON.stringify(meetingRequest)
    });
    showToast("overview", "تم إرسال طلب الاجتماع إلى المشرف");
    setMeetingRequest({ desiredAt: "", notes: "" });
    await load();
  }

  if (!data) return <p>جاري التحميل...</p>;
  const activeProject = data.projects.find((project) => !project.is_archived && project.status !== "rejected");
  const preferredSupervisor = activeProject?.preferred_supervisor_id
    ? data.supervisors.find((supervisor) => supervisor.id === activeProject.preferred_supervisor_id)
    : null;
  const diagramSupervisorId = data.student?.supervisor_id || activeProject?.preferred_supervisor_id || "";
  const waitingForSupervisor = activeProject?.status === "pending_review";
  const requestLocked = Boolean(activeProject);
  const canEditProject = activeProject && ["approved", "revision_requested"].includes(activeProject.status);
  const statusLabels = {
    pending_review: "بانتظار مراجعة المشرف",
    approved: "مقبول",
    revision_requested: "بحاجة إلى تعديل",
    rejected: "مرفوض"
  };
  const completedMilestones = data.milestones.filter((item) => item.status === "done" || item.completed_at).length;
  const milestoneProgress = data.milestones.length ? Math.round((completedMilestones / data.milestones.length) * 100) : 0;
  const readiness = Math.min(100, (activeProject ? 35 : 0) + Math.round(milestoneProgress * 0.45) + Math.min(20, data.submissions.length * 10));
  const projectTech = activeProject?.tech_stack?.length ? activeProject.tech_stack : draft.techStack.split(/[,،]/).map((item) => item.trim()).filter(Boolean);
  const selectableSupervisors = data.supervisors.filter(canSelectSupervisor);
  const suggestedSupervisors = [...selectableSupervisors]
    .map((supervisor) => {
      const hits = (supervisor.expertise_keywords || []).filter((keyword) => projectTech.some((tech) => keyword.toLowerCase().includes(tech.toLowerCase()) || tech.toLowerCase().includes(keyword.toLowerCase())));
      return { ...supervisor, hits };
    })
    .filter((supervisor) => supervisor.hits.length)
    .sort((a, b) => b.hits.length - a.hits.length)
    .slice(0, 3);
  const selectedDraftSupervisor = data.supervisors.find((supervisor) => String(supervisor.id) === String(draft.preferredSupervisorId));
  const feedbackItems = [
    ...(activeProject?.supervisor_feedback ? [{ id: "project-feedback", label: "ملاحظة على المشروع", body: activeProject.supervisor_feedback }] : []),
    ...data.submissions.filter((item) => item.feedback).map((item) => ({ id: `submission-${item.id}`, label: item.chapter_name, body: item.feedback }))
  ];
  const nextMilestone = data.milestones.find((item) => !item.completed_at && item.status !== "done");
  const nextStep = !activeProject
    ? "ابدأ بإرسال طلب المشروع إلى المشرف المناسب."
    : waitingForSupervisor
      ? "طلبك وصل إلى المشرف. بعد المراجعة سيظهر القرار والملاحظات."
      : activeProject.status === "revision_requested"
        ? "راجع ملاحظات المشرف ثم ارفع النسخة المعدلة من الملفات."
        : activeProject.status === "approved"
          ? "المشروع مقبول. تابع رفع الفصول حسب المخطط الزمني."
          : "تابع مراجعة المشرف واستكمل الملفات المطلوبة.";
  const latestAnalysis = documentAnalyses[0];
  return (
    <div className="grid gap-6">
      {toast.message && toast.section === activeSection && <div className="toast">{toast.message}</div>}
      {activeSection === "profile" && <section className="grid gap-6">
        <div className="panel">
          <h2 className="panel-title">الملف التعريفي</h2>
          <div className="mt-4 grid gap-3">
            <div className="rounded-lg border border-emerald-900/10 bg-green-50 p-3 dark:border-white/10 dark:bg-emerald-950/40">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={user.fullName} src={user.avatarUrl} size="md" />
                  <div>
                    <p className="font-extrabold text-nile dark:text-emerald-100">الصورة الشخصية</p>
                    <p className="mt-1 text-xs leading-6 text-zinc-600 dark:text-zinc-300">
                      {user.avatarUrl ? "صورتك مضافة، وباقي خيارات الطالب مفتوحة." : "أضف صورتك الشخصية لتفعيل باقي خيارات الطالب."}
                    </p>
                  </div>
                </div>
                {!user.avatarUrl && (
                  <label className="primary-btn mt-0 w-full cursor-pointer justify-center py-2 text-sm sm:w-auto">
                    <Camera size={17} />
                    رفع الصورة
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadProfilePhoto} />
                  </label>
                )}
              </div>
            </div>
            {!user.avatarUrl && <div className="toast">ارفع صورتك الشخصية أولاً ليتم فتح باقي خيارات الطالب.</div>}
            <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
              <p className="text-xs font-bold text-zinc-500">الاسم</p>
              <p className="mt-1 text-lg font-extrabold">{user.fullName}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard compact icon={User} label="الرقم الجامعي" value={data.student.student_id} />
              <MetricCard compact icon={FileText} label="المشاريع المنجزة" value={data.profileStats?.completed_projects || 0} />
              <MetricCard compact icon={CheckCircle2} label="المعدل" value={data.profileStats?.average_score ?? "غير محدد"} />
              <MetricCard compact icon={Users} label="القسم" value={data.student.department} />
            </div>
            <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
              <p className="text-xs font-bold text-zinc-500">المشرف الحالي</p>
              <p className="mt-1 font-extrabold">{data.student.supervisor_id ? `#${data.student.supervisor_id}` : "لم يتم تعيين مشرف بعد"}</p>
            </div>
          </div>
        </div>
        <div className="panel">
          <button type="button" onClick={() => setProfileUpdateOpen(!profileUpdateOpen)} className="secondary-btn">
            <Pencil size={16} /> طلب تعديل بيانات
          </button>
          {profileUpdateOpen && (
            <form onSubmit={sendProfileUpdateRequest} className="mt-4">
              <h2 className="panel-title">طلب تعديل بياناتي</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">إذا كان هناك خطأ باسمك، رقمك الجامعي، القسم، أو أي معلومة أساسية، اكتب المطلوب وسيصل الطلب للإدارة.</p>
              <div className="mt-4 grid gap-3">
                <textarea className="field mt-0 min-h-28" placeholder="مثال: يوجد خطأ في الرقم الجامعي، الرقم الصحيح هو..." value={profileUpdateBody} onChange={(event) => setProfileUpdateBody(event.target.value)} required />
                <button className="primary-btn mt-0 lg:h-12"><Send size={18} /> إرسال طلب التعديل</button>
              </div>
            </form>
          )}
        </div>
      </section>}
      {activeSection === "overview" && <>
        <section className="panel">
          <h2 className="panel-title">المخطط الزمني</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {data.milestones.map((item) => (
              <div key={item.id} className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
                <CheckCircle2 className={classNames("mb-2", item.status === "done" || item.completed_at ? "text-nile" : "text-zinc-400")} />
                <p className="font-bold">{item.title}</p>
                <p className="mt-1 text-xs font-bold text-zinc-500">{milestoneStatusLabel(item)}</p>
                <p className="text-xs text-zinc-500">{formatDate(item.due_date)}</p>
              </div>
            ))}
            {!data.milestones.length && <EmptyState>لا توجد مراحل بعد.</EmptyState>}
          </div>
        </section>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard compact icon={FileText} label="المشاريع" value={data.projects.length} />
          <MetricCard compact icon={Users} label="المشرفون المتاحون" value={selectableSupervisors.length} />
          <MetricCard compact icon={CalendarDays} label="المراحل" value={data.milestones.length} />
          <MetricCard compact icon={Bell} label="التنبيهات" value={data.notifications.length} />
          <MetricCard compact icon={CheckCircle2} label="جاهزية المشروع" value={`${readiness}%`} />
        </section>
        <section className="grid gap-6">
          <div className="panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-zinc-500">المشروع الحالي</p>
                <h2 className="mt-2 text-2xl font-black">{activeProject?.title || "لا يوجد مشروع معتمد بعد"}</h2>
              </div>
              {activeProject ? (
                <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-extrabold text-nile">
                  {statusLabels[activeProject.status] || activeProject.status}
                </span>
              ) : (
                <button type="button" onClick={() => setActiveSection("request")} className="rounded-lg bg-green-50 px-3 py-2 text-sm font-extrabold text-nile transition hover:bg-emerald-100">
                  إبدأ الطلب
                </button>
              )}
            </div>
            <p className="mt-4 leading-7 text-zinc-600 dark:text-zinc-300">
              {activeProject?.abstract || "استخدم قسم طلب المشروع لإدخال اسم المشروع وشرح مختصر، ثم اعرض المشاريع المشابهة قبل إرسال الطلب للإدارة."}
            </p>
            <div className="mt-6">
              <div className="flex items-center justify-between text-sm font-bold">
                <span>تقدم المراحل</span>
                <span>{completedMilestones}/{data.milestones.length || 0}</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div className="h-full rounded-full bg-nile transition-all" style={{ width: `${milestoneProgress}%` }} />
              </div>
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm font-bold">
                <span>نسبة الجاهزية</span>
                <span>{readiness}%</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${readiness}%` }} />
              </div>
            </div>
          </div>
          <div className="panel">
            <h2 className="panel-title">ملاحظات المشرف</h2>
            <div className="mt-4 grid gap-3">
              {feedbackItems.map((item) => (
                <div key={item.id} className="rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
                  <p className="font-extrabold">{item.label}</p>
                  <p className="mt-2 leading-7 text-zinc-600 dark:text-zinc-300">{item.body}</p>
                </div>
              ))}
              {!feedbackItems.length && <EmptyState>لا توجد ملاحظات من المشرف حالياً.</EmptyState>}
            </div>
          </div>
        </section>
      </>}
      {activeSection === "request" && <section className="grid gap-6">
        <div className="panel">
          <h2 className="panel-title">طلب مشروع جديد</h2>
          {activeProject && (
            <div className="mt-4 grid gap-3">
              <div className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
                <p className="text-sm text-zinc-500">المشروع الحالي</p>
                <p className="mt-1 font-extrabold">{activeProject.title}</p>
                <p className="mt-2 text-sm">{activeProject.abstract}</p>
                <p className="mt-2 text-sm font-bold text-nile">
                  المشرف المختار: {preferredSupervisor?.full_name || "غير محدد"}
                </p>
              {activeProject.tech_stack?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeProject.tech_stack.map((item) => <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-nile dark:bg-zinc-900">{item}</span>)}
                  </div>
                )}
                {activeProject.blueprint && (
                  <div className="mt-4 rounded-lg bg-white p-3 text-sm dark:bg-zinc-900">
                    <p className="font-extrabold text-nile">التصميم الأولي المحفوظ</p>
                    <p className="mt-1 text-zinc-500">المجال: {activeProject.blueprint.domain}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(activeProject.blueprint.tables || []).slice(0, 6).map((table) => (
                        <span key={table.name} className="rounded-full bg-green-50 px-2 py-1 text-xs font-bold text-nile dark:bg-emerald-950">{table.name}</span>
                      ))}
                    </div>
                    {activeProject.reviewed_at && (
                      <p className="mt-3 text-xs font-bold text-nile">
                        تقييم المشرف: الجداول {activeProject.tables_score || "-"}، العلاقات {activeProject.relationships_score || "-"}، المخططات {activeProject.diagrams_score || "-"}، قابلية التنفيذ {activeProject.feasibility_score || "-"}
                      </p>
                    )}
                    {activeProject.supervisor_notes && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{activeProject.supervisor_notes}</p>}
                  </div>
                )}
              </div>
              <div className={classNames("rounded-lg p-4 text-sm font-bold", waitingForSupervisor ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-100" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100")}>
                {statusLabels[activeProject.status] || activeProject.status}
              </div>
              {waitingForSupervisor && <EmptyState>المشروع بانتظار قراءة المشرف واتخاذ القرار.</EmptyState>}
            </div>
          )}
          <form onSubmit={submitProposal} className="mt-4 grid gap-4">
            {requestLocked && (
              <div className="rounded-lg bg-amber-50 p-4 text-sm font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-100">
                لا يمكنك تسجيل مشروع جديد خلال نفس الفصل. إذا احتاج المشروع تعديلاً، تابع تعديل نفس الطلب مع المشرف.
              </div>
            )}
            <fieldset disabled={requestLocked} className="grid gap-4 disabled:opacity-60">
            <input name="title" placeholder="اسم المشروع" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="field mt-0" required />
            <textarea name="abstract" placeholder="شرح بسيط عن المشروع والكلمات المفتاحية" value={draft.abstract} onChange={(e) => setDraft({ ...draft, abstract: e.target.value })} className="field min-h-28" required />
            <input
              name="techStack"
              placeholder="اللغات والتقنيات المستخدمة: Python, Flutter, PostgreSQL"
              value={draft.techStack}
              onChange={(event) => setDraft({ ...draft, techStack: event.target.value })}
              className="field mt-0"
            />
            <div className="rounded-lg border border-emerald-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h3 className="font-extrabold">مشرفون مناسبون للتقنيات</h3>
              <div className="mt-4 grid gap-3">
                {suggestedSupervisors.map((supervisor) => (
                  <button
                    key={supervisor.id}
                    type="button"
                    onClick={() => selectPreferredSupervisor(supervisor)}
                    className={classNames(
                      "rounded-lg border p-4 text-right transition",
                      String(draft.preferredSupervisorId) === String(supervisor.id) ? "border-nile bg-green-50 dark:bg-emerald-950" : "border-black/10 bg-zinc-50 hover:border-nile dark:border-white/10 dark:bg-zinc-800",
                      !canSelectSupervisor(supervisor) && "opacity-60"
                    )}
                  >
                    <span className="block font-extrabold">{supervisor.full_name}</span>
                    <span className="mt-1 block text-sm text-zinc-500">تطابق: {supervisor.hits.join("، ")}</span>
                    <span className="mt-1 block text-sm font-bold text-nile">{supervisor.current_load}/{supervisor.max_students_capacity} طلاب</span>
                    {!isSupervisorReady(supervisor) && <span className="mt-1 block text-sm font-extrabold text-amber-700">ملف المشرف غير مكتمل</span>}
                    {isSupervisorFull(supervisor) && <span className="mt-1 block text-sm font-extrabold text-red-700">العدد مكتمل</span>}
                  </button>
                ))}
                {!suggestedSupervisors.length && <EmptyState>أضف تقنيات المشروع ليظهر مشرفون مناسبون تلقائياً.</EmptyState>}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-950/10 bg-green-50/60 p-4 dark:border-white/10 dark:bg-emerald-950/30">
              <label className="block text-sm font-extrabold">اختر المشرف الذي تريد التسجيل عنده</label>
              <select
                name="preferredSupervisorId"
                value={draft.preferredSupervisorId}
                onChange={(event) => selectPreferredSupervisor(data.supervisors.find((supervisor) => String(supervisor.id) === String(event.target.value)))}
                className="field"
                required
              >
                <option value="">اختر مشرف</option>
                {data.supervisors.map((supervisor) => (
                  <option key={supervisor.id} value={supervisor.id} disabled={!canSelectSupervisor(supervisor)}>
                    {supervisor.full_name} - {supervisor.current_load}/{supervisor.max_students_capacity} طلاب{!isSupervisorReady(supervisor) ? " - ملف غير مكتمل" : isSupervisorFull(supervisor) ? " - العدد مكتمل" : ""}
                  </option>
                ))}
              </select>
              {selectedDraftSupervisor && !canSelectSupervisor(selectedDraftSupervisor) && (
                <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-extrabold text-red-700 dark:bg-red-950 dark:text-red-100">
                  {!isSupervisorReady(selectedDraftSupervisor) ? "لا يمكن التسجيل عند هذا المشرف لأن ملفه غير مكتمل حالياً." : "لا يمكنك التسجيل عند هذا المشرف لأن العدد مكتمل لديه."}
                </div>
              )}
              <div className="mt-4 grid gap-3">
                {data.supervisors.map((supervisor) => {
                  const selected = String(draft.preferredSupervisorId) === String(supervisor.id);
                  const capacity = Math.max(supervisor.max_students_capacity || 1, 1);
                  const percent = Math.min(100, Math.round((supervisor.current_load / capacity) * 100));
                  return (
                    <button
                      key={supervisor.id}
                      type="button"
                      onClick={() => selectPreferredSupervisor(supervisor)}
                      className={classNames(
                        "rounded-lg border p-4 text-right transition",
                        selected ? "border-nile bg-white shadow-sm dark:bg-zinc-900" : "border-black/10 bg-white/70 hover:border-nile dark:border-white/10 dark:bg-zinc-900/70",
                        !canSelectSupervisor(supervisor) && "opacity-60"
                      )}
                    >
                      <span className="block font-extrabold">{supervisor.full_name}</span>
                      <span className="mt-1 block text-sm text-zinc-500">{supervisor.department}</span>
                      <span className="mt-3 flex flex-wrap gap-1">
                        {(supervisor.expertise_keywords || []).slice(0, 4).map((keyword) => (
                          <span key={keyword} className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-bold text-nile dark:bg-emerald-950">{keyword}</span>
                        ))}
                      </span>
                      <span className="mt-3 block text-sm font-bold text-nile">{supervisor.current_load}/{supervisor.max_students_capacity} طلاب</span>
                      {!isSupervisorReady(supervisor) && <span className="mt-1 block text-sm font-extrabold text-amber-700">ملف المشرف غير مكتمل حالياً</span>}
                      {isSupervisorFull(supervisor) && <span className="mt-1 block text-sm font-extrabold text-red-700">العدد مكتمل ولا يمكن التسجيل عنده</span>}
                      <span className="mt-2 block h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <span className="block h-full rounded-full bg-nile" style={{ width: `${percent}%` }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-extrabold text-nile">التحليل الذكي الشامل</p>
                  <p className="mt-1 text-sm text-zinc-500">يفحص تكرار الفكرة، يقترح المشرفين والشركاء، ويولد خطة زمنية أولية.</p>
                </div>
                <button type="button" onClick={runAdvancedAiAdvisor} disabled={aiAdvisorLoading} className="secondary-btn">
                  <Bot size={16} /> {aiAdvisorLoading ? "جاري التحليل..." : "تشغيل التحليل"}
                </button>
              </div>
              {aiAdvisor && (
                <div className="mt-4 grid gap-3">
                  <div className={classNames(
                    "rounded-lg p-3 text-sm font-bold",
                    aiAdvisor.concept.duplicate_risk === "high" ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-100" :
                      aiAdvisor.concept.duplicate_risk === "medium" ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-100" :
                        "bg-green-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
                  )}>
                    فحص التكرار الفكري: {aiAdvisor.concept.max_similarity}% - {aiAdvisor.concept.duplicate_risk}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
                      <p className="font-extrabold">أفضل المشرفين</p>
                      <div className="mt-3 grid gap-2">
                        {(aiAdvisor.matches.supervisors || []).slice(0, 3).map((item) => (
                          <button
                            key={item.supervisor_id}
                            type="button"
                            onClick={() => setDraft({ ...draft, preferredSupervisorId: String(item.supervisor_id) })}
                            className="rounded-lg bg-white p-3 text-right text-sm transition hover:bg-green-50 dark:bg-zinc-900 dark:hover:bg-emerald-950"
                          >
                            <span className="font-extrabold">{item.name}</span>
                            <span className="mx-2 font-bold text-nile">{item.match_score}%</span>
                            <span className="mt-1 block text-xs text-zinc-500">{(item.shared_keywords || []).join("، ") || "تشابه في الوصف والخبرة"}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
                      <p className="font-extrabold">شركاء مقترحون</p>
                      <div className="mt-3 grid gap-2">
                        {(aiAdvisor.matches.teammates || []).slice(0, 3).map((item) => (
                          <div key={item.student_id} className="rounded-lg bg-white p-3 text-sm dark:bg-zinc-900">
                            <span className="font-extrabold">{item.name}</span>
                            <span className="mx-2 font-bold text-nile">{item.match_score}%</span>
                            <span className="mt-1 block text-xs text-zinc-500">{(item.complementary_skills || []).join("، ") || "مهارات قريبة من فكرة المشروع"}</span>
                          </div>
                        ))}
                        {!aiAdvisor.matches.teammates?.length && <p className="text-sm font-bold text-zinc-500">لا توجد اقتراحات شركاء كافية حالياً.</p>}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
                    <p className="font-extrabold">الخطة الزمنية المقترحة</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {(aiAdvisor.roadmap.milestones || []).slice(0, 6).map((item) => (
                        <div key={`${item.week_start}-${item.title}`} className="rounded-lg bg-white p-3 text-sm dark:bg-zinc-900">
                          <p className="font-extrabold">الأسبوع {item.week_start}-{item.week_end}: {item.title}</p>
                          <p className="mt-1 text-xs text-zinc-500">{item.deliverable}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="rounded-lg border border-emerald-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-extrabold text-nile">التصميم الأولي للمشروع</p>
                  <p className="mt-1 text-sm text-zinc-500">يتم حفظه مع الطلب حتى يراجعه المشرف ويقيّمه.</p>
                </div>
                <button type="button" onClick={generateBlueprintPreview} disabled={blueprintLoading} className="secondary-btn">
                  <Bot size={16} /> {blueprintLoading ? "جاري التوليد..." : "توليد Blueprint"}
                </button>
              </div>
              {blueprintPreview && (
                <div className="mt-4 grid gap-3">
                  <div className="rounded-lg bg-green-50 p-3 dark:bg-emerald-950/40">
                    <p className="font-extrabold">المجال: {blueprintPreview.domain}</p>
                    <p className="mt-1 text-sm text-zinc-500">الثقة: {blueprintPreview.confidence}% · الجداول: {blueprintPreview.tables?.length || 0} · العلاقات: {blueprintPreview.relationships?.length || 0}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(blueprintPreview.tables || []).slice(0, 10).map((table) => (
                      <span key={table.name} className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-nile dark:bg-emerald-950">{table.name}</span>
                    ))}
                  </div>
                  <div className="rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
                    <p className="font-extrabold">أهم العلاقات</p>
                    <ul className="mt-2 list-inside list-disc leading-7">
                      {(blueprintPreview.relationships || []).slice(0, 6).map((relation) => <li key={relation}>{relation}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={findSimilarProjects} className="secondary-btn" disabled={similarLoading}>
                {similarLoading ? "جاري العرض..." : "عرض مشاريع مشابهة"}
              </button>
              <button className="primary-btn mt-0" disabled={selectedDraftSupervisor && !canSelectSupervisor(selectedDraftSupervisor)}>تأكيد وإرسال الطلب</button>
            </div>
            </fieldset>
            <div className="grid gap-3">
              {similarProjects.map((project) => (
                <div key={project.id} className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
                  <p className="font-extrabold">{project.title}</p>
                  <p className="mt-1 text-zinc-500">{project.student_name} - {project.department || "هندسة المعلومات"} - {project.match_type === "similar" ? "مشابه" : "مشروع سابق"}</p>
                  <p className="mt-1 text-xs font-bold text-nile">سبب التشابه: {project.match_reason}</p>
                  {project.tech_stack?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {project.tech_stack.map((item) => <span key={item} className="rounded-full bg-green-50 px-2 py-1 text-xs font-bold text-nile dark:bg-emerald-950">{item}</span>)}
                    </div>
                  )}
                  <p className="mt-2 text-zinc-600 dark:text-zinc-300">{project.abstract}</p>
                </div>
              ))}
              {!similarProjects.length && <EmptyState>اضغط عرض مشاريع مشابهة لرؤية مشاريع سابقة من هندسة المعلومات قبل تأكيد الطلب.</EmptyState>}
            </div>
          </form>
        </div>
      </section>}
      {activeSection === "matches" && <section className="grid gap-6">
        <div className="panel">
          <h2 className="panel-title">المشرفون</h2>
          <div className="mt-4 grid gap-4">
            {data.supervisors.map((supervisor) => (
              <div key={supervisor.id} className="rounded-lg border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-extrabold">{supervisor.full_name}</p>
                    <p className="mt-1 text-sm text-zinc-500">{supervisor.department}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                    {supervisor.current_load}/{supervisor.max_students_capacity} طلاب
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!isSupervisorReady(supervisor) && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-100">ملف غير مكتمل</span>}
                  {isSupervisorReady(supervisor) && isSupervisorFull(supervisor) && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-extrabold text-red-700 dark:bg-red-950 dark:text-red-100">العدد مكتمل</span>}
                  {canSelectSupervisor(supervisor) && <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-extrabold text-nile dark:bg-emerald-950 dark:text-emerald-100">متاح للتسجيل</span>}
                </div>
                <p className="mt-4 text-sm leading-7 text-zinc-600 dark:text-zinc-300">{supervisor.bio || "لا توجد نبذة مضافة بعد."}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(supervisor.expertise_keywords || []).map((keyword) => (
                    <span key={keyword} className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-nile dark:bg-emerald-950 dark:text-emerald-100">{keyword}</span>
                  ))}
                </div>
                <div className="mt-4 rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
                  <p className="text-zinc-500">التواصل</p>
                  <a className="mt-1 block font-bold text-nile underline" href={`mailto:${supervisor.email}`}>{supervisor.email}</a>
                  <a className="mt-1 block font-bold text-nile underline" href={`tel:${String(supervisor.phone || "").replaceAll(" ", "")}`}>{supervisor.phone || "رقم التواصل غير محدد"}</a>
                </div>
              </div>
            ))}
            {!data.supervisors.length && <EmptyState>لا توجد بيانات مشرفين حالياً.</EmptyState>}
          </div>
        </div>
        <div className="panel">
          <h2 className="panel-title">مدرّسو المخابر المساعدون</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">مصادر تقنية مساعدة للغات والأطر، ولا يملكون حسابات دخول على النظام.</p>
          <div className="mt-4 grid gap-4">
            {(data.labHelpers || []).map((helper) => (
              <div key={helper.id} className="rounded-lg border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-extrabold">{helper.full_name}</p>
                    <p className="mt-1 text-sm text-zinc-500">{helper.department}</p>
                  </div>
                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-nile dark:bg-emerald-950 dark:text-emerald-100">مساعدة مخبرية</span>
                </div>
                <p className="mt-4 text-sm leading-7 text-zinc-600 dark:text-zinc-300">{helper.bio || "يمكنه مساعدة الطلاب في الجوانب التقنية للمشاريع."}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[...(helper.languages || []), ...(helper.frameworks || [])].map((item) => (
                    <span key={item} className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-nile dark:bg-emerald-950 dark:text-emerald-100">{item}</span>
                  ))}
                </div>
                {helper.contact && (
                  <div className="mt-4 rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
                    <p className="text-zinc-500">التواصل</p>
                    <p className="mt-1 font-bold text-nile">{helper.contact}</p>
                  </div>
                )}
              </div>
            ))}
            {!(data.labHelpers || []).length && <EmptyState>لا توجد مصادر مساعدة من المخابر حالياً.</EmptyState>}
          </div>
        </div>
      </section>}
      {activeSection === "meetingRequest" && <section className="grid gap-6">
        <form onSubmit={requestMeeting} className="panel">
          <h2 className="panel-title">طلب اجتماع مع المشرف</h2>
          <input className="field" type="datetime-local" value={meetingRequest.desiredAt} onChange={(event) => setMeetingRequest({ ...meetingRequest, desiredAt: event.target.value })} {...DATETIME_INPUT_LIMITS} required />
          <textarea className="field min-h-24" placeholder="ملاحظات الاجتماع أو سبب الطلب" value={meetingRequest.notes} onChange={(event) => setMeetingRequest({ ...meetingRequest, notes: event.target.value })} />
          <button className="primary-btn"><CalendarDays size={18} /> إرسال طلب الاجتماع</button>
          <div className="mt-4 grid gap-2">
            {data.meetings.map((meeting) => (
              <div key={meeting.id} className="rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
                <p className="font-bold">{meeting.supervisor_name}</p>
                <p className="text-zinc-500">{new Date(meeting.scheduled_at).toLocaleString("ar")} - {meeting.status}</p>
              </div>
            ))}
            {!data.meetings.length && <EmptyState>لا توجد طلبات أو اجتماعات بعد.</EmptyState>}
          </div>
        </form>
      </section>}
      {activeSection === "submissions" && <section className="grid gap-6">
        <div className="panel">
          <h2 className="panel-title">رفع الفصول</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <a href="/templates/project-instructions.docx" download className="flex items-center justify-between gap-4 rounded-lg border border-emerald-900/10 bg-green-50 p-4 text-nile transition hover:bg-emerald-100 dark:border-white/10 dark:bg-emerald-950/40 dark:text-emerald-100">
              <span>
                <span className="block font-extrabold">ملاحظات الأطروحة</span>
                <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-300">تعليمات عامة تساعدك أثناء كتابة المشروع.</span>
              </span>
              <Download size={22} className="shrink-0" />
            </a>
            <a href="/templates/thesis-template.docx" download className="flex items-center justify-between gap-4 rounded-lg border border-emerald-900/10 bg-green-50 p-4 text-nile transition hover:bg-emerald-100 dark:border-white/10 dark:bg-emerald-950/40 dark:text-emerald-100">
              <span>
                <span className="block font-extrabold">قالب عام للمشروع</span>
                <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-300">قالب Word جاهز ليبدأ الطالب العمل عليه.</span>
              </span>
              <Download size={22} className="shrink-0" />
            </a>
          </div>
          {canEditProject ? (
            <form onSubmit={submitChapter} className="mt-4 grid gap-3">
              <input name="chapterName" className="field mt-0" placeholder="اسم الفصل: Chapter 1" required />
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-sm font-bold dark:border-zinc-700">
                <Upload size={18} /> رفع ملف الفصل PDF/DOCX
                <input name="file" type="file" accept=".pdf,.docx" className="hidden" required />
              </label>
              <button className="primary-btn mt-0">رفع الفصل</button>
            </form>
          ) : <div className="mt-4"><EmptyState>رفع الفصول يفتح بعد قبول المشروع من المشرف.</EmptyState></div>}
          <div className="mt-4 grid gap-3">
            {data.submissions.map((item) => (
              <div key={item.id} className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">{item.chapter_name}</p>
                    <p className="text-sm text-zinc-500">AI readiness: {item.score ?? "بانتظار التقييم"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => analyzeSubmission(item.id)} disabled={analyzingSubmissionId === item.id} className="secondary-btn py-2 text-sm disabled:opacity-60">
                      {analyzingSubmissionId === item.id ? "جاري التحليل..." : "تحليل بالمساعد"}
                    </button>
                    <button type="button" onClick={() => gradeSubmission(item.id)} disabled={gradingSubmissionId === item.id} className="secondary-btn py-2 text-sm disabled:opacity-60">
                      {gradingSubmissionId === item.id ? "جاري التقييم..." : "تقييم الأطروحة"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!data.submissions.length && <EmptyState>لم يتم رفع أي فصل بعد.</EmptyState>}
          </div>
          {thesisGrade && (
            <div className="mt-6 rounded-lg border border-emerald-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h3 className="text-lg font-extrabold text-nile">تقييم الأطروحة المساعد</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard compact icon={CheckCircle2} label="الدرجة العامة" value={`${thesisGrade.overall_grade}%`} />
                <MetricCard compact icon={FileText} label="البنية" value={`${thesisGrade.rubric?.structure || 0}/10`} />
                <MetricCard compact icon={FileText} label="المراجع" value={`${thesisGrade.rubric?.formatting_and_references || 0}/10`} />
                <MetricCard compact icon={FileText} label="عمق المحتوى" value={`${thesisGrade.rubric?.content_depth || 0}/10`} />
              </div>
              <div className="mt-4 rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
                <p className="font-extrabold">ملخص سريع</p>
                <p className="mt-2 leading-7 text-zinc-600 dark:text-zinc-300">{thesisGrade.summary || "لا يوجد ملخص كاف."}</p>
              </div>
              <div className="mt-4 grid gap-2">
                {(thesisGrade.recommendations || []).map((item) => (
                  <p key={item} className="rounded-lg bg-green-50 p-3 text-sm font-bold text-nile dark:bg-emerald-950 dark:text-emerald-100">{item}</p>
                ))}
              </div>
            </div>
          )}
          {latestAnalysis && (
            <div className="mt-6 rounded-lg border border-emerald-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h3 className="text-lg font-extrabold text-nile">نتيجة المساعد الشخصي</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetricCard compact icon={CheckCircle2} label="جاهزية النص" value={`${latestAnalysis.analysis.readiness}%`} />
                <MetricCard compact icon={FileText} label="عدد الكلمات" value={latestAnalysis.analysis.word_count} />
                <MetricCard compact icon={FileText} label="الأحرف المحللة" value={latestAnalysis.analysis.analyzed_characters} />
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="font-extrabold">ملاحظات لغوية ونحوية</p>
                  <div className="mt-2 grid gap-2">
                    {latestAnalysis.analysis.grammar_notes.map((note, index) => (
                      <div key={`${note.type}-${index}`} className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
                        <p className="font-bold text-nile">{note.type}</p>
                        <p className="mt-1 text-zinc-600 dark:text-zinc-300">{note.text}</p>
                        <p className="mt-1 font-bold">{note.suggestion}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-extrabold">توصيات تحسين الأطروحة</p>
                  <div className="mt-2 grid gap-2">
                    {latestAnalysis.analysis.recommendations.map((item) => (
                      <p key={item} className="rounded-lg bg-green-50 p-3 text-sm font-bold text-nile dark:bg-emerald-950 dark:text-emerald-100">{item}</p>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-4">
                <p className="font-extrabold">مخططات Mermaid المقترحة</p>
                {Object.entries(latestAnalysis.analysis.diagrams || {}).map(([name, code]) => (
                  <div key={name} className="rounded-lg bg-zinc-950 p-4 text-left text-xs text-emerald-100" dir="ltr">
                    <p className="mb-2 font-bold text-white">{name}</p>
                    <pre className="overflow-x-auto whitespace-pre-wrap">{code}</pre>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-zinc-500">{latestAnalysis.analysis.note}</p>
            </div>
          )}
        </div>
      </section>}
      {activeSection === "calendar" && <section className="grid gap-6">
        <div className="panel">
          <h2 className="panel-title">التقويم الأكاديمي</h2>
          <div className="mt-4 grid gap-3">
            {data.deadlines.map((item) => <div key={item.id} className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800"><p className="font-bold">{item.title}</p><p className="text-sm text-zinc-500">{item.due_date?.slice(0, 10)}</p></div>)}
            {!data.deadlines.length && <EmptyState>لا يوجد مواعيد معلنة بعد</EmptyState>}
          </div>
        </div>
      </section>}
      {activeSection === "surveys" && <SurveyList token={token} section="surveys" showToast={showToast} />}
      {activeSection === "ideas" && <FeatureHub token={token} role="student" supervisors={data.supervisors} showToast={showToast} section="ideas" mode="ideas" />}
      {activeSection === "library" && <FeatureHub token={token} role="student" supervisors={data.supervisors} showToast={showToast} section="library" mode="library" />}
      {activeSection === "diagramStudio" && (
        <Suspense fallback={<div className="panel text-sm font-bold text-zinc-500">جاري تحميل محرر المخططات...</div>}>
          <DiagramStudio token={token} supervisorId={diagramSupervisorId} showToast={showToast} />
        </Suspense>
      )}
    </div>
  );
}
