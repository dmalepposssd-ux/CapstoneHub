import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Search, UserPlus } from "lucide-react";
import { api } from "../api/client.js";
import { EmptyState } from "./common.jsx";
import { classNames, formatDate } from "../utils/helpers.js";

export default function FeatureHub({ token, role, supervisors = [], showToast, section = "ideas", mode = "ideas" }) {
  const [ideas, setIdeas] = useState([]);
  const [library, setLibrary] = useState([]);
  const [search, setSearch] = useState("");
  const [ideaForm, setIdeaForm] = useState({ title: "", description: "", department: "هندسة المعلومات", techStack: "", difficulty: "متوسط" });
  const [selectedSupervisors, setSelectedSupervisors] = useState({});

  async function load() {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    const [ideaRows, libraryRows] = await Promise.all([
      api(`/features/project-ideas${query}`, token),
      api(`/features/library${query}`, token)
    ]);
    setIdeas(ideaRows);
    setLibrary(libraryRows);
  }

  useEffect(() => { load(); }, []);

  async function createIdea(event) {
    event.preventDefault();
    await api("/features/project-ideas", token, { method: "POST", body: JSON.stringify(ideaForm) });
    setIdeaForm({ title: "", description: "", department: "هندسة المعلومات", techStack: "", difficulty: "متوسط" });
    showToast?.(section, "تمت إضافة فكرة المشروع");
    await load();
  }

  async function requestIdea(idea) {
    await api(`/features/project-ideas/${idea.id}/request`, token, {
      method: "POST",
      body: JSON.stringify({ preferredSupervisorId: selectedSupervisors[idea.id] || null })
    });
    showToast?.(section, "تم إرسال طلب المشروع من المشاريع المقترحة من الجامعة");
  }

  return (
    <section className="grid gap-6">
      {mode === "ideas" && (role === "admin" || role === "supervisor") && (
        <form onSubmit={createIdea} className="panel">
          <h2 className="panel-title">إضافة مشروع مقترح من الجامعة</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input className="field mt-0" placeholder="عنوان الفكرة" value={ideaForm.title} onChange={(event) => setIdeaForm({ ...ideaForm, title: event.target.value })} required />
            <select className="field mt-0" value={ideaForm.difficulty} onChange={(event) => setIdeaForm({ ...ideaForm, difficulty: event.target.value })}>
              <option>سهل</option>
              <option>متوسط</option>
              <option>متقدم</option>
            </select>
            <input className="field mt-0" placeholder="القسم" value={ideaForm.department} onChange={(event) => setIdeaForm({ ...ideaForm, department: event.target.value })} />
            <input className="field mt-0" placeholder="التقنيات: React, Python, PostgreSQL" value={ideaForm.techStack} onChange={(event) => setIdeaForm({ ...ideaForm, techStack: event.target.value })} />
            <textarea className="field mt-0 min-h-24 md:col-span-2" placeholder="وصف الفكرة والمخرجات المتوقعة" value={ideaForm.description} onChange={(event) => setIdeaForm({ ...ideaForm, description: event.target.value })} required />
          </div>
          <button className="primary-btn"><UserPlus size={18} /> إضافة الفكرة</button>
        </form>
      )}

      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="panel-title">{mode === "library" ? "مكتبة المشاريع" : "المشاريع المقترحة من الجامعة"}</h2>
          <label className="flex h-11 min-w-72 items-center gap-2 rounded-lg border border-emerald-950/15 bg-white px-3 dark:border-white/10 dark:bg-zinc-900">
            <Search size={18} className="text-nile" />
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="بحث بالتقنية أو العنوان..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <button type="button" onClick={load} className="secondary-btn py-2 text-sm">بحث</button>
        </div>
        {mode === "ideas" && <div className="mt-5 grid gap-4">
          <h3 className="font-extrabold text-nile">مشاريع مقترحة</h3>
          {ideas.map((idea) => (
            <div key={idea.id} className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold">{idea.title}</p>
                  <p className="mt-1 text-sm text-zinc-500">{idea.department} - {idea.difficulty}</p>
                </div>
                <span className="rounded-lg bg-green-50 px-3 py-1 text-xs font-extrabold text-nile dark:bg-emerald-950">مقترح جاهز</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">{idea.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">{(idea.tech_stack || []).map((item) => <span key={item} className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-nile dark:bg-emerald-950">{item}</span>)}</div>
              {role === "student" && (
                <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
                  <select className="field mt-0" value={selectedSupervisors[idea.id] || ""} onChange={(event) => setSelectedSupervisors({ ...selectedSupervisors, [idea.id]: event.target.value })}>
                    <option value="">اختر مشرفاً للطلب</option>
                    {supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.full_name} ({supervisor.current_load}/{supervisor.max_students_capacity})</option>)}
                  </select>
                  <button type="button" onClick={() => requestIdea(idea)} className="primary-btn mt-0"><CheckCircle2 size={18} /> طلب هذه الفكرة</button>
                </div>
              )}
            </div>
          ))}
          {!ideas.length && <EmptyState>لا توجد مشاريع مقترحة مطابقة حالياً.</EmptyState>}
        </div>}
        {mode === "library" && <div className="mt-5 grid gap-4">
          <h3 className="font-extrabold text-nile">مكتبة المشاريع السابقة</h3>
          {library.map((project) => (
            <div key={project.id} className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold">{project.title}</p>
                  <p className="mt-1 text-sm text-zinc-500">{project.student_name} - {project.supervisor_name || "مشرف غير محدد"}</p>
                </div>
                <span className="text-xs font-bold text-zinc-500">{formatDate(project.archived_at)}</span>
              </div>
              <p className="mt-3 text-sm leading-7">{project.abstract}</p>
              <div className="mt-3 flex flex-wrap gap-2">{(project.tech_stack || []).map((item) => <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-nile dark:bg-zinc-900">{item}</span>)}</div>
            </div>
          ))}
          {!library.length && <EmptyState>لا توجد مشاريع محفوظة مطابقة للبحث.</EmptyState>}
        </div>}
      </div>
    </section>
  );
}
