import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bot, Copy, Download, MessageCircle, Send, Sparkles, XCircle } from "lucide-react";
import { API_URL, api } from "../api/client.js";
import { Avatar, EmptyState } from "./common.jsx";
import { assetUrl, classNames, roleLabels } from "../utils/helpers.js";

function BlueprintVisual({ blueprint }) {
  const flowSteps = blueprint.pages?.slice(0, 5) || [];
  const useCases = blueprint.pages?.slice(0, 6) || [];
  const quality = Math.min(100, Math.max(0, Number(blueprint.qualityScore || 0)));
  const relations = blueprint.structuredRelationships?.length
    ? blueprint.structuredRelationships.map((item) => `${item.left} ${item.cardinality} ${item.right} - ${item.verb}`)
    : blueprint.relationships || [];
  return (
    <div className="grid gap-3">
      <div className="rounded-lg bg-white p-3 dark:bg-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-extrabold text-nile">ملخص التصميم</p>
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-nile dark:bg-emerald-950">Quality {quality}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-900">
          <div className="h-full rounded-full bg-nile" style={{ width: `${quality}%` }} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {[
            ["جداول", blueprint.tables?.length || 0],
            ["علاقات", blueprint.relationships?.length || 0],
            ["صفحات", blueprint.pages?.length || 0],
            ["Endpoints", blueprint.apiEndpoints?.length || 0]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-green-50 p-2 text-center dark:bg-emerald-950/40">
              <p className="text-lg font-black text-nile">{value}</p>
              <p className="text-[11px] font-bold text-zinc-500">{label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg bg-white p-3 dark:bg-zinc-800">
        <p className="font-extrabold text-nile">ERD مرئي أولي</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(blueprint.tables || []).slice(0, 6).map((table) => (
            <div key={table.name} className="overflow-hidden rounded-lg border border-emerald-900/20 bg-green-50 dark:border-emerald-200/10 dark:bg-emerald-950/30">
              <p className="bg-nile px-3 py-2 text-center text-xs font-extrabold text-white">{table.name}</p>
              <div className="grid gap-1 p-2">
                {table.fields.slice(0, 5).map((field) => (
                  <span key={field} className="rounded bg-white px-2 py-1 text-[11px] font-bold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">{field}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2">
          {relations.slice(0, 6).map((relation) => (
            <div key={relation} className="flex items-center gap-2 rounded-lg bg-zinc-50 p-2 text-xs font-bold dark:bg-zinc-900">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-nile text-white">↔</span>
              <span>{relation}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg bg-white p-3 dark:bg-zinc-800">
        <p className="font-extrabold text-nile">Flowchart مرئي</p>
        <div className="mt-3 grid gap-2">
          {flowSteps.map((step, index) => (
            <div key={step} className="grid gap-2">
              <div className="rounded-lg border border-emerald-900/20 bg-green-50 p-3 text-center text-xs font-extrabold text-nile dark:border-emerald-200/10 dark:bg-emerald-950/30">{index + 1}. {step}</div>
              {index < flowSteps.length - 1 && <div className="text-center text-nile">↓</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg bg-white p-3 dark:bg-zinc-800">
        <p className="font-extrabold text-nile">Use Case مرئي</p>
        <div className="mt-3 grid gap-3 md:grid-cols-[120px_1fr]">
          <div className="grid place-items-center rounded-full border-2 border-nile bg-green-50 p-4 text-center text-xs font-extrabold text-nile dark:bg-emerald-950/30">المستخدم</div>
          <div className="grid gap-2">
            {useCases.map((useCase) => (
              <div key={useCase} className="rounded-full border border-emerald-900/20 bg-zinc-50 px-3 py-2 text-center text-xs font-bold dark:border-emerald-200/10 dark:bg-zinc-900">{useCase}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function scoreTone(value = 0) {
  if (value >= 85) return "bg-green-50 text-nile dark:bg-emerald-950 dark:text-emerald-100";
  if (value >= 70) return "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-100";
  return "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-100";
}

function ScorePill({ label, value }) {
  const score = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="rounded-lg bg-white p-3 dark:bg-zinc-800">
      <div className="flex items-center justify-between gap-3 text-xs font-extrabold">
        <span>{label}</span>
        <span className={classNames("rounded-full px-2 py-1", scoreTone(score))}>{score}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-900">
        <div className="h-full rounded-full bg-nile" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function AssistantIntelligencePanel({ intelligence, onUseQuestion }) {
  if (!intelligence) return null;
  const qualityChecks = intelligence.quality?.checks || [];
  const requirements = intelligence.requirements;
  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-emerald-900/10 bg-green-50/70 p-3 dark:border-emerald-100/10 dark:bg-emerald-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-extrabold text-nile">تحليل ذكي موثوق</p>
          <p className="mt-1 text-xs font-bold text-zinc-500">النية: {intelligence.intent?.label || "تحليل عام"} · {intelligence.version}</p>
        </div>
        <span className={classNames("rounded-full px-3 py-1 text-xs font-black", scoreTone(intelligence.confidence))}>
          وثوقية {intelligence.confidence || 0}% · {intelligence.confidenceLabel}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {(intelligence.reliabilityFactors || []).map((item) => <ScorePill key={item.label} label={item.label} value={item.value} />)}
      </div>

      {requirements && (
        <div className="rounded-lg bg-white p-3 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-extrabold text-nile">جلسة بناء المشروع</p>
              <p className="mt-1 text-xs font-bold text-zinc-500">{requirements.stage}</p>
            </div>
            <span className={classNames("rounded-full px-3 py-1 text-xs font-black", scoreTone(requirements.completion))}>
              اكتمال {requirements.completion}%
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-nile" style={{ width: `${Math.min(100, Math.max(0, requirements.completion || 0))}%` }} />
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-lg bg-green-50 p-2 text-xs dark:bg-emerald-950/40">
              <p className="font-extrabold text-nile">تم فهمه</p>
              <p className="mt-1 leading-6 text-zinc-600 dark:text-zinc-200">
                {requirements.answered?.length ? requirements.answered.join("، ") : "لم تكتمل أي نقطة بعد."}
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 p-2 text-xs dark:bg-amber-950/40">
              <p className="font-extrabold text-amber-800 dark:text-amber-100">ناقص لإكمال التصميم</p>
              <p className="mt-1 leading-6 text-zinc-600 dark:text-zinc-200">
                {requirements.missing?.length ? requirements.missing.slice(0, 5).map((item) => item.label).join("، ") : "جاهز للتصميم."}
              </p>
            </div>
          </div>
        </div>
      )}

      {intelligence.quality && (
        <div className="rounded-lg bg-white p-3 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-extrabold text-nile">جودة الفكرة: {intelligence.quality.label}</p>
            <span className={classNames("rounded-full px-3 py-1 text-xs font-black", scoreTone(intelligence.quality.score))}>{intelligence.quality.score}%</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {qualityChecks.slice(0, 8).map((check) => (
              <div key={check.id} className="rounded-lg bg-zinc-50 p-2 text-xs dark:bg-zinc-800">
                <div className="flex items-center justify-between gap-2 font-extrabold">
                  <span>{check.label}</span>
                  <span className={check.score >= 70 ? "text-nile" : "text-red-700"}>{check.score}%</span>
                </div>
                {check.score < 70 && <p className="mt-1 leading-5 text-zinc-500">{check.fix}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(intelligence.evidence || []).length > 0 && (
        <div className="rounded-lg bg-white p-3 dark:bg-zinc-900">
          <p className="font-extrabold text-nile">أقرب مشاريع كأدلة</p>
          <div className="mt-2 grid gap-2">
            {intelligence.evidence.slice(0, 4).map((item) => (
              <div key={`${item.project_id}-${item.title}`} className="rounded-lg bg-zinc-50 p-2 text-xs dark:bg-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>{item.title}</b>
                  <span className={classNames("rounded-full px-2 py-1 font-black", scoreTone(item.similarity))}>{item.similarity}%</span>
                </div>
                <p className="mt-1 text-zinc-500">{item.is_archived ? "مشروع مؤرشف" : "مشروع حالي"} · {item.reason}</p>
                {item.shared_technologies?.length > 0 && <p className="mt-1 font-bold text-nile">{item.shared_technologies.join("، ")}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(intelligence.supervisorMatches || []).length > 0 && (
        <div className="rounded-lg bg-white p-3 dark:bg-zinc-900">
          <p className="font-extrabold text-nile">مشرفون مناسبون</p>
          <div className="mt-2 grid gap-2">
            {intelligence.supervisorMatches.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-lg bg-zinc-50 p-2 text-xs dark:bg-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>{item.name}</b>
                  <span className={classNames("rounded-full px-2 py-1 font-black", scoreTone(item.match_score))}>{item.match_score}%</span>
                </div>
                <p className="mt-1 text-zinc-500">{item.specialization} · السعة {item.current_load}/{item.max_students_capacity}</p>
                {item.shared_keywords?.length > 0 && <p className="mt-1 font-bold text-nile">{item.shared_keywords.join("، ")}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(intelligence.actionPlan || []).length > 0 && (
        <div className="rounded-lg bg-white p-3 dark:bg-zinc-900">
          <p className="font-extrabold text-nile">خطة العمل التالية</p>
          <ol className="mt-2 list-inside list-decimal text-xs leading-6">
            {intelligence.actionPlan.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </div>
      )}

      {(intelligence.risks || []).length > 0 && (
        <div className="rounded-lg bg-white p-3 dark:bg-zinc-900">
          <p className="font-extrabold text-nile">المخاطر والتنبيهات</p>
          <div className="mt-2 grid gap-2">
            {intelligence.risks.map((risk) => (
              <div key={`${risk.title}-${risk.level}`} className="rounded-lg bg-zinc-50 p-2 text-xs dark:bg-zinc-800">
                <b>{risk.title} · {risk.level}</b>
                <p className="mt-1 leading-5 text-zinc-500">{risk.mitigation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(intelligence.followUpQuestions || []).length > 0 ? (
        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-extrabold">أسئلة المتابعة لإكمال المشروع</p>
          <div className="mt-2 grid gap-2">
            {intelligence.followUpQuestions.map((item) => (
              <button
                key={`${item.id}-${item.priority}`}
                type="button"
                onClick={() => onUseQuestion?.(item.question)}
                className="rounded-lg bg-white px-3 py-2 text-right font-extrabold leading-6 text-amber-900 transition hover:bg-amber-100 dark:bg-zinc-900 dark:text-amber-100 dark:hover:bg-zinc-800"
              >
                {item.priority}. {item.question}
              </button>
            ))}
          </div>
        </div>
      ) : intelligence.nextBestQuestion && (
        <div className="rounded-lg bg-amber-50 p-3 text-xs font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-100">
          السؤال التالي الأفضل: {intelligence.nextBestQuestion}
        </div>
      )}
    </div>
  );
}

function blueprintMarkdown(blueprint) {
  const lines = [
    `# Blueprint: ${blueprint.domain}`,
    "",
    `- درجة الثقة: ${blueprint.confidence || 0}%`,
    `- درجة جودة التصميم: ${blueprint.qualityScore || 0}%`,
    `- الأدوار: ${(blueprint.actors || []).join(", ")}`,
    "",
    "## المتطلبات الوظيفية",
    ...(blueprint.requirements?.functional || []).map((item) => `- ${item}`),
    "",
    "## المتطلبات غير الوظيفية",
    ...(blueprint.requirements?.nonFunctional || []).map((item) => `- ${item}`),
    "",
    "## الجداول المقترحة",
    ...(blueprint.tables || []).flatMap((table) => [
      `### ${table.name}`,
      table.purpose || "",
      ...(table.fields || []).map((field) => `- ${field}`),
      ""
    ]),
    "## العلاقات",
    ...((blueprint.structuredRelationships?.length ? blueprint.structuredRelationships.map((relation) => `${relation.left} ${relation.cardinality} ${relation.right}: ${relation.label}`) : blueprint.relationships) || []).map((item) => `- ${item}`),
    "",
    "## الصفحات المقترحة",
    ...(blueprint.pages || []).map((page) => `- ${page}`),
    "",
    "## خطة MVP",
    ...(blueprint.mvpPlan || []).flatMap((phase) => [`### ${phase.phase}: ${phase.title}`, ...(phase.tasks || []).map((task) => `- ${task}`), ""]),
    "## المخاطر",
    ...(blueprint.risks || []).map((risk) => `- ${risk.title} (${risk.level}): ${risk.mitigation}`),
    "",
    "## معايير القبول",
    ...(blueprint.acceptanceCriteria || []).map((item) => `- ${item}`),
    "",
    "## أسئلة دفاع متوقعة",
    ...(blueprint.defenseQuestions || []).map((item) => `- ${item}`),
    "",
    "## API Endpoints",
    "```text",
    ...(blueprint.apiEndpoints || []),
    "```",
    "",
    "## SQL Schema",
    "```sql",
    blueprint.sqlSchema || "",
    "```",
    "",
    "## Mermaid ERD",
    "```mermaid",
    blueprint.mermaid?.erd || "",
    "```",
    "",
    "## Mermaid Flowchart",
    "```mermaid",
    blueprint.mermaid?.flowchart || "",
    "```",
    "",
    "## Mermaid Use Case",
    "```mermaid",
    blueprint.mermaid?.useCase || "",
    "```"
  ];
  return lines.join("\n");
}

function downloadText(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseDiagramShare(body = "") {
  const imageMatch = body.match(/صورة المخطط:\s*(\/uploads\/[^\s]+)/);
  const codeMatch = body.match(/كود Mermaid:\s*\n?([\s\S]*)$/);
  if (!imageMatch && !codeMatch) return null;
  const note = body
    .replace(/صورة المخطط:\s*\/uploads\/[^\s]+/g, "")
    .replace(/كود Mermaid:\s*\n?[\s\S]*$/g, "")
    .trim();
  return {
    note,
    imageUrl: imageMatch?.[1] || "",
    mermaidCode: codeMatch?.[1]?.trim() || ""
  };
}

function openImagePreview(imageUrl) {
  const url = assetUrl(imageUrl);
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  popup.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>معاينة المخطط</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: #f8fafc;
      color: #111827;
      font-family: Arial, Tahoma, sans-serif;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 18px;
      background: #ffffff;
      border-bottom: 1px solid #e5e7eb;
    }
    a {
      color: #00783f;
      font-weight: 800;
      text-decoration: none;
    }
    main {
      min-height: 0;
      display: grid;
      place-items: center;
      padding: 18px;
      overflow: auto;
    }
    img {
      max-width: 100%;
      max-height: calc(100vh - 92px);
      width: auto;
      height: auto;
      object-fit: contain;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      box-shadow: 0 18px 45px rgba(15, 23, 42, 0.12);
    }
  </style>
</head>
<body>
  <header>
    <strong>معاينة المخطط</strong>
    <a href="${url}" download>تنزيل الصورة</a>
  </header>
  <main>
    <img src="${url}" alt="صورة المخطط" />
  </main>
</body>
</html>`);
  popup.document.close();
}

function DiagramShareCard({ details, canReview, onReview }) {
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    if (!details.mermaidCode) return;
    await navigator.clipboard?.writeText(details.mermaidCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-emerald-900/15 bg-white p-3 text-sm dark:border-emerald-200/10 dark:bg-zinc-900">
      <div>
        <p className="font-extrabold text-nile">مخطط للمراجعة</p>
        {details.note && <p className="mt-1 leading-7 text-zinc-600 dark:text-zinc-300">{details.note}</p>}
      </div>
      {details.imageUrl && (
        <button type="button" onClick={() => openImagePreview(details.imageUrl)} className="block overflow-hidden rounded-lg border border-black/10 bg-zinc-50 text-right dark:border-white/10 dark:bg-zinc-950">
          <img src={assetUrl(details.imageUrl)} alt="صورة المخطط المرسل للمراجعة" className="max-h-80 w-full object-contain" />
        </button>
      )}
      {details.mermaidCode && (
        <details className="rounded-lg bg-zinc-950 p-3 text-left text-xs text-emerald-100" dir="ltr">
          <summary className="cursor-pointer text-right font-bold text-white" dir="rtl">كود Mermaid</summary>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap">{details.mermaidCode}</pre>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        {details.imageUrl && (
          <button type="button" onClick={() => openImagePreview(details.imageUrl)} className="mini-action text-nile">
            <Download size={16} /> فتح الصورة
          </button>
        )}
        {details.mermaidCode && (
          <button type="button" onClick={copyCode} className="mini-action text-nile">
            <Copy size={16} /> {copied ? "تم النسخ" : "نسخ الكود"}
          </button>
        )}
        {canReview && (
          <button type="button" onClick={onReview} className="mini-action text-emerald-700">
            <MessageCircle size={16} /> كتابة تعليق
          </button>
        )}
      </div>
    </div>
  );
}

function blueprintHtml(blueprint) {
  const markdown = blueprintMarkdown(blueprint);
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>CapstoneHub Blueprint</title>
  <style>
    body { font-family: Arial, Tahoma, sans-serif; line-height: 1.8; color: #111827; padding: 32px; }
    h1, h2, h3 { color: #00783f; }
    pre { direction: ltr; text-align: left; background: #f3f4f6; padding: 12px; white-space: pre-wrap; border-radius: 8px; }
    .meta { background: #ecfdf5; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; margin-bottom: 18px; }
  </style>
</head>
<body>
  <h1>تقرير Blueprint للمشروع</h1>
  <div class="meta">
    <b>المجال:</b> ${escapeHtml(blueprint.domain)}<br />
    <b>درجة الثقة:</b> ${escapeHtml(blueprint.confidence || 0)}%<br />
    <b>درجة جودة التصميم:</b> ${escapeHtml(blueprint.qualityScore || 0)}%
  </div>
  <pre>${escapeHtml(markdown)}</pre>
</body>
</html>`;
}

function printBlueprintPdf(blueprint) {
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) return;
  popup.document.write(blueprintHtml(blueprint));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 300);
}

function BlueprintActions({ blueprint }) {
  const [copied, setCopied] = useState(false);
  const markdown = blueprintMarkdown(blueprint);
  async function copyMarkdown() {
    await navigator.clipboard?.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="flex flex-wrap gap-2 rounded-lg bg-white p-2 dark:bg-zinc-900">
      <button type="button" onClick={() => downloadText("capstone-blueprint.md", markdown, "text/markdown;charset=utf-8")} className="mini-action text-nile">
        <Download size={16} /> Markdown
      </button>
      <button type="button" onClick={() => downloadText("capstone-blueprint.json", JSON.stringify(blueprint, null, 2), "application/json;charset=utf-8")} className="mini-action text-nile">
        <Download size={16} /> JSON
      </button>
      <button type="button" onClick={() => downloadText("capstone-blueprint.doc", blueprintHtml(blueprint), "application/msword;charset=utf-8")} className="mini-action text-nile">
        <Download size={16} /> Word
      </button>
      <button type="button" onClick={() => printBlueprintPdf(blueprint)} className="mini-action text-nile">
        <Download size={16} /> PDF
      </button>
      <button type="button" onClick={copyMarkdown} className="mini-action text-emerald-700">
        <Copy size={16} /> {copied ? "تم النسخ" : "نسخ التقرير"}
      </button>
    </div>
  );
}

function AssistantFeedback({ token, message }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    usefulness: 0,
    tablesScore: 0,
    relationshipsScore: 0,
    diagramsScore: 0,
    comment: ""
  });
  const hasBlueprint = Boolean(message.blueprint);

  async function submitFeedback(usefulness = form.usefulness) {
    if (!usefulness) {
      setError("اختر تقييم الفائدة أولاً");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("/features/assistant-feedback", token, {
        method: "POST",
        body: JSON.stringify({
          prompt: message.prompt || "",
          responseSummary: message.body || "",
          blueprint: message.blueprint || null,
          pipelineType: message.rag?.pipeline_type || (message.blueprint ? "baseline_blueprint_rules" : "baseline_assistant_rules"),
          modelName: message.rag?.llm_model || message.rag?.embedding_model || "",
          usefulness,
          tablesScore: hasBlueprint ? form.tablesScore : null,
          relationshipsScore: hasBlueprint ? form.relationshipsScore : null,
          diagramsScore: hasBlueprint ? form.diagramsScore : null,
          comment: form.comment
        })
      });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return <p className="mt-3 rounded-lg bg-green-50 p-2 text-xs font-extrabold text-nile dark:bg-emerald-950/40">تم حفظ تقييمك، وهذا بيساعدنا نحسن المساعد بحثياً.</p>;
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-900/10 bg-zinc-50 p-2 dark:border-white/10 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-extrabold text-zinc-600 dark:text-zinc-300">قيّم جواب المساعد:</span>
        <button type="button" disabled={saving} onClick={() => submitFeedback(5)} className="rounded-full bg-green-100 px-3 py-1 text-xs font-extrabold text-nile disabled:opacity-50 dark:bg-emerald-950">مفيد</button>
        <button type="button" disabled={saving} onClick={() => submitFeedback(2)} className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-extrabold text-zinc-700 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-200">غير دقيق</button>
        <button type="button" onClick={() => setOpen((value) => !value)} className="rounded-full border border-emerald-900/20 px-3 py-1 text-xs font-extrabold text-nile dark:border-emerald-200/20">
          تقييم تفصيلي
        </button>
      </div>
      {open && (
        <div className="mt-3 grid gap-2">
          <select className="input" value={form.usefulness} onChange={(event) => setForm({ ...form, usefulness: Number(event.target.value) })}>
            <option value={0}>فائدة الجواب من 1 إلى 5</option>
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          {hasBlueprint && (
            <div className="grid gap-2 md:grid-cols-3">
              <select className="input" value={form.tablesScore} onChange={(event) => setForm({ ...form, tablesScore: Number(event.target.value) })}>
                <option value={0}>جودة الجداول</option>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select className="input" value={form.relationshipsScore} onChange={(event) => setForm({ ...form, relationshipsScore: Number(event.target.value) })}>
                <option value={0}>جودة العلاقات</option>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select className="input" value={form.diagramsScore} onChange={(event) => setForm({ ...form, diagramsScore: Number(event.target.value) })}>
                <option value={0}>جودة المخططات</option>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          )}
          <textarea className="input min-h-20" value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} placeholder="ملاحظة اختيارية..." />
          <button type="button" disabled={saving} onClick={() => submitFeedback()} className="btn-primary disabled:opacity-60">حفظ التقييم</button>
        </div>
      )}
      {error && <p className="mt-2 text-xs font-bold text-red-600">{error}</p>}
    </div>
  );
}

export default function FloatingMessages({ token, user }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("menu");
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [threadOpen, setThreadOpen] = useState(false);
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [assistantText, setAssistantText] = useState("");
  const [assistantTech, setAssistantTech] = useState("");
  const [assistantMessages, setAssistantMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      body: "أهلاً، أنا المساعد الذكي للمشروع. اكتب فكرتك وسأبدأ معك جلسة متطلبات: أسألك سؤالاً بعد سؤال حتى نصل إلى Blueprint كامل، مع أدلة من المشاريع ومؤشرات ثقة."
    }
  ]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [assistantUseRag, setAssistantUseRag] = useState(true);
  const assistantEndRef = useRef(null);
  const assistantInputRef = useRef(null);
  const threadEndRef = useRef(null);
  const messageInputRef = useRef(null);

  async function loadMessages() {
    const [nextContacts, nextMessages, unread] = await Promise.all([
      api("/messages/contacts", token),
      api("/messages", token),
      api("/messages/unread-count", token)
    ]);
    setContacts(nextContacts);
    setMessages(nextMessages);
    setUnreadCount(unread.total || 0);
  }

  useEffect(() => { loadMessages(); }, [token]);
  useEffect(() => {
    if (!token || typeof window.EventSource === "undefined") {
      setRealtimeEnabled(false);
      return undefined;
    }

    setRealtimeEnabled(true);
    const source = new EventSource(`${API_URL}/messages/stream?token=${encodeURIComponent(token)}`);

    source.addEventListener("messages", () => {
      loadMessages();
    });
    source.addEventListener("error", () => {
      if (source.readyState === EventSource.CLOSED) {
        setRealtimeEnabled(false);
      }
    });

    return () => source.close();
  }, [token]);
  useEffect(() => {
    if (realtimeEnabled) return undefined;
    const timer = setInterval(loadMessages, 15000);
    return () => clearInterval(timer);
  }, [token, realtimeEnabled]);
  useEffect(() => {
    function openMessagesFromNotification() {
      setOpen(true);
      setMode("messages");
      loadMessages();
    }
    window.addEventListener("capstonehub:open-messages", openMessagesFromNotification);
    return () => window.removeEventListener("capstonehub:open-messages", openMessagesFromNotification);
  }, [token]);

  const contactMap = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const messageConversations = useMemo(() => {
    const map = new Map();
    messages.forEach((message) => {
      const partnerId = message.sender_id === user.id ? message.recipient_id : message.sender_id;
      const partner = contactMap.get(partnerId) || {
        id: partnerId,
        full_name: message.sender_id === user.id ? message.recipient_name : message.sender_name,
        role: "",
        avatar_url: message.sender_id === user.id ? message.recipient_avatar_url : message.sender_avatar_url
      };
      const previous = map.get(partnerId);
      if (!previous || new Date(message.created_at) > new Date(previous.last.created_at)) {
        map.set(partnerId, { partner, last: message });
      }
    });
    return [...map.values()].sort((a, b) => new Date(b.last?.created_at || 0) - new Date(a.last?.created_at || 0));
  }, [contactMap, messages, user.id]);
  const newConversationContacts = useMemo(() => {
    const existingPartnerIds = new Set(messageConversations.map(({ partner }) => Number(partner.id)));
    return contacts.filter((contact) => !existingPartnerIds.has(Number(contact.id)));
  }, [contacts, messageConversations]);
  const matchesSearch = (partner, last = null, term = "") => (
    partner.full_name?.toLowerCase().includes(term) ||
    roleLabels[partner.role]?.toLowerCase().includes(term) ||
    partner.role?.toLowerCase().includes(term) ||
    last?.body?.toLowerCase().includes(term)
  );
  const filteredMessageConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return messageConversations;
    return messageConversations.filter(({ partner, last }) => matchesSearch(partner, last, term));
  }, [messageConversations, search]);
  const filteredNewContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return newConversationContacts;
    return newConversationContacts.filter((contact) => matchesSearch(contact, null, term));
  }, [newConversationContacts, search]);

  useEffect(() => {
    if (mode !== "messages") return;
    if (!selectedId && messageConversations[0]?.partner?.id) {
      selectPartner(messageConversations[0].partner.id);
    }
  }, [messageConversations, selectedId, mode]);

  const selectedContact = contactMap.get(Number(selectedId)) || messageConversations.find(({ partner }) => String(partner.id) === String(selectedId))?.partner;
  const canWrite = Boolean(selectedId && selectedContact);
  const thread = messages
    .filter((message) => {
      const partnerId = message.sender_id === user.id ? message.recipient_id : message.sender_id;
      return String(partnerId) === String(selectedId);
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  useEffect(() => {
    if (!open || mode !== "messages" || !selectedId) return;
    threadEndRef.current?.scrollIntoView({ block: "end" });
    messageInputRef.current?.focus();
  }, [open, mode, selectedId, thread.length]);
  useEffect(() => {
    if (!open || mode !== "assistant") return;
    assistantEndRef.current?.scrollIntoView({ block: "end" });
  }, [open, mode, assistantMessages.length, assistantLoading]);

  async function sendMessage(event) {
    event.preventDefault();
    setError("");
    if (!canWrite) {
      setError("اختر شخصاً من قائمة المحادثات أولاً");
      return;
    }
    if (!body.trim()) return;
    try {
      await api("/messages", token, {
        method: "POST",
        body: JSON.stringify({ recipientId: Number(selectedId), topic: "محادثة مباشرة", body: body.trim() })
      });
      setBody("");
      await loadMessages();
    } catch (err) {
      setError(err.message);
    }
  }

  async function selectPartner(partnerId) {
    setSelectedId(String(partnerId));
    setThreadOpen(true);
    try {
      await api(`/messages/read/${partnerId}`, token, { method: "PATCH" });
      await loadMessages();
    } catch {
      // The conversation can still open even if marking messages as read fails.
    }
  }

  function useAssistantQuestion(question) {
    setAssistantText((current) => {
      const prefix = `السؤال: ${question}\nجوابي: `;
      return current.trim() ? `${current.trim()}\n${prefix}` : prefix;
    });
    requestAnimationFrame(() => assistantInputRef.current?.focus());
  }

  async function runAssistant(event, forceBlueprint = false) {
    event.preventDefault();
    const text = assistantText.trim();
    const techStack = assistantTech.trim();
    if (!text && !techStack) return;
    setAssistantError("");
    setAssistantLoading(true);
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      body: text || `التقنيات: ${techStack}`,
      techStack
    };
    setAssistantMessages((current) => [...current, userMessage]);
    setAssistantText("");
    try {
      const previousContext = assistantMessages
        .filter((message) => message.role === "user")
        .slice(-8)
        .map((message) => [message.body, message.techStack ? `التقنيات: ${message.techStack}` : ""].filter(Boolean).join("\n"))
        .join("\n\n");
      const queryText = [previousContext, text, techStack ? `Technologies: ${techStack}` : ""].filter(Boolean).join("\n");
      const [result, ragResult] = await Promise.all([
        api("/features/assistant", token, {
          method: "POST",
          body: JSON.stringify({ text, techStack, forceBlueprint, contextText: previousContext })
        }),
        assistantUseRag && !forceBlueprint
          ? api("/ai/rag-answer", token, {
          method: "POST",
          body: JSON.stringify({
            query: queryText,
            topK: 8,
            task: "academic_help",
            useLlm: true
          })
        }).catch((err) => ({ error: err.message }))
          : Promise.resolve(null)
      ]);
      setAssistantMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          body: result.summary,
          prompt: text || `التقنيات: ${techStack}`,
          tips: result.tips,
          keywords: result.suggestedKeywords,
          blueprint: result.blueprint,
          confidence: result.confidence,
          intelligence: result.intelligence,
          rag: ragResult && !ragResult.error ? ragResult : null
        }
      ]);
    } catch (err) {
      setAssistantError(err.message);
    } finally {
      setAssistantLoading(false);
    }
  }

  function toggleLauncher() {
    if (open) {
      setOpen(false);
      return;
    }
    setMode("menu");
    setOpen(true);
  }

  return (
    <div className="fixed bottom-5 left-5 z-40">
      {open && mode === "menu" && (
        <div className="mb-3 w-72 rounded-lg border border-emerald-950/15 bg-white p-3 shadow-2xl shadow-emerald-950/20 dark:border-white/10 dark:bg-zinc-900" dir="rtl">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-extrabold text-nile">اختر الخدمة</p>
            <button title="إغلاق" onClick={() => setOpen(false)} className="mini-action text-zinc-700 dark:text-white"><XCircle size={16} /></button>
          </div>
          <div className="grid gap-2">
            <button type="button" onClick={() => setMode("messages")} className="flex items-center gap-3 rounded-lg bg-green-50 p-4 text-right font-extrabold text-nile transition hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950">
              <MessageCircle size={22} />
              <span>
                <span className="block">المحادثة</span>
                <span className="mt-1 block text-xs font-bold text-zinc-500 dark:text-zinc-300">رسائل مباشرة مع الطلاب والمشرفين والإدارة</span>
              </span>
            </button>
            <button type="button" onClick={() => setMode("assistant")} className="flex items-center gap-3 rounded-lg bg-green-50 p-4 text-right font-extrabold text-nile transition hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950">
              <Bot size={22} />
              <span>
                <span className="block">المساعد الشخصي</span>
                <span className="mt-1 block text-xs font-bold text-zinc-500 dark:text-zinc-300">تحسين الفكرة، ملاحظات، وكلمات مفتاحية</span>
              </span>
            </button>
          </div>
        </div>
      )}
      {open && mode === "assistant" && (
        <div className="mb-3 grid h-[min(680px,calc(100vh-110px))] w-[min(620px,calc(100vw-40px))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-emerald-950/15 bg-[#efeae2] shadow-2xl shadow-emerald-950/20 dark:border-white/10 dark:bg-zinc-950" dir="rtl">
          <header className="flex items-center justify-between gap-3 border-b border-black/10 bg-green-50 px-4 py-3 dark:border-white/10 dark:bg-emerald-950/50">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-nile text-white"><Bot size={21} /></span>
              <div>
                <p className="font-extrabold">المساعد الذكي الأكاديمي</p>
                <p className="text-xs text-zinc-500">تحليل موثوقية، أدلة، مشرفين، وخطة تنفيذ</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode("menu")} className="mini-action text-zinc-700 dark:text-white"><ArrowRight size={16} /> رجوع</button>
              <button title="إغلاق" onClick={() => setOpen(false)} className="mini-action text-zinc-700 dark:text-white"><XCircle size={16} /></button>
            </div>
          </header>
          <div className="min-h-0 overflow-y-auto p-4">
            <div className="grid gap-3">
              {assistantMessages.map((message) => {
                const mine = message.role === "user";
                return (
                  <div key={message.id} className={classNames("max-w-[86%] rounded-lg px-4 py-3 text-sm shadow-sm", mine ? "justify-self-start rounded-tl-sm bg-[#dcf8c6] text-ink" : "justify-self-end rounded-tr-sm bg-white text-ink dark:bg-zinc-800 dark:text-white")}>
                    <p className="leading-7">{message.body}</p>
                    {message.techStack && <p className="mt-2 text-xs font-bold text-zinc-500">التقنيات: {message.techStack}</p>}
                    {message.tips?.length > 0 && (
                      <div className="mt-3 grid gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                        <p className="font-extrabold text-nile">اقتراحات التحسين</p>
                        {message.tips.map((tip) => <p key={tip} className="leading-6">- {tip}</p>)}
                      </div>
                    )}
                    {message.intelligence && <AssistantIntelligencePanel intelligence={message.intelligence} onUseQuestion={useAssistantQuestion} />}
                    {message.keywords?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.keywords.map((item) => <span key={item} className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-nile dark:bg-emerald-950">{item}</span>)}
                      </div>
                    )}
                    {message.rag && (
                      <div className="mt-3 grid gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-extrabold text-nile">RAG evidence mode</p>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-nile dark:bg-zinc-800">
                            Confidence {message.rag.confidence || 0}%
                          </span>
                        </div>
                        {message.rag.pipeline_type && (
                          <p className="text-xs font-bold text-zinc-500">Pipeline: {message.rag.pipeline_type}</p>
                        )}
                        {(message.rag.quality_gates || []).length > 0 && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {message.rag.quality_gates.map((gate) => <ScorePill key={gate.label} label={gate.label} value={gate.value} />)}
                          </div>
                        )}
                        {(message.rag.answer_sections || []).length > 0 && (
                          <div className="grid gap-2">
                            {message.rag.answer_sections.slice(0, 3).map((section) => (
                              <div key={section.title} className="rounded-lg bg-white p-2 text-xs dark:bg-zinc-800">
                                <p className="font-extrabold text-nile">{section.title}</p>
                                <p className="mt-1 leading-6">{section.body}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {(message.rag.recommendations || []).length > 0 && (
                          <div className="grid gap-1 text-xs leading-6">
                            {(message.rag.recommendations || []).slice(0, 4).map((item) => <p key={item}>- {item}</p>)}
                          </div>
                        )}
                        {(message.rag.evidence || []).length > 0 && (
                          <div className="grid gap-2">
                            <p className="text-xs font-extrabold text-nile">الأدلة المسترجعة</p>
                            {message.rag.evidence.slice(0, 4).map((item) => (
                              <div key={`${item.rank}-${item.source_id}-${item.title}`} className="rounded-lg bg-white p-2 text-xs dark:bg-zinc-800">
                                <div className="flex flex-wrap justify-between gap-2">
                                  <b>{item.rank}. {item.title || "Untitled"}</b>
                                  <span className="font-black text-nile">{item.similarity}%</span>
                                </div>
                                <p className="mt-1 text-zinc-500">{item.source_type} #{item.source_id} · {item.section}</p>
                                <p className="mt-2 leading-6">{item.snippet}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {message.blueprint && (
                      <div className="mt-4 grid gap-3">
                        <div className="rounded-lg bg-green-50 p-3 dark:bg-emerald-950/40">
                          <p className="font-extrabold text-nile">Blueprint: {message.blueprint.domain}</p>
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">تصميم أولي قابل للتعديل مع المشرف. الثقة: {message.blueprint.confidence || 0}%</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(message.blueprint.actors || []).map((actor) => <span key={actor} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-nile dark:bg-zinc-900">{actor}</span>)}
                          </div>
                        </div>
                        <BlueprintActions blueprint={message.blueprint} />
                        <BlueprintVisual blueprint={message.blueprint} />
                        {message.blueprint.modules?.length > 0 && (
                          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                            <p className="font-extrabold text-nile">تقسيم النظام إلى Modules</p>
                            <div className="mt-2 grid gap-2">
                              {message.blueprint.modules.map((module) => (
                                <div key={module.name} className="rounded-lg bg-white p-2 text-xs dark:bg-zinc-800">
                                  <p className="font-extrabold">{module.name}</p>
                                  <p className="mt-1 text-zinc-500">{module.reason}</p>
                                  <p className="mt-1 font-bold text-nile">{module.entities.join("، ")}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {message.blueprint.requirements && (
                          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                            <p className="font-extrabold text-nile">متطلبات مستنتجة</p>
                            <div className="mt-2 grid gap-3 md:grid-cols-2">
                              <div>
                                <p className="text-xs font-extrabold">Functional</p>
                                <ul className="mt-1 list-inside list-disc text-xs leading-6">
                                  {message.blueprint.requirements.functional?.slice(0, 6).map((item) => <li key={item}>{item}</li>)}
                                </ul>
                              </div>
                              <div>
                                <p className="text-xs font-extrabold">Non-functional</p>
                                <ul className="mt-1 list-inside list-disc text-xs leading-6">
                                  {message.blueprint.requirements.nonFunctional?.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
                                </ul>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                          <p className="font-extrabold text-nile">الجداول المقترحة</p>
                          <div className="mt-2 grid gap-2">
                            {message.blueprint.tables.slice(0, 6).map((table) => (
                              <details key={table.name} className="rounded-lg bg-white p-2 dark:bg-zinc-800">
                                <summary className="cursor-pointer font-bold">{table.name}</summary>
                                <p className="mt-2 text-xs text-zinc-500">{table.purpose}</p>
                                <ul className="mt-2 list-inside list-disc text-xs leading-6">
                                  {table.fields.slice(0, 8).map((field) => <li key={field}>{field}</li>)}
                                </ul>
                              </details>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                          <p className="font-extrabold text-nile">العلاقات</p>
                          <ul className="mt-2 list-inside list-disc text-xs leading-6">
                            {(message.blueprint.structuredRelationships?.length ? message.blueprint.structuredRelationships.map((relation) => `${relation.left} ${relation.cardinality} ${relation.right}: ${relation.label}`) : message.blueprint.relationships).map((relation) => <li key={relation}>{relation}</li>)}
                          </ul>
                        </div>
                        <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                          <p className="font-extrabold text-nile">صفحات وواجهات مقترحة</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {message.blueprint.pages.map((page) => <span key={page} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-nile dark:bg-zinc-800">{page}</span>)}
                          </div>
                        </div>
                        {message.blueprint.mvpPlan?.length > 0 && (
                          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                            <p className="font-extrabold text-nile">خطة MVP المقترحة</p>
                            <div className="mt-2 grid gap-2 md:grid-cols-3">
                              {message.blueprint.mvpPlan.map((phase) => (
                                <div key={phase.phase} className="rounded-lg bg-white p-3 text-xs dark:bg-zinc-800">
                                  <p className="font-black text-nile">{phase.phase}</p>
                                  <p className="mt-1 font-extrabold">{phase.title}</p>
                                  <ul className="mt-2 list-inside list-disc leading-6">
                                    {phase.tasks.map((task) => <li key={task}>{task}</li>)}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {message.blueprint.risks?.length > 0 && (
                          <div className="rounded-lg bg-red-50 p-3 dark:bg-red-950/30">
                            <p className="font-extrabold text-red-800 dark:text-red-100">مخاطر تقنية وطريقة تخفيفها</p>
                            <div className="mt-2 grid gap-2">
                              {message.blueprint.risks.map((risk) => (
                                <div key={`${risk.title}-${risk.level}`} className="rounded-lg bg-white p-2 text-xs dark:bg-zinc-900">
                                  <p className="font-extrabold">{risk.title} <span className="text-red-700">({risk.level})</span></p>
                                  <p className="mt-1 leading-6 text-zinc-600 dark:text-zinc-300">{risk.mitigation}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {message.blueprint.acceptanceCriteria?.length > 0 && (
                          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                            <p className="font-extrabold text-nile">معايير قبول قابلة للاختبار</p>
                            <ul className="mt-2 list-inside list-disc text-xs leading-6">
                              {message.blueprint.acceptanceCriteria.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </div>
                        )}
                        <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                          <p className="font-extrabold text-nile">API endpoints مبدئية</p>
                          <pre className="mt-2 max-h-36 overflow-auto rounded-lg bg-zinc-950 p-3 text-left text-xs text-emerald-100" dir="ltr">{message.blueprint.apiEndpoints.join("\n")}</pre>
                        </div>
                        {message.blueprint.sqlSchema && (
                          <details className="rounded-lg bg-zinc-950 p-3 text-left text-xs text-emerald-100" dir="ltr">
                            <summary className="cursor-pointer text-right font-bold text-white" dir="rtl">SQL schema أولي</summary>
                            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{message.blueprint.sqlSchema}</pre>
                          </details>
                        )}
                        {Object.entries(message.blueprint.mermaid || {}).map(([name, code]) => (
                          <details key={name} className="rounded-lg bg-zinc-950 p-3 text-left text-xs text-emerald-100" dir="ltr">
                            <summary className="cursor-pointer text-right font-bold text-white" dir="rtl">Mermaid {name}</summary>
                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{code}</pre>
                          </details>
                        ))}
                        {message.blueprint.defenseQuestions?.length > 0 && (
                          <div className="rounded-lg bg-green-50 p-3 text-xs dark:bg-emerald-950/40">
                            <p className="font-extrabold text-nile">أسئلة متوقعة بالدفاع عن التصميم</p>
                            <ul className="mt-2 list-inside list-disc leading-6">
                              {message.blueprint.defenseQuestions.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </div>
                        )}
                        {(message.blueprint.assumptions?.length > 0 || message.blueprint.clarifyingQuestions?.length > 0) && (
                          <div className="rounded-lg bg-amber-50 p-3 text-xs dark:bg-amber-950/40">
                            {message.blueprint.assumptions?.length > 0 && (
                              <>
                                <p className="font-extrabold text-amber-800 dark:text-amber-100">افتراضات المساعد</p>
                                <ul className="mt-1 list-inside list-disc leading-6">
                                  {message.blueprint.assumptions.map((item) => <li key={item}>{item}</li>)}
                                </ul>
                              </>
                            )}
                            {message.blueprint.clarifyingQuestions?.length > 0 && (
                              <>
                                <p className="mt-2 font-extrabold text-amber-800 dark:text-amber-100">أسئلة لتدقيق التصميم</p>
                                <ul className="mt-1 list-inside list-disc leading-6">
                                  {message.blueprint.clarifyingQuestions.map((item) => <li key={item}>{item}</li>)}
                                </ul>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {message.role === "assistant" && message.id !== "welcome" && (
                      <AssistantFeedback token={token} message={message} />
                    )}
                  </div>
                );
              })}
              {assistantLoading && (
                <div className="max-w-[80%] justify-self-end rounded-lg rounded-tr-sm bg-white px-4 py-3 text-sm font-bold text-zinc-500 shadow-sm dark:bg-zinc-800">
                  المساعد يكتب...
                </div>
              )}
              <span ref={assistantEndRef} />
            </div>
            {assistantError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700 dark:bg-red-950 dark:text-red-100">{assistantError}</p>}
          </div>
          <form onSubmit={(event) => runAssistant(event)} className="border-t border-black/10 bg-green-50 p-3 dark:border-white/10 dark:bg-emerald-950/50">
            <label className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-nile dark:bg-zinc-900">
              <span>وضع الأدلة الذكية RAG + مشاريع قاعدة البيانات</span>
              <input
                type="checkbox"
                checked={assistantUseRag}
                onChange={(event) => setAssistantUseRag(event.target.checked)}
              />
            </label>
            <input
              className="mb-2 h-10 w-full rounded-full border border-transparent bg-white px-4 text-sm outline-none focus:border-nile dark:bg-zinc-900"
              placeholder="التقنيات اختياري: React, Python, PostgreSQL"
              value={assistantTech}
              onChange={(event) => setAssistantTech(event.target.value)}
            />
            <div className="flex items-end gap-2">
              <textarea
                ref={assistantInputRef}
                className="min-h-12 max-h-32 flex-1 resize-none rounded-3xl border border-transparent bg-white px-5 py-3 text-sm outline-none focus:border-nile dark:bg-zinc-900"
                placeholder="اكتب فكرة مشروعك أو سؤالك للمساعد..."
                value={assistantText}
                onChange={(event) => setAssistantText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button title="إرسال للمساعد" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-nile text-white transition hover:bg-emerald-900 disabled:opacity-50" disabled={assistantLoading || (!assistantText.trim() && !assistantTech.trim())}>
                <Send size={19} />
              </button>
            </div>
            <button
              type="button"
              onClick={(event) => runAssistant(event, true)}
              className="mt-2 w-full rounded-full border border-emerald-900/20 bg-white px-4 py-2 text-sm font-extrabold text-nile transition hover:bg-emerald-50 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              disabled={assistantLoading || (!assistantText.trim() && !assistantTech.trim())}
            >
              توليد Blueprint كامل للفكرة
            </button>
          </form>
        </div>
      )}
      {open && mode === "messages" && (
        <div className="mb-3 grid h-[min(680px,calc(100vh-110px))] w-[min(980px,calc(100vw-40px))] overflow-hidden rounded-lg border border-emerald-950/15 bg-[#efeae2] shadow-2xl shadow-emerald-950/20 dark:border-white/10 dark:bg-zinc-950 md:grid-cols-[320px_1fr]" dir="ltr">
          <aside className={classNames("min-h-0 border-b border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900 md:block md:border-b-0 md:border-r", threadOpen && "hidden")} dir="rtl">
            <div className="flex items-center justify-between bg-green-50 px-4 py-3 dark:bg-emerald-950/50">
              <div className="flex items-center gap-3">
                <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
                <h2 className="font-extrabold">المحادثات</h2>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMode("menu")} className="mini-action text-zinc-700 dark:text-white"><ArrowRight size={16} /> رجوع</button>
                <button title="إغلاق" onClick={() => setOpen(false)} className="mini-action text-zinc-700 dark:text-white"><XCircle size={16} /></button>
              </div>
            </div>
            <div className="border-t border-black/10 p-3 dark:border-white/10">
              <input
                className="h-10 w-full rounded-full border border-transparent bg-zinc-100 px-4 text-sm outline-none focus:border-nile dark:bg-zinc-800"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="بحث عن اسم..."
              />
            </div>
            <div className="max-h-52 overflow-y-auto pb-3 md:max-h-[620px]">
              {!!filteredMessageConversations.length && (
                <p className="px-4 pb-2 pt-1 text-xs font-extrabold text-nile/80">المحادثات السابقة</p>
              )}
              {filteredMessageConversations.map(({ partner, last }) => (
                <button
                  key={partner.id}
                  type="button"
                  onClick={() => selectPartner(partner.id)}
                  className={classNames(
                    "flex w-full items-center gap-3 border-t border-black/10 px-4 py-3 text-right transition dark:border-white/10",
                    String(selectedId) === String(partner.id) ? "bg-green-50 dark:bg-emerald-950/40" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  )}
                >
                  <Avatar name={partner.full_name} src={partner.avatar_url} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold">{partner.full_name}</span>
                    <span className="block text-xs text-zinc-500">{roleLabels[partner.role] || partner.role || "مستخدم"}</span>
                    <span className="mt-1 block truncate text-sm text-zinc-600 dark:text-zinc-300">{last.body}</span>
                  </span>
                </button>
              ))}
              {!messageConversations.length && !search.trim() && (
                <div className="mx-3 mb-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 text-sm font-bold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800">
                  لا توجد محادثات سابقة بعد.
                </div>
              )}
              {!!filteredNewContacts.length && (
                <p className="px-4 pb-2 pt-3 text-xs font-extrabold text-nile/80">بدء محادثة جديدة</p>
              )}
              {filteredNewContacts.map((partner) => (
                <button
                  key={partner.id}
                  type="button"
                  onClick={() => selectPartner(partner.id)}
                  className={classNames(
                    "flex w-full items-center gap-3 border-t border-black/10 px-4 py-3 text-right transition dark:border-white/10",
                    String(selectedId) === String(partner.id) ? "bg-green-50 dark:bg-emerald-950/40" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  )}
                >
                  <Avatar name={partner.full_name} src={partner.avatar_url} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold">{partner.full_name}</span>
                    <span className="block text-xs text-zinc-500">{roleLabels[partner.role] || partner.role || "مستخدم"}</span>
                    <span className="mt-1 block truncate text-sm text-zinc-500">لا توجد رسائل سابقة</span>
                  </span>
                </button>
              ))}
              {!filteredMessageConversations.length && !filteredNewContacts.length && (
                <p className="p-4 text-sm font-bold text-zinc-500">لا توجد نتائج مطابقة.</p>
              )}
            </div>
          </aside>
          <section className={classNames("h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden md:grid", threadOpen ? "grid" : "hidden")} dir="rtl">
            <header className="flex items-center gap-3 border-b border-black/10 bg-green-50 px-4 py-3 dark:border-white/10 dark:bg-emerald-950/50">
              <button type="button" onClick={() => setThreadOpen(false)} className="mini-action text-zinc-700 dark:text-white md:hidden" title="رجوع للقائمة">
                <ArrowRight size={16} />
              </button>
              <Avatar name={selectedContact?.full_name || "اختر محادثة"} src={selectedContact?.avatar_url} />
              <div>
                <p className="font-extrabold">{selectedContact?.full_name || "اختر محادثة"}</p>
                <p className="text-xs text-zinc-500">المحادثة تظهر فقط للطرفين المشاركين فيها</p>
              </div>
            </header>
            <div className="min-h-0 overflow-y-auto bg-[#efeae2] p-4 dark:bg-zinc-950">
              <div className="grid gap-3">
                {thread.map((message) => {
                  const mine = message.sender_id === user.id;
                  const diagramShare = parseDiagramShare(message.body);
                  const senderName = mine ? user.fullName : message.sender_name;
                  const senderAvatar = mine ? user.avatarUrl : message.sender_avatar_url;
                  return (
                    <div key={message.id} className={classNames("flex max-w-[92%] items-end gap-2", mine ? "justify-self-start" : "justify-self-end flex-row-reverse")}>
                      <Avatar name={senderName} src={senderAvatar} size="sm" />
                      <div className={classNames("min-w-0 max-w-[min(32rem,calc(100vw-8rem))] rounded-lg px-4 py-2 text-sm shadow-sm", mine ? "rounded-tl-sm bg-[#dcf8c6] text-ink" : "rounded-tr-sm bg-white text-ink dark:bg-zinc-800 dark:text-white")}>
                        <p className="mb-1 text-xs font-extrabold text-nile/80 dark:text-emerald-100">{senderName}</p>
                        {diagramShare ? (
                          <DiagramShareCard
                            details={diagramShare}
                            canReview={user.role === "supervisor" && !mine}
                            onReview={() => {
                              setBody("تعليقي على المخطط:\n- ");
                              messageInputRef.current?.focus();
                            }}
                          />
                        ) : (
                          <p className="whitespace-pre-wrap break-words leading-7">{message.body}</p>
                        )}
                        <p className="mt-1 text-left text-[11px] text-zinc-500">{new Date(message.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>
                  );
                })}
                {!thread.length && <EmptyState>لا توجد رسائل مع هذا الشخص بعد.</EmptyState>}
                <span ref={threadEndRef} />
              </div>
            </div>
            <form onSubmit={sendMessage} className="shrink-0 border-t border-black/10 bg-green-50 p-3 dark:border-white/10 dark:bg-emerald-950/50">
              {error && <p className="mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
              <div className="flex items-center gap-2">
                <textarea
                  ref={messageInputRef}
                  className="min-h-12 max-h-28 flex-1 resize-none rounded-3xl border border-transparent bg-white px-5 py-3 outline-none focus:border-nile disabled:cursor-not-allowed disabled:bg-zinc-100 dark:bg-zinc-900 dark:disabled:bg-zinc-800"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder={canWrite ? "اكتب رسالة..." : "اختر شخصاً من القائمة أولاً"}
                  disabled={!canWrite}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button title="إرسال" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-nile text-white transition hover:bg-emerald-900 disabled:opacity-50" disabled={!canWrite || !body.trim()}>
                  <Send size={19} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      <button
        title="الخدمات السريعة"
        onClick={toggleLauncher}
        className="relative grid h-14 w-14 place-items-center rounded-full bg-nile text-white shadow-xl shadow-emerald-950/30 transition hover:bg-emerald-900"
      >
        {unreadCount > 0 && !open && (
          <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-red-500 px-1.5 text-xs font-black text-white ring-2 ring-white dark:ring-zinc-950">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {open ? <XCircle size={25} /> : <MessageCircle size={25} />}
      </button>
    </div>
  );
}
