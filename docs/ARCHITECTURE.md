# معمارية CapstoneHub

## نظرة عامة

CapstoneHub يعمل محلياً عبر Docker Compose ويتكون من أربع خدمات: واجهة React، Backend Express، خدمة AI FastAPI، وقاعدة PostgreSQL مع pgvector. التواصل بين الواجهة والباكند يتم عبر REST API، والباكند يستدعي خدمة الذكاء عند الحاجة.

## تدفق الطلب

1. المستخدم يسجل الدخول من الواجهة.
2. الباكند يتحقق من كلمة المرور ويصدر JWT يحتوي الدور وحالة الملف.
3. الواجهة تعرض Navigation حسب الدور فقط.
4. كل API حساس يمر عبر `requireAuth` و`requireApproved` ثم `allowRoles`.
5. عند طلب AI، الباكند يجلب السياق من PostgreSQL ثم يستدعي `ai-service`.
6. النتائج تحفظ عند الحاجة في جداول مثل `project_blueprints` و`ai_document_analyses`.

## Frontend

- المسار: `frontend`
- التقنية: React, Vite, Tailwind, lucide-react, mermaid, canvg
- الملفات المهمة:
  - `src/App.jsx`: اختيار لوحة الطالب أو المشرف أو الإدارة.
  - `src/layout/Shell.jsx`: الهيكل العام، التنبيهات، الرسائل، RTL.
  - `src/pages/student/StudentDashboard.jsx`: رحلة الطالب.
  - `src/pages/supervisor/SupervisorDashboard.jsx`: متابعة وتقييم الطلاب.
  - `src/pages/admin/AdminDashboard.jsx`: الإدارة والمؤشرات والمخاطر.
  - `src/components/DiagramStudio.jsx`: محرر Mermaid والتصدير والمشاركة.

## Backend

- المسار: `backend`
- التقنية: Node.js, Express, PostgreSQL, JWT, Multer
- الملفات المهمة:
  - `src/server.js`: تركيب routes والـ Swagger والـ health.
  - `src/middleware.js`: JWT، rate limit، صلاحيات، error handler.
  - `src/db.js`: الاتصال وتهيئة schema المتدرج.
  - `src/seed.js`: بيانات Demo وتنظيف بقايا الاختبار.
  - `src/routes/projects.js`: طلبات المشاريع، المراجعة، الفصول، المراحل.
  - `src/routes/ai.js`: proxy آمن لخدمة الذكاء.
  - `src/routes/features.js`: Blueprint، بنك أفكار، Rubric، Feedback.
  - `src/routes/admin.js`: إدارة الحسابات والتقويم والتقارير.

## Database

أهم الجداول:

- `users`, `students`, `supervisors`: الأدوار والملفات التعريفية.
- `projects`, `milestones`, `submissions`: دورة حياة المشروع.
- `project_blueprints`: التصميم الأولي وملاحظات المشرف.
- `messages`, `notifications`: التواصل والتنبيهات.
- `survey_forms`, `survey_responses`: الاستبيانات مرة واحدة لكل مستخدم.
- `technical_reports`: مشاكل تقنية مع لقطة شاشة.
- `ai_documents`, `ai_chunks`, `ai_model_runs`: فهارس ومخرجات RAG.
- `ai_document_analyses`, `assistant_feedback`: تحليل الملفات وتقييم المساعد.

## AI Service

- المسار: `ai-service`
- التقنية: FastAPI, scikit-learn, pgvector, python-docx, pypdf
- يقدم endpoints للمطابقة، البحث الدلالي، RAG، فحص التشابه، الخطة الزمنية، تحليل الأطروحة، وتصنيف المخاطر.

## الصلاحيات

- الطالب يرى مشاريعه وملفاته فقط.
- الطالب لا يرفع فصولاً إلا لمشروعه.
- المشرف يراجع أو يقيّم المشاريع التابعة له فقط.
- الإدارة فقط تصل إلى إدارة المستخدمين والحسابات والتقارير العامة.
- Rubric وتقييم Blueprint يفحصان ملكية المشروع قبل الحفظ.

## بيانات Demo

تتضمن النسخة:

- طالب مفعل مع مشروع مقبول وملفات وتحليل.
- مشرف مفعل مع تخصصات وسعات.
- حساب إدارة مفعل.
- مشاريع مؤرشفة واقعية لاستخدام RAG والتشابه.
- مشروع بانتظار مراجعة ومشروع بحاجة تعديل.
- مشكلة تقنية مفتوحة ولوحة مخاطر.
