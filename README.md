# CapstoneHub

CapstoneHub منصة عربية محلية لإدارة مشاريع التخرج بين الطالب والمشرف والإدارة. النسخة الحالية مجهزة للعرض الأكاديمي محلياً عبر Docker، مع بيانات Demo مرتبة وخدمة ذكاء اصطناعي للمطابقة، فحص الأفكار، توليد Blueprint، تحليل الملفات، ولوحة مخاطر.

## التشغيل السريع

```powershell
docker compose up -d --build
docker compose ps
```

افتح الواجهة:

```text
http://localhost:5173
```

روابط الخدمات:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`
- Swagger: `http://localhost:4000/api/docs`
- AI Service: `http://localhost:8000`
- Backend health: `http://localhost:4000/api/health`
- AI health: `http://localhost:8000/health`

## حسابات العرض

كلمة السر المحلية لكل حسابات Demo:

```text
Password123!
```

- طالب: `student1@capstonehub.local`
- مشرف: `sara@capstonehub.local`
- إدارة: `admin@capstonehub.local`

هذه الحسابات محلية للعرض فقط وليست للنشر العام.

## مكونات النظام

- `frontend`: React + Vite + Tailwind، واجهة RTL بثلاث تجارب حسب الدور.
- `backend`: Express API، مصادقة JWT، صلاحيات، رفع ملفات، رسائل، تنبيهات، ولوحات تحكم.
- `ai-service`: FastAPI، RAG محلي، تشابه أفكار، توصية مشرفين، تحليل ملفات، وخوارزمية مخاطر.
- `postgres`: PostgreSQL مع pgvector لتخزين وثائق وفهارس الذكاء.
- `db/init.sql`: مخطط قاعدة البيانات والفهارس الأساسية.

## مسارات العرض الأساسية

- الطالب: تسجيل الدخول، الاستبيان، طلب مشروع، توليد Blueprint، فحص التشابه، اختيار مشرف، رسم Mermaid، تصدير صورة، مشاركة المخطط، رفع فصل، تحليل الملف، المحادثة.
- المشرف: مراجعة الطلبات، قبول أو طلب تعديل أو رفض، متابعة مخططات وملفات الطلاب، تقييم Blueprint، إضافة مراحل، التعليق والمراسلة.
- الإدارة: الإحصاءات، الحسابات، اعتماد الملفات، التقويم، سعات المشرفين، المشاكل التقنية، لوحة المخاطر، المشاريع المؤرشفة، الاستبيانات.

## التحقق النهائي

```powershell
node --check backend/src/routes/features.js
node --check backend/src/routes/ai.js
python -m py_compile ai-service/rag.py ai-service/main.py
cd frontend
npm run build
cd ..
docker compose up -d --build
docker compose ps
```

## توثيق إضافي

- [دليل التشغيل](SETUP_GUIDE.md)
- [المعمارية](docs/ARCHITECTURE.md)
- [شرح المساعد الذكي](docs/AI_ASSISTANT_EXPLANATION.md)
- [سيناريو العرض](docs/DEMO_SCRIPT.md)
- [هيكل السلايدات](docs/PRESENTATION_OUTLINE.md)

## ملاحظات أمان

- لا يوجد نشر Online في هذه النسخة.
- `JWT_SECRET` المحلي مخصص للديمو، ويوجد حارس يمنع الأسرار الافتراضية أو القصيرة عند `NODE_ENV=production`.
- ملفات PDF/DOCX تتحقق من الامتداد وMIME وبصمة الملف قبل الحفظ.
- endpoints الحساسة تفحص الدور والملكية لمشاريع الطلاب وملفاتهم وتقييمات المشرفين.
