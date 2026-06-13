import { useEffect, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { api } from "../api/client.js";
import { EmptyState } from "./common.jsx";

export default function SurveyList({ token, section = "surveys", showToast }) {
  const [surveys, setSurveys] = useState([]);
  const [answers, setAnswers] = useState({});

  async function load() {
    const rows = await api("/surveys", token);
    setSurveys(rows);
    const initial = {};
    rows.forEach((survey) => {
      initial[survey.id] = survey.answers || {};
    });
    setAnswers(initial);
  }

  useEffect(() => { load(); }, []);

  function setAnswer(surveyId, question, value) {
    setAnswers((current) => ({
      ...current,
      [surveyId]: {
        ...(current[surveyId] || {}),
        [question.id]: value
      }
    }));
  }

  function toggleCheckboxAnswer(surveyId, question, option) {
    const current = answers[surveyId]?.[question.id] || [];
    const next = current.includes(option) ? current.filter((item) => item !== option) : [...current, option];
    setAnswer(surveyId, question, next);
  }

  async function submitSurvey(event, survey) {
    event.preventDefault();
    if (survey.answered) return;
    await api(`/surveys/${survey.id}/responses`, token, {
      method: "POST",
      body: JSON.stringify({ answers: answers[survey.id] || {} })
    });
    showToast?.(section, "تم حفظ إجابة الاستبيان");
    await load();
  }

  function renderQuestion(survey, question) {
    const value = answers[survey.id]?.[question.id] || (question.type === "checkbox" ? [] : "");
    const readOnly = Boolean(survey.answered);
    const baseClass = `field mt-2 ${readOnly ? "cursor-not-allowed bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300" : ""}`;
    if (question.type === "textarea") {
      return <textarea className={`${baseClass} min-h-24`} value={value} onChange={(event) => setAnswer(survey.id, question, event.target.value)} required={question.required} disabled={readOnly} />;
    }
    if (question.type === "select") {
      return (
        <select className={baseClass} value={value} onChange={(event) => setAnswer(survey.id, question, event.target.value)} required={question.required} disabled={readOnly}>
          <option value="">اختر إجابة</option>
          {(question.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }
    if (question.type === "radio") {
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          {(question.options || []).map((option) => (
            <label key={option} className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-bold dark:bg-zinc-800">
              <input type="radio" name={`${survey.id}-${question.id}`} checked={value === option} onChange={() => setAnswer(survey.id, question, option)} required={question.required} disabled={readOnly} className="h-4 w-4 accent-emerald-800 disabled:cursor-not-allowed" />
              {option}
            </label>
          ))}
        </div>
      );
    }
    if (question.type === "checkbox") {
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          {(question.options || []).map((option) => (
            <label key={option} className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-bold dark:bg-zinc-800">
              <input type="checkbox" checked={value.includes(option)} onChange={() => toggleCheckboxAnswer(survey.id, question, option)} disabled={readOnly} className="h-4 w-4 accent-emerald-800 disabled:cursor-not-allowed" />
              {option}
            </label>
          ))}
        </div>
      );
    }
    return <input className={baseClass} value={value} onChange={(event) => setAnswer(survey.id, question, event.target.value)} required={question.required} disabled={readOnly} />;
  }

  return (
    <section className="grid gap-6">
      <div className="panel">
        <h2 className="panel-title">الاستبيانات</h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">املأ الاستبيانات المطلوبة من الإدارة. بعد الحفظ تبقى إجابتك متاحة للعرض فقط.</p>
      </div>
      {surveys.map((survey) => (
        <form key={survey.id} onSubmit={(event) => submitSurvey(event, survey)} className="panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-extrabold">{survey.title}</h3>
              {survey.description && <p className="mt-2 text-sm leading-7 text-zinc-600 dark:text-zinc-300">{survey.description}</p>}
            </div>
            {survey.answered && <span className="inline-flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-extrabold text-nile dark:bg-emerald-950 dark:text-emerald-100"><CheckCircle2 size={16} /> تمت الإجابة - عرض فقط</span>}
          </div>
          <div className="mt-5 grid gap-4">
            {(survey.questions || []).map((question, index) => (
              <label key={question.id} className="block rounded-lg bg-zinc-50 p-4 text-sm font-bold dark:bg-zinc-800">
                <span>{index + 1}. {question.label}{question.required && <span className="text-red-600"> *</span>}</span>
                {renderQuestion(survey, question)}
              </label>
            ))}
          </div>
          {!survey.answered && <button className="primary-btn"><Send size={18} /> حفظ الإجابات</button>}
        </form>
      ))}
      {!surveys.length && <EmptyState>لا توجد استبيانات مطلوبة حالياً.</EmptyState>}
    </section>
  );
}
