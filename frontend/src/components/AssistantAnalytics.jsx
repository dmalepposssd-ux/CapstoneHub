import { useEffect, useState } from "react";
import { Activity, BarChart3, CheckCircle2, Download, MessageCircle } from "lucide-react";
import { API_URL, api } from "../api/client.js";
import { EmptyState, MetricCard } from "./common.jsx";
import { formatDate, roleLabels } from "../utils/helpers.js";

function ScoreBar({ label, value }) {
  const score = Number(value || 0);
  const percent = Math.round((score / 5) * 100);
  return (
    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
      <div className="flex items-center justify-between gap-3 text-sm font-bold">
        <span>{label}</span>
        <span className="text-nile">{score ? `${score}/5` : "لا يوجد"}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div className="h-full rounded-full bg-nile" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function AssistantAnalytics({ token }) {
  const [data, setData] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [ragBenchmark, setRagBenchmark] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [feedback, benchmarkResult, ragBenchmarkResult] = await Promise.all([
        api("/features/assistant-feedback", token),
        api("/features/assistant-benchmark", token),
        api("/ai/evaluation/rag-benchmark", token, {
          method: "POST",
          body: JSON.stringify({ topK: 5 })
        }).catch(() => null)
      ]);
      setData(feedback);
      setBenchmark(benchmarkResult);
      setRagBenchmark(ragBenchmarkResult);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [token]);

  async function downloadExcel(path, filename) {
    const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <div className="toast">{error}</div>;
  if (!data) return <p>جاري تحميل تحليل المساعد...</p>;

  const stats = data.stats || {};
  const rows = data.rows || [];
  const withBlueprint = rows.filter((item) => item.blueprint).length;
  const usefulRows = rows.filter((item) => Number(item.usefulness || 0) >= 4).length;
  const usefulRate = rows.length ? Math.round((usefulRows / rows.length) * 100) : 0;

  return (
    <section className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard compact icon={MessageCircle} label="عدد التقييمات" value={stats.total || 0} />
        <MetricCard compact icon={CheckCircle2} label="نسبة المفيد" value={`${usefulRate}%`} />
        <MetricCard compact icon={BarChart3} label="Blueprint مقيّم" value={withBlueprint} />
        <MetricCard compact icon={Activity} label="متوسط الفائدة" value={stats.avg_usefulness || "لا يوجد"} />
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="panel-title">ملفات البحث والقياس</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              هذه الملفات تستخدم لتوثيق نتائج المساعد في التقرير أو الورقة البحثية.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadExcel("/features/assistant-feedback.xls", "assistant-feedback-research.xls")} className="secondary-btn mt-0">
              <Download size={16} /> تقييمات المساعد
            </button>
            <button type="button" onClick={() => downloadExcel("/features/assistant-benchmark.xls", "assistant-benchmark-results.xls")} className="secondary-btn mt-0">
              <Download size={16} /> Benchmark
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">مؤشرات جودة المساعد</h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          هذه المؤشرات تساعد في قياس جودة المساعد لاستخدامها في التقرير أو الورقة البحثية.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ScoreBar label="جودة الجداول" value={stats.avg_tables} />
          <ScoreBar label="جودة العلاقات" value={stats.avg_relationships} />
          <ScoreBar label="جودة المخططات" value={stats.avg_diagrams} />
          <ScoreBar label="فائدة الإجابة" value={stats.avg_usefulness} />
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Benchmark داخلي للمساعد</h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          اختبار صناعي منظّم يقيس هل المساعد يلتقط الجداول والعلاقات والصفحات المتوقعة من أفكار مشاريع مختلفة.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard compact icon={BarChart3} label="عدد الحالات" value={benchmark?.summary?.totalCases || 0} />
          <MetricCard compact icon={CheckCircle2} label="المتوسط العام" value={`${benchmark?.summary?.averageScore || 0}%`} />
          <MetricCard compact icon={Activity} label="متوسط الجداول" value={`${benchmark?.summary?.averageTables || 0}%`} />
          <MetricCard compact icon={MessageCircle} label="حالات قوية" value={benchmark?.summary?.strongCases || 0} />
        </div>
        <div className="mt-4 grid gap-2">
          {(benchmark?.results || []).slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <b className="text-nile">{item.id} - {item.actualDomain}</b>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-nile dark:bg-zinc-900">{item.score}%</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{item.evaluationFocus}</p>
            </div>
          ))}
        </div>
      </div>

      {ragBenchmark && (
        <div className="panel">
          <h2 className="panel-title">Benchmark RAG v2</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            يقيس جودة الاسترجاع من pgvector بعد فهرسة المشاريع.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard compact icon={BarChart3} label="حالات الاختبار" value={ragBenchmark.summary?.total_cases || 0} />
            <MetricCard compact icon={CheckCircle2} label="Precision@K" value={`${ragBenchmark.summary?.average_precision_at_k || 0}%`} />
            <MetricCard compact icon={Activity} label="MRR" value={ragBenchmark.summary?.mrr || 0} />
            <MetricCard compact icon={MessageCircle} label="NDCG" value={ragBenchmark.summary?.average_ndcg || 0} />
          </div>
          <div className="mt-4 grid gap-2">
            {(ragBenchmark.cases || []).map((item) => (
              <div key={item.id} className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <b className="text-nile">{item.id}</b>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-nile dark:bg-zinc-900">
                    P@K {item.precision_at_k}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{item.query}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2 className="panel-title">آخر تقييمات المساعد</h2>
        <div className="mt-4 grid gap-3">
          {rows.map((item) => (
            <div key={item.id} className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold text-nile">{item.full_name || "مستخدم غير محدد"}</p>
                  <p className="mt-1 text-xs font-bold text-zinc-500">{roleLabels[item.role] || item.role || "غير محدد"} · {formatDate(item.created_at)}</p>
                </div>
                <span className="rounded-lg bg-green-50 px-3 py-1 text-sm font-black text-nile dark:bg-emerald-950">
                  فائدة {item.usefulness}/5
                </span>
              </div>
              {item.prompt && <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">{item.prompt}</p>}
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                {item.tables_score && <span className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800">الجداول {item.tables_score}/5</span>}
                {item.relationships_score && <span className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800">العلاقات {item.relationships_score}/5</span>}
                {item.diagrams_score && <span className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800">المخططات {item.diagrams_score}/5</span>}
              </div>
              {item.comment && <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">{item.comment}</p>}
            </div>
          ))}
          {!rows.length && <EmptyState>لا توجد تقييمات للمساعد بعد. ستظهر هنا بعد أن يقيّم المستخدمون أجوبة المساعد.</EmptyState>}
        </div>
      </div>
    </section>
  );
}
