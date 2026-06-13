# دليل تشغيل مشروع CapstoneHub

هذا الدليل فيه كل الأوامر والخطوات اللازمة لتشغيل المشروع على جهازك.

## 1. المتطلبات

قبل التشغيل تأكد أن البرامج التالية موجودة:

- Docker Desktop
- Node.js، فقط إذا بدك تشغل الخدمات بدون Docker
- Git، اختياري

الأفضل للمشروع حالياً هو التشغيل عبر Docker لأنه يشغل:

- PostgreSQL
- Backend
- Frontend
- AI Service

## 2. تشغيل المشروع عبر Docker

افتح PowerShell داخل مجلد المشروع أو نفذ:

```powershell
cd C:\Users\IMO\Desktop\CapstoneHub
```

أول تشغيل أو بعد تعديل Dockerfile:

```powershell
docker compose up -d --build
```

التشغيل اليومي الأسرع، إذا الصور مبنية سابقاً:

```powershell
docker compose up -d --no-build
```

إذا صار خطأ أثناء بناء خدمة الـ AI بسبب بطء تحميل مكتبات Python من الإنترنت، استخدم:

```powershell
docker compose up -d --no-build
```

## 3. روابط المشروع

بعد التشغيل افتح:

- الواجهة: `http://localhost:5173`
- الباك إند: `http://localhost:4000`
- فحص الباك إند: `http://localhost:4000/api/health`
- توثيق API: `http://localhost:4000/api/docs`
- خدمة الذكاء الاصطناعي: `http://localhost:8000`
- فحص خدمة الذكاء الاصطناعي: `http://localhost:8000/health`

## 4. الحسابات التجريبية

كلمة السر لكل الحسابات:

```text
Password123!
```

الحسابات الأساسية:

- الطالب: `student1@capstonehub.local`
- المشرف: `sara@capstonehub.local`
- الأدمن: `admin@capstonehub.local`

## 5. فحص حالة الحاويات

لمعرفة هل المشروع شغال:

```powershell
docker ps
```

أو:

```powershell
docker compose ps
```

قراءة آخر logs:

```powershell
docker compose logs --tail=80
```

متابعة logs بشكل مباشر:

```powershell
docker compose logs -f
```

## 6. إيقاف المشروع

إيقاف الحاويات بدون حذف البيانات:

```powershell
docker compose down
```

تشغيله مرة ثانية:

```powershell
docker compose up -d --no-build
```

## 7. قاعدة البيانات PostgreSQL

بيانات الاتصال من pgAdmin أو أي برنامج PostgreSQL:

- Host: `localhost`
- Port: `5432`
- Database: `capstonehub`
- Username: `capstone`
- Password: `capstone`

فحص قاعدة البيانات من Docker:

```powershell
docker exec -it capstonehub-postgres-1 psql -U capstone -d capstonehub
```

عرض الجداول داخل psql:

```sql
\dt
```

الخروج:

```sql
\q
```

ملاحظة: بيانات قاعدة البيانات محفوظة داخل Docker volume، يعني لا تنحذف عند `docker compose down`.

## 8. تشغيل بدون Docker، للتطوير فقط

هذه الطريقة تحتاج PostgreSQL شغال مسبقاً.

تشغيل الباك إند:

```powershell
cd C:\Users\IMO\Desktop\CapstoneHub\backend
npm install
npm run seed
npm run dev
```

تشغيل الفرونت إند:

```powershell
cd C:\Users\IMO\Desktop\CapstoneHub\frontend
npm install
npm run dev
```

تشغيل خدمة الذكاء الاصطناعي:

```powershell
cd C:\Users\IMO\Desktop\CapstoneHub\ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## 9. أوامر مفيدة عند حدوث مشكلة

إعادة تشغيل المشروع بدون بناء:

```powershell
docker compose down
docker compose up -d --no-build
```

إعادة بناء الواجهة فقط:

```powershell
docker compose up -d --build --no-deps frontend
```

إعادة بناء الباك إند فقط:

```powershell
docker compose up -d --build --no-deps backend
```

إعادة تشغيل كل شيء مع بناء كامل:

```powershell
docker compose up -d --build
```

## 10. مشاكل شائعة

إذا ظهر خطأ أن Docker daemon غير شغال:

- افتح Docker Desktop
- انتظر حتى تظهر عبارة Docker is running
- شغل الأمر مرة ثانية

إذا ظهر خطأ أثناء بناء `ai-service` بسبب `Read timed out`:

```powershell
docker compose up -d --no-build
```

إذا لم تفتح الواجهة:

```powershell
docker ps
docker compose logs --tail=80 frontend
```

إذا تسجيل الدخول لا يعمل:

```powershell
docker compose logs --tail=80 backend
```

ثم تأكد أن رابط API في الواجهة هو:

```text
http://localhost:4000/api
```

## 11. أمر التشغيل المختصر

للاستخدام اليومي غالباً يكفي:

```powershell
cd C:\Users\IMO\Desktop\CapstoneHub
docker compose up -d --no-build
```

## 12. فحص النسخة النهائية

قبل المناقشة شغل:

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

يجب أن تكون الخدمات التالية `healthy`: `frontend`, `backend`, `ai-service`, `postgres`.

## 13. ملاحظات أمان محلية

- كلمة سر Demo محلية فقط: `Password123!`.
- لا تستخدم هذه البيانات للنشر العام.
- لا تشغل `NODE_ENV=production` بدون `JWT_SECRET` قوي وطويل.
- هذه النسخة لا تنفذ Deploy Online ولا تحتاج Vercel أو Netlify أو Render أو Railway أو Fly.io أو Supabase أو Neon.
