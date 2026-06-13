import bcrypt from "bcryptjs";
import fs from "fs/promises";
import path from "path";
import { deflateSync } from "zlib";
import { fallbackAcademicTerm } from "./academicTerms.js";
import { ensureSchema, pool, query } from "./db.js";

const seedPassword = process.env.SEED_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "Password123!");
if (!seedPassword) {
  throw new Error("SEED_PASSWORD is required when NODE_ENV=production");
}
const password = await bcrypt.hash(seedPassword, 10);
const currentTerm = fallbackAcademicTerm(new Date("2026-06-10T00:00:00Z"));
const uploadDir = process.env.UPLOAD_DIR || "uploads";
const pngCrcTable = new Uint32Array(256);
for (let n = 0; n < pngCrcTable.length; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  pngCrcTable[n] = c >>> 0;
}

function pngCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = pngCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createDemoPng(width, height, background, shapes) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = background[0];
    pixels[i + 1] = background[1];
    pixels[i + 2] = background[2];
  }

  const rect = (x1, y1, x2, y2, color) => {
    const left = Math.max(0, Math.min(width, x1));
    const top = Math.max(0, Math.min(height, y1));
    const right = Math.max(left, Math.min(width, x2));
    const bottom = Math.max(top, Math.min(height, y2));
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const index = (y * width + x) * 3;
        pixels[index] = color[0];
        pixels[index + 1] = color[1];
        pixels[index + 2] = color[2];
      }
    }
  };
  const border = (x1, y1, x2, y2, color, size = 3) => {
    rect(x1, y1, x2, y1 + size, color);
    rect(x1, y2 - size, x2, y2, color);
    rect(x1, y1, x1 + size, y2, color);
    rect(x2 - size, y1, x2, y2, color);
  };
  const line = (x1, y1, x2, y2, color, size = 3) => {
    let x = x1;
    let y = y1;
    const dx = Math.abs(x2 - x1);
    const dy = -Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      rect(x - Math.floor(size / 2), y - Math.floor(size / 2), x + Math.ceil(size / 2), y + Math.ceil(size / 2), color);
      if (x === x2 && y === y2) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  };

  for (const shape of shapes) {
    if (shape.type === "rect") rect(shape.x1, shape.y1, shape.x2, shape.y2, shape.color);
    if (shape.type === "border") border(shape.x1, shape.y1, shape.x2, shape.y2, shape.color, shape.size);
    if (shape.type === "line") line(shape.x1, shape.y1, shape.x2, shape.y2, shape.color, shape.size);
  }

  const rowLength = width * 3 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    pixels.copy(raw, y * rowLength + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function createDemoDiagramPng() {
  return createDemoPng(640, 360, [248, 250, 252], [
    { type: "rect", x1: 48, y1: 130, x2: 178, y2: 220, color: [236, 253, 245] },
    { type: "border", x1: 48, y1: 130, x2: 178, y2: 220, color: [4, 120, 87], size: 5 },
    { type: "rect", x1: 255, y1: 76, x2: 385, y2: 166, color: [239, 246, 255] },
    { type: "border", x1: 255, y1: 76, x2: 385, y2: 166, color: [37, 99, 235], size: 5 },
    { type: "rect", x1: 255, y1: 210, x2: 385, y2: 300, color: [255, 251, 235] },
    { type: "border", x1: 255, y1: 210, x2: 385, y2: 300, color: [217, 119, 6], size: 5 },
    { type: "rect", x1: 462, y1: 130, x2: 592, y2: 220, color: [254, 242, 242] },
    { type: "border", x1: 462, y1: 130, x2: 592, y2: 220, color: [220, 38, 38], size: 5 },
    { type: "line", x1: 178, y1: 175, x2: 255, y2: 121, color: [15, 118, 110], size: 5 },
    { type: "line", x1: 178, y1: 175, x2: 255, y2: 255, color: [15, 118, 110], size: 5 },
    { type: "line", x1: 385, y1: 121, x2: 462, y2: 175, color: [15, 118, 110], size: 5 },
    { type: "line", x1: 385, y1: 255, x2: 462, y2: 175, color: [15, 118, 110], size: 5 },
    { type: "rect", x1: 62, y1: 28, x2: 578, y2: 56, color: [209, 250, 229] },
    { type: "rect", x1: 62, y1: 316, x2: 578, y2: 330, color: [220, 252, 231] }
  ]);
}

function createDemoTechnicalReportPng() {
  return createDemoPng(640, 360, [255, 255, 255], [
    { type: "rect", x1: 0, y1: 0, x2: 640, y2: 68, color: [4, 120, 87] },
    { type: "rect", x1: 44, y1: 108, x2: 230, y2: 136, color: [220, 252, 231] },
    { type: "rect", x1: 44, y1: 150, x2: 310, y2: 178, color: [229, 231, 235] },
    { type: "rect", x1: 44, y1: 192, x2: 276, y2: 220, color: [229, 231, 235] },
    { type: "rect", x1: 360, y1: 108, x2: 596, y2: 136, color: [254, 226, 226] },
    { type: "rect", x1: 360, y1: 150, x2: 540, y2: 178, color: [254, 243, 199] },
    { type: "rect", x1: 360, y1: 192, x2: 584, y2: 220, color: [220, 252, 231] },
    { type: "border", x1: 40, y1: 92, x2: 316, y2: 242, color: [226, 232, 240], size: 3 },
    { type: "border", x1: 356, y1: 92, x2: 600, y2: 242, color: [226, 232, 240], size: 3 },
    { type: "rect", x1: 44, y1: 282, x2: 596, y2: 306, color: [240, 253, 244] },
    { type: "border", x1: 44, y1: 282, x2: 596, y2: 306, color: [22, 163, 74], size: 3 }
  ]);
}

function avatarFile(email) {
  return `demo-${email.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}.svg`;
}

async function ensureAvatar(email, initials, color = "#047857") {
  await fs.mkdir(uploadDir, { recursive: true });
  const filename = avatarFile(email);
  const filepath = path.join(uploadDir, filename);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect width="240" height="240" rx="52" fill="${color}"/>
  <circle cx="184" cy="56" r="28" fill="rgba(255,255,255,.18)"/>
  <text x="120" y="138" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" font-weight="800" fill="#fff">${initials}</text>
</svg>`;
  await fs.writeFile(filepath, svg, "utf8");
  return `/uploads/${filename}`;
}

async function ensureDemoFiles() {
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, "demo-default.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" rx="48" fill="#0f766e"/><text x="120" y="138" text-anchor="middle" font-family="Arial" font-size="48" font-weight="800" fill="#fff">CH</text></svg>`, "utf8");
  await fs.writeFile(path.join(uploadDir, "demo-diagram.png"), createDemoDiagramPng());
  await fs.writeFile(path.join(uploadDir, "demo-technical-report.png"), createDemoTechnicalReportPng());
  await fs.writeFile(path.join(uploadDir, "demo-thesis-chapter.docx"), "Demo thesis chapter placeholder. استخدمه كملف عرض فقط.", "utf8");
}

async function cleanupDemoNoise() {
  await query(`
    DELETE FROM projects
    WHERE title ILIKE '%AI Search Test%'
       OR title = 'QA Follow Up Project'
       OR title = 'dthdh'
       OR title LIKE '%?%'
       OR COALESCE(abstract, '') LIKE '%?%'
  `);
  await query(`
    DELETE FROM users
    WHERE email LIKE 'qa.student.%@capstonehub.local'
       OR email = 'fouad-ak2000@hotmail.com'
       OR full_name LIKE '%?%'
  `);
}

async function upsertUser({ email, role, fullName, department, phone, initials, color }) {
  const avatarUrl = await ensureAvatar(email, initials || fullName.slice(0, 2), color);
  const [user] = await query(
    `INSERT INTO users (email, password_hash, role, full_name, department, phone, avatar_url, profile_status, profile_approved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', now())
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           full_name = EXCLUDED.full_name,
           department = EXCLUDED.department,
           phone = COALESCE(EXCLUDED.phone, users.phone),
           avatar_url = EXCLUDED.avatar_url,
           profile_status = 'approved',
           profile_approved_at = COALESCE(users.profile_approved_at, now())
     RETURNING *`,
    [email, password, role, fullName, department, phone || null, avatarUrl]
  );
  return user;
}

async function upsertByLookup({ lookupSql, lookupParams, insertSql, insertParams, updateSql, updateParams }) {
  const [existing] = await query(lookupSql, lookupParams);
  if (existing) {
    return (await query(updateSql, [...updateParams, existing.id]))[0];
  }
  return (await query(insertSql, insertParams))[0];
}

function blueprintFor(domain, tables) {
  const tableObjects = tables.map((name) => ({
    name,
    purpose: `يمثل جدول ${name} أحد كيانات ${domain}`,
    fields: ["id SERIAL PRIMARY KEY", "name VARCHAR(150)", "status VARCHAR(50)", "created_at TIMESTAMP", "updated_at TIMESTAMP"]
  }));
  return {
    domain,
    confidence: 84,
    tables: tableObjects,
    relationships: tableObjects.slice(1).map((table) => `${tableObjects[0].name} has many ${table.name}`),
    pages: ["لوحة التحكم", "إدارة البيانات", "التقارير", "الإعدادات"],
    apiEndpoints: tableObjects.flatMap((table) => [`GET /api/${table.name.toLowerCase()}`, `POST /api/${table.name.toLowerCase()}`]),
    qualityScore: 82,
    mermaid: {
      erd: `erDiagram\n  ${tableObjects[0].name} ||--o{ ${tableObjects[1]?.name || "Item"} : manages`,
      flowchart: "flowchart TD\n  A[Proposal] --> B[Review]\n  B --> C[Implementation]\n  C --> D[Evaluation]"
    }
  };
}

const supervisors = [
  {
    email: "sara@capstonehub.local",
    fullName: "د. سارة الخطيب",
    initials: "س خ",
    department: "هندسة البرمجيات",
    phone: "+963 944 120 331",
    specialization: "الذكاء الاصطناعي ومعالجة اللغة الطبيعية",
    expertise: ["AI", "NLP", "Python", "education technology", "RAG"],
    languages: ["Python", "JavaScript"],
    tools: ["FastAPI", "scikit-learn", "Docker", "Git"],
    bio: "مشرفة تهتم بتطبيقات الذكاء الاصطناعي في التعليم، تحليل النصوص العربية، وبناء مساعدين أكاديميين قابلين للتقييم.",
    capacity: 5,
    color: "#047857"
  },
  {
    email: "mahmoud.backend@capstonehub.local",
    fullName: "د. محمود ناصر",
    initials: "م ن",
    department: "هندسة المعلومات",
    phone: "+963 933 210 445",
    specialization: "الأنظمة الخلفية وقواعد البيانات",
    expertise: ["Node.js", "PostgreSQL", "REST APIs", "Docker", "Security"],
    languages: ["Node.js", "SQL", "JavaScript"],
    tools: ["Express", "PostgreSQL", "Docker", "Swagger"],
    bio: "يركز على تصميم قواعد البيانات، واجهات REST، أمن الصلاحيات، ونشر الخدمات بالحاويات.",
    capacity: 6,
    color: "#0f766e"
  },
  {
    email: "rima.mobile@capstonehub.local",
    fullName: "م. ريما الحسن",
    initials: "ر ح",
    department: "هندسة المعلومات",
    phone: "+963 955 442 118",
    specialization: "تطبيقات الموبايل وتجربة المستخدم",
    expertise: ["Flutter", "Dart", "Firebase", "Mobile UX", "Maps"],
    languages: ["Dart", "JavaScript"],
    tools: ["Flutter", "Firebase", "Figma", "Git"],
    bio: "تدعم مشاريع الموبايل متعددة المنصات مع اهتمام واضح بتجربة المستخدم وربط التطبيقات بالخدمات السحابية.",
    capacity: 5,
    color: "#2563eb"
  },
  {
    email: "khaled.web@capstonehub.local",
    fullName: "د. خالد مراد",
    initials: "خ م",
    department: "هندسة البرمجيات",
    phone: "+963 944 778 602",
    specialization: "هندسة الواجهات وتطبيقات الويب",
    expertise: ["React", "JavaScript", "UI Engineering", "Tailwind", "Dashboards"],
    languages: ["React", "JavaScript", "TypeScript"],
    tools: ["Vite", "Tailwind", "Figma", "Git"],
    bio: "مختص ببناء واجهات ويب تفاعلية ولوحات تحكم إدارية قابلة للفحص والاستخدام المتكرر.",
    capacity: 6,
    color: "#7c3aed"
  },
  {
    email: "lana.data@capstonehub.local",
    fullName: "د. لانا شاهين",
    initials: "ل ش",
    department: "هندسة المعلومات",
    phone: "+963 932 664 019",
    specialization: "علم البيانات والتحليلات التنبؤية",
    expertise: ["Python", "Data Science", "Machine Learning", "Pandas", "Predictive Analytics"],
    languages: ["Python", "SQL"],
    tools: ["Pandas", "scikit-learn", "Jupyter", "PostgreSQL"],
    bio: "تهتم بتحليل البيانات وبناء نماذج تنبؤية قابلة للدمج ضمن الأنظمة الأكاديمية والإدارية.",
    capacity: 4,
    color: "#be123c"
  },
  {
    email: "omar.security@capstonehub.local",
    fullName: "م. عمر المصري",
    initials: "ع م",
    department: "هندسة الشبكات",
    phone: "+963 988 301 744",
    specialization: "أمن التطبيقات والشبكات",
    expertise: ["Cybersecurity", "Linux", "Networking", "DevOps", "Monitoring"],
    languages: ["Python", "Bash"],
    tools: ["Linux", "Docker", "Nginx", "Wireshark"],
    bio: "يراجع مشاريع النشر، أمن الصلاحيات، المراقبة، وإعداد بيئات Linux للخدمات الجامعية.",
    capacity: 4,
    color: "#374151"
  },
  {
    email: "l@gmail.com",
    fullName: "د. لارا قديد",
    initials: "ل ق",
    department: "هندسة المعلومات",
    phone: "09645742452",
    specialization: "تحليل النصوص والأنظمة الذكية",
    expertise: ["NLP", "Arabic NLP", "RAG", "Python", "Evaluation"],
    languages: ["Python", "JavaScript"],
    tools: ["FastAPI", "OpenAI API", "Docker", "VS Code"],
    bio: "تتابع مشاريع المساعدات الذكية وتحليل الوثائق وتقييم جودة الإجابات المدعومة بالمراجع.",
    capacity: 5,
    color: "#0891b2"
  }
];

const students = [
  {
    email: "student1@capstonehub.local",
    fullName: "أحمد العلي",
    initials: "أ ع",
    studentId: "IT-2026-001",
    phone: "+963 955 110 201",
    interests: "React, Node.js, PostgreSQL, UX, نظم إدارة المشاريع",
    supervisorEmail: "sara@capstonehub.local",
    project: {
      title: "منصة إدارة مشاريع التخرج الذكية",
      abstract: "منصة تساعد الطلاب على اقتراح المشاريع، مطابقة المشرفين، رفع الفصول، وتحليل الأطروحة والمخططات بالذكاء الاصطناعي.",
      status: "approved",
      tech: ["React", "Node.js", "PostgreSQL", "FastAPI", "NLP"],
      deadline: "2026-08-19",
      scores: [5, 4, 4, 5]
    }
  },
  {
    email: "student2@capstonehub.local",
    fullName: "نور الخطيب",
    initials: "ن خ",
    studentId: "IT-2026-002",
    phone: "+963 955 110 202",
    interests: "Flutter, Firebase, Maps, Mobile UX",
    supervisorEmail: "rima.mobile@capstonehub.local",
    project: {
      title: "تطبيق موبايل لتنظيم النقل الجامعي",
      abstract: "تطبيق يعرض مسارات الباصات ومواعيد الوصول والتنبيهات مع لوحة متابعة للإدارة.",
      status: "revision_requested",
      tech: ["Flutter", "Firebase", "Maps", "Dart"],
      deadline: "2026-08-28",
      feedback: "الفكرة جيدة، لكن يجب تضييق نطاق التتبع اللحظي وتوضيح مصادر البيانات.",
      scores: [4, 3, 4, 3]
    }
  },
  {
    email: "student3@capstonehub.local",
    fullName: "ليث منصور",
    initials: "ل م",
    studentId: "IT-2026-003",
    phone: "+963 955 110 203",
    interests: "Cybersecurity, Linux, Monitoring, DevOps",
    supervisorEmail: "omar.security@capstonehub.local",
    project: {
      title: "منصة مراقبة أمنية لخدمات الجامعة",
      abstract: "نظام يجمع سجلات الخدمات ويكشف محاولات الدخول المشبوهة ويرسل تنبيهات للإدارة التقنية.",
      status: "pending_review",
      tech: ["Linux", "Python", "Monitoring", "Security"],
      deadline: "2026-09-05"
    }
  },
  {
    email: "student4@capstonehub.local",
    fullName: "مريم حسن",
    initials: "م ح",
    studentId: "IT-2026-004",
    phone: "+963 955 110 204",
    interests: "Machine Learning, Pandas, Dashboards, Prediction",
    supervisorEmail: "lana.data@capstonehub.local",
    project: {
      title: "لوحة تنبؤية لتعثر مشاريع التخرج",
      abstract: "لوحة تستخدم مؤشرات الاجتماعات ورفع الملفات والالتزام الزمني للتنبؤ بخطر تعثر المشروع.",
      status: "approved",
      tech: ["Python", "Machine Learning", "Pandas", "React"],
      deadline: "2026-08-30",
      scores: [4, 4, 3, 4]
    }
  },
  {
    email: "student5@capstonehub.local",
    fullName: "كريم يوسف",
    initials: "ك ي",
    studentId: "IT-2026-005",
    phone: "+963 955 110 205",
    interests: "React, Tailwind, Accessibility, UI Engineering",
    supervisorEmail: "khaled.web@capstonehub.local",
    project: {
      title: "نظام إدارة استبيانات أكاديمية تفاعلي",
      abstract: "نظام يسمح للإدارة بإنشاء استبيانات وتحليل النتائج وعرضها حسب القسم والدور.",
      status: "approved",
      tech: ["React", "Tailwind", "Node.js", "Charts"],
      deadline: "2026-09-12",
      scores: [5, 4, 5, 4]
    }
  },
  {
    email: "student6@capstonehub.local",
    fullName: "سلمى ناصر",
    initials: "س ن",
    studentId: "IT-2026-006",
    phone: "+963 955 110 206",
    interests: "RAG, Documents, NLP, Evaluation",
    supervisorEmail: "l@gmail.com",
    project: {
      title: "مساعد بحثي لتحليل ملفات الأطروحات",
      abstract: "مساعد يقرأ ملفات PDF وDOCX، يستخرج التقنيات والجداول والمخططات، ويقدم تقرير جودة أولي.",
      status: "approved",
      tech: ["Python", "RAG", "NLP", "FastAPI"],
      deadline: "2026-08-25",
      scores: [4, 5, 4, 4]
    }
  }
];

const archivedProjects = [
  ["archive.smart-library@capstonehub.local", "طالب أرشيف 01", "ARCH-IT-001", "نظام إدارة مكتبة ذكي باستخدام توصية الكتب", "تطبيق ويب لإدارة الإعارات والفهارس مع خوارزمية تقترح الكتب بناءً على سجل الطالب والكلمات المفتاحية.", ["React", "Node.js", "PostgreSQL"], "2025-07-20"],
  ["archive.clinic@capstonehub.local", "طالب أرشيف 02", "ARCH-IT-002", "منصة حجز مواعيد عيادات مع لوحة متابعة", "نظام لإدارة الأطباء والمواعيد والتنبيهات مع لوحة إحصاءات للإدارة وتجربة استخدام مخصصة للمريض.", ["Laravel", "MySQL", "Bootstrap"], "2025-07-22"],
  ["archive.attendance@capstonehub.local", "طالب أرشيف 03", "ARCH-IT-003", "تطبيق حضور جامعي باستخدام QR Code", "منصة تسجل حضور الطلاب عبر رموز مؤقتة وتعرض تقارير الغياب والتنبيهات للمحاضرين والإدارة.", ["Flutter", "Firebase", "QR"], "2025-07-25"],
  ["archive.ecommerce@capstonehub.local", "طالب أرشيف 04", "ARCH-IT-004", "متجر إلكتروني محلي مع إدارة مخزون", "تطبيق تجارة إلكترونية يدعم المنتجات والطلبات والدفع عند الاستلام ولوحة لإدارة المخزون والمبيعات.", ["React", "Node.js", "MongoDB"], "2025-07-28"],
  ["archive.helpdesk@capstonehub.local", "طالب أرشيف 05", "ARCH-IT-005", "نظام تذاكر دعم فني للجامعة", "نظام لإرسال ومتابعة المشاكل التقنية مع تصنيف الأولويات وإسناد التذاكر وتقارير زمن الاستجابة.", ["Vue", "PostgreSQL", "Docker"], "2025-08-01"],
  ["archive.lms@capstonehub.local", "طالب أرشيف 06", "ARCH-IT-006", "منصة تعليم إلكتروني مصغرة للمقررات العملية", "نظام يتيح نشر الدروس والواجبات والاختبارات القصيرة مع تتبع تقدم الطالب وتحليلات للمشرف.", ["React", "Django", "PostgreSQL"], "2025-08-04"],
  ["archive.transport@capstonehub.local", "طالب أرشيف 07", "ARCH-IT-007", "تطبيق تتبع باصات الجامعة", "تطبيق يعرض مواقع الباصات ومساراتها ومواعيد الوصول التقريبية مع تنبيهات للطلاب عند الاقتراب.", ["Flutter", "Maps", "Firebase"], "2025-08-08"],
  ["archive.inventory@capstonehub.local", "طالب أرشيف 08", "ARCH-IT-008", "نظام جرد مخابر الحاسوب", "منصة لإدارة أجهزة المخابر والصيانة الدورية والعهد مع سجل تغييرات وتقارير للأعطال المتكررة.", ["React", "Node.js", "PostgreSQL"], "2025-08-12"]
];

async function seedTerms() {
  const [term] = await query(
    `INSERT INTO academic_terms (code, label, starts_at, ends_at, registration_starts_at, registration_ends_at, is_active)
     VALUES ($1, 'الفصل الثاني 2025-2026', '2026-02-01', '2026-09-30', '2020-01-01', '2030-12-31', true)
     ON CONFLICT (code) DO UPDATE
       SET label = EXCLUDED.label,
           starts_at = EXCLUDED.starts_at,
           ends_at = EXCLUDED.ends_at,
           registration_starts_at = EXCLUDED.registration_starts_at,
           registration_ends_at = EXCLUDED.registration_ends_at,
           is_active = true
     RETURNING *`,
    [currentTerm]
  );
  await query("UPDATE academic_terms SET is_active = false WHERE id <> $1", [term.id]);
  return term;
}

async function seedSupervisors(term) {
  const map = new Map();
  for (const item of supervisors) {
    const user = await upsertUser({ ...item, role: "supervisor" });
    await query(
      `INSERT INTO supervisors (user_id, expertise_keywords, specialization, languages, tools, bio, max_students_capacity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE
         SET expertise_keywords = EXCLUDED.expertise_keywords,
             specialization = EXCLUDED.specialization,
             languages = EXCLUDED.languages,
             tools = EXCLUDED.tools,
             bio = EXCLUDED.bio,
             max_students_capacity = EXCLUDED.max_students_capacity`,
      [user.id, item.expertise, item.specialization, item.languages, item.tools, item.bio, item.capacity]
    );
    await query(
      `INSERT INTO supervisor_term_capacities (term_id, supervisor_id, max_students)
       VALUES ($1, $2, $3)
       ON CONFLICT (term_id, supervisor_id) DO UPDATE SET max_students = EXCLUDED.max_students, updated_at = now()`,
      [term.id, user.id, item.capacity]
    );
    map.set(item.email, user);
  }
  return map;
}

async function upsertStudentProfile(user, studentId, interests, supervisorId = null, status = "proposal") {
  await query(
    `INSERT INTO students (user_id, student_id, department, interests_text, supervisor_id, project_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE
       SET student_id = EXCLUDED.student_id,
           department = EXCLUDED.department,
           interests_text = EXCLUDED.interests_text,
           supervisor_id = EXCLUDED.supervisor_id,
           project_status = EXCLUDED.project_status`,
    [user.id, studentId, user.department, interests, supervisorId, status]
  );
}

async function upsertProject(student, projectData, supervisorId, adminId) {
  const project = await upsertByLookup({
    lookupSql: "SELECT id FROM projects WHERE student_id = $1 AND title = $2",
    lookupParams: [student.id, projectData.title],
    insertSql: `INSERT INTO projects (student_id, title, abstract, status, deadline, preferred_supervisor_id, tech_stack, academic_term, supervisor_feedback)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *`,
    insertParams: [student.id, projectData.title, projectData.abstract, projectData.status, projectData.deadline, supervisorId, projectData.tech, currentTerm, projectData.feedback || null],
    updateSql: `UPDATE projects
                SET abstract = $1,
                    status = $2,
                    deadline = $3,
                    preferred_supervisor_id = $4,
                    tech_stack = $5,
                    academic_term = $6,
                    supervisor_feedback = $7,
                    is_archived = false,
                    archived_at = null,
                    archive_approved_by = null
                WHERE id = $8
                RETURNING *`,
    updateParams: [projectData.abstract, projectData.status, projectData.deadline, supervisorId, projectData.tech, currentTerm, projectData.feedback || null]
  });

  const blueprint = blueprintFor(projectData.title, ["User", "Project", "Task", "Submission", "Notification", "Report"]);
  await query(
    `INSERT INTO project_blueprints (project_id, student_id, blueprint, source, tables_score, relationships_score, diagrams_score, feasibility_score, supervisor_notes, reviewed_by, reviewed_at)
     VALUES ($1, $2, $3, 'demo_seed', $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (project_id) DO UPDATE
       SET blueprint = EXCLUDED.blueprint,
           tables_score = EXCLUDED.tables_score,
           relationships_score = EXCLUDED.relationships_score,
           diagrams_score = EXCLUDED.diagrams_score,
           feasibility_score = EXCLUDED.feasibility_score,
           supervisor_notes = EXCLUDED.supervisor_notes,
           reviewed_by = EXCLUDED.reviewed_by,
           reviewed_at = now()`,
    [project.id, student.id, JSON.stringify(blueprint), ...(projectData.scores || [4, 4, 4, 4]), "تصميم أولي مناسب للعرض، ويحتاج مراجعة نهائية حسب نطاق الفريق.", supervisorId || adminId]
  );

  const milestones = [
    ["Proposal", "2026-06-20", "done"],
    ["تحليل المتطلبات", "2026-07-05", "done"],
    ["تصميم قاعدة البيانات والمخططات", "2026-07-20", projectData.status === "pending_review" ? "todo" : "done"],
    ["رفع الفصل الأول", "2026-08-05", projectData.status === "pending_review" ? "todo" : "done"],
    ["Defense", projectData.deadline, "todo"]
  ];
  for (const [title, dueDate, status] of milestones) {
    const [existing] = await query("SELECT id FROM milestones WHERE project_id = $1 AND title = $2", [project.id, title]);
    if (existing) {
      await query(
        "UPDATE milestones SET due_date = $1, status = $2, completed_at = CASE WHEN $2 = 'done' THEN COALESCE(completed_at, $1::date + time '12:00') ELSE null END WHERE id = $3",
        [dueDate, status, existing.id]
      );
    } else {
      await query(
        "INSERT INTO milestones (project_id, title, due_date, status, completed_at) VALUES ($1, $2, $3, $4, CASE WHEN $4 = 'done' THEN $3::date + time '12:00' ELSE null END)",
        [project.id, title, dueDate, status]
      );
    }
  }

  if (projectData.status !== "pending_review") {
    const [submission] = await query(
      `INSERT INTO submissions (project_id, file_url, chapter_name, feedback, score)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (SELECT 1 FROM submissions WHERE project_id = $1 AND chapter_name = $3)
       RETURNING *`,
      [project.id, "/uploads/demo-thesis-chapter.docx", "الفصل الأول", "الفصل واضح، أضف مراجع أكثر في قسم الدراسات السابقة.", projectData.status === "revision_requested" ? 72 : 86]
    );
    const submissionId = submission?.id || (await query("SELECT id FROM submissions WHERE project_id = $1 AND chapter_name = 'الفصل الأول'", [project.id]))[0]?.id;
    if (submissionId) {
      await query(
        `INSERT INTO ai_document_analyses (submission_id, project_id, user_id, file_url, analysis)
         SELECT $1, $2, $3, '/uploads/demo-thesis-chapter.docx', $4
         WHERE NOT EXISTS (SELECT 1 FROM ai_document_analyses WHERE submission_id = $1)`,
        [submissionId, project.id, student.id, JSON.stringify({
          readiness: projectData.status === "revision_requested" ? 62 : 81,
          word_count: 3420,
          analyzed_characters: 12800,
          extracted_characters: 12800,
          sections: { abstract: true, introduction: true, problem: true, objectives: true, methodology: true, results: projectData.status !== "revision_requested", references: true },
          grammar_notes: [{ type: "صياغة", text: "بعض الفقرات طويلة.", suggestion: "قسّم الفقرات إلى نقاط أو جمل أقصر." }],
          recommendations: ["أضف جدول مقارنة مع مشروعين سابقين.", "وضح مساهمة المشروع البحثية في المقدمة."],
          diagrams: blueprint.mermaid,
          note: "تحليل تجريبي مولد من seed الديمو."
        })]
      );
    }
  }
  return project;
}

async function seedStudents(supervisorMap, adminId) {
  const userMap = new Map();
  for (const item of students) {
    const user = await upsertUser({ ...item, role: "student", department: "هندسة المعلومات", color: "#059669" });
    const supervisor = supervisorMap.get(item.supervisorEmail);
    await upsertStudentProfile(user, item.studentId, item.interests, item.project.status === "pending_review" ? null : supervisor?.id, item.project.status === "approved" ? "in_progress" : "proposal");
    const project = await upsertProject(user, item.project, supervisor?.id || null, adminId);
    userMap.set(item.email, { user, project, supervisor });
  }
  return userMap;
}

async function seedArchived(adminId) {
  for (const [email, fullName, studentId, title, abstract, tech, deadline] of archivedProjects) {
    const student = await upsertUser({ email, role: "student", fullName, department: "هندسة المعلومات", initials: "أر", color: "#64748b" });
    await upsertStudentProfile(student, studentId, "مشاريع برمجية، تطبيقات ويب، قواعد بيانات", null, "completed");
    const [existing] = await query("SELECT id FROM projects WHERE student_id = $1 AND title = $2", [student.id, title]);
    const [project] = existing
      ? await query(
        `UPDATE projects SET abstract = $1, status = 'approved', deadline = $2, tech_stack = $3, academic_term = $4,
           is_archived = true, archived_at = COALESCE(archived_at, now()), archive_approved_by = $5
         WHERE id = $6 RETURNING *`,
        [abstract, deadline, tech, currentTerm, adminId, existing.id]
      )
      : await query(
        `INSERT INTO projects (student_id, title, abstract, status, deadline, tech_stack, academic_term, is_archived, archived_at, archive_approved_by)
         VALUES ($1, $2, $3, 'approved', $4, $5, $6, true, now(), $7)
         RETURNING *`,
        [student.id, title, abstract, deadline, tech, currentTerm, adminId]
      );
    await query(
      `INSERT INTO milestones (project_id, title, due_date, status, completed_at)
       SELECT $1, 'Defense', $2, 'done', $2::date + time '10:00'
       WHERE NOT EXISTS (SELECT 1 FROM milestones WHERE project_id = $1 AND title = 'Defense')`,
      [project.id, deadline]
    );
  }
}

async function seedSupportingData(admin, supervisorMap, studentMap) {
  const deadlines = [
    ["آخر موعد لتقديم المقترحات", "2026-06-25", null],
    ["رفع الفصل الأول", "2026-08-05", "هندسة المعلومات"],
    ["أسبوع مراجعة المخططات", "2026-08-18", null],
    ["موعد المناقشات النهائية", "2026-09-15", null]
  ];
  for (const [title, dueDate, department] of deadlines) {
    await query(
      `INSERT INTO academic_deadlines (title, due_date, department)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM academic_deadlines WHERE title = $1 AND due_date = $2)`,
      [title, dueDate, department]
    );
  }

  const helpers = [
    ["م. هبة صالح", "هندسة المعلومات", "h.salah@capstonehub.local", ["JavaScript", "SQL"], ["React", "Express"], "تساعد الطلاب في مشاكل الواجهات وربط API."],
    ["م. سامر عمران", "هندسة الشبكات", "s.omran@capstonehub.local", ["Linux", "Bash"], ["Docker", "Nginx"], "يدعم نشر المشاريع وضبط الخدمات محلياً."],
    ["م. رشا كيوان", "هندسة البرمجيات", "r.kiwan@capstonehub.local", ["Python", "Data"], ["Pandas", "FastAPI"], "تساعد في تنظيف البيانات وتجهيز تجارب الذكاء الاصطناعي."]
  ];
  for (const [fullName, department, contact, languages, frameworks, bio] of helpers) {
    await query(
      `INSERT INTO lab_helpers (full_name, department, contact, languages, frameworks, bio)
       SELECT $1, $2, $3, $4, $5, $6
       WHERE NOT EXISTS (SELECT 1 FROM lab_helpers WHERE full_name = $1)`,
      [fullName, department, contact, languages, frameworks, bio]
    );
  }

  const surveyQuestions = [
    { id: "clarity", type: "radio", label: "هل كانت تعليمات المنصة واضحة؟", options: ["نعم", "جزئياً", "لا"], required: true },
    { id: "advisor", type: "textarea", label: "ما أهم ملاحظة لديك عن المشرف أو المساعد الذكي؟", options: [], required: true },
    { id: "features", type: "checkbox", label: "أي ميزات استخدمتها؟", options: ["التوفيق", "فحص الفكرة", "المخططات", "تحليل الأطروحة"], required: false }
  ];
  const [survey] = await query(
    `INSERT INTO survey_forms (title, description, audience, questions, is_active, created_by)
     SELECT 'استبيان تجربة منصة CapstoneHub', 'استبيان ديمو لقياس وضوح رحلة الطالب والمشرف.', 'all', $1, true, $2
     WHERE NOT EXISTS (SELECT 1 FROM survey_forms WHERE title = 'استبيان تجربة منصة CapstoneHub')
     RETURNING *`,
    [JSON.stringify(surveyQuestions), admin.id]
  );
  const surveyId = survey?.id || (await query("SELECT id FROM survey_forms WHERE title = 'استبيان تجربة منصة CapstoneHub'"))[0]?.id;
  if (surveyId) {
    for (const item of [studentMap.get("student1@capstonehub.local"), studentMap.get("student4@capstonehub.local")].filter(Boolean)) {
      await query(
        `INSERT INTO survey_responses (survey_id, user_id, answers)
         VALUES ($1, $2, $3)
         ON CONFLICT (survey_id, user_id) DO NOTHING`,
        [surveyId, item.user.id, JSON.stringify({ clarity: "نعم", advisor: "المخططات والتوفيق ساعدتني بتوضيح الفكرة.", features: ["التوفيق", "المخططات", "تحليل الأطروحة"] })]
      );
    }
  }

  const ideas = [
    ["نظام أرشفة ذكي للقرارات الجامعية", "تصنيف القرارات والبحث الدلالي فيها باستخدام RAG.", ["RAG", "NLP", "PostgreSQL"], "متقدم"],
    ["تطبيق متابعة تدريب الطلاب", "ربط الطلاب بجهات التدريب وتوثيق التقارير الأسبوعية.", ["Flutter", "Firebase"], "متوسط"],
    ["لوحة مؤشرات جودة المقررات", "تحليل الاستبيانات والدرجات لإظهار مؤشرات تحسين التدريس.", ["Python", "React", "Charts"], "متوسط"]
  ];
  for (const [title, description, tech, difficulty] of ideas) {
    await query(
      `INSERT INTO project_ideas (title, description, department, tech_stack, difficulty, suggested_by, is_active)
       SELECT $1, $2, 'هندسة المعلومات', $3, $4, $5, true
       WHERE NOT EXISTS (SELECT 1 FROM project_ideas WHERE title = $1)`,
      [title, description, tech, difficulty, admin.id]
    );
  }

  const [rubric] = await query(
    `INSERT INTO rubric_templates (title, criteria, is_active, created_by)
     SELECT 'Rubric تقييم مشروع التخرج', $1, true, $2
     WHERE NOT EXISTS (SELECT 1 FROM rubric_templates WHERE title = 'Rubric تقييم مشروع التخرج')
     RETURNING *`,
    [JSON.stringify([
      { id: "proposal", label: "وضوح المقترح", weight: 20 },
      { id: "implementation", label: "جودة التنفيذ", weight: 35 },
      { id: "documentation", label: "جودة التوثيق", weight: 25 },
      { id: "presentation", label: "العرض والمناقشة", weight: 20 }
    ]), admin.id]
  );
  const rubricId = rubric?.id || (await query("SELECT id FROM rubric_templates WHERE title = 'Rubric تقييم مشروع التخرج'"))[0]?.id;

  for (const item of studentMap.values()) {
    if (item.project.status === "approved" && rubricId) {
      await query(
        `INSERT INTO rubric_evaluations (project_id, template_id, evaluator_id, scores, notes, total_score)
         SELECT $1, $2, $3, $4, 'تقييم ديمو أولي مناسب للعرض.', 84
         WHERE NOT EXISTS (SELECT 1 FROM rubric_evaluations WHERE project_id = $1 AND template_id = $2)`,
        [item.project.id, rubricId, item.supervisor?.id || admin.id, JSON.stringify({ proposal: 18, implementation: 29, documentation: 21, presentation: 16 })]
      );
    }
  }

  for (const item of studentMap.values()) {
    if (!item.supervisor) continue;
    await query(
      `INSERT INTO meetings (supervisor_id, student_id, scheduled_at, notes, status)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (SELECT 1 FROM meetings WHERE supervisor_id = $1 AND student_id = $2 AND scheduled_at = $3)`,
      [item.supervisor.id, item.user.id, "2026-07-14T10:00:00Z", `اجتماع متابعة لمشروع: ${item.project.title}`, item.project.status === "pending_review" ? "requested" : "scheduled"]
    );
    await query(
      `INSERT INTO messages (topic, sender_id, recipient_id, body)
       SELECT 'متابعة المشروع', $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM messages WHERE topic = 'متابعة المشروع' AND sender_id = $1 AND recipient_id = $2)`,
      [item.supervisor.id, item.user.id, "اطلعت على آخر تحديث. ركز على توثيق القرارات التقنية وربطها بمتطلبات المشروع."]
    );
    await query(
      `INSERT INTO messages (topic, sender_id, recipient_id, body)
       SELECT 'مشاركة مخطط مشروع', $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM messages WHERE topic = 'مشاركة مخطط مشروع' AND sender_id = $1 AND recipient_id = $2)`,
      [item.user.id, item.supervisor.id, `مخطط ديمو للمراجعة\nصورة المخطط: /uploads/demo-diagram.png\n\nكود Mermaid:\nflowchart TD\n  Student --> Platform\n  Platform --> Supervisor`]
    );
  }

  const notifications = [
    [admin.id, "project_request", "يوجد طلبات مشاريع جديدة بانتظار المتابعة."],
    [admin.id, "technical_report", "وصل تقرير تقني مفتوح من طالب."],
    [studentMap.get("student1@capstonehub.local")?.user.id, "blueprint_review", "تم تقييم التصميم الأولي لمشروعك من قبل المشرف."],
    [studentMap.get("student2@capstonehub.local")?.user.id, "review", "المشرف طلب تعديلات على نطاق المشروع."],
    [supervisorMap.get("omar.security@capstonehub.local")?.id, "project_request", "لديك مشروع جديد بانتظار المراجعة."]
  ].filter((item) => item[0]);
  for (const [userId, type, message] of notifications) {
    await query(
      `INSERT INTO notifications (user_id, type, message)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2 AND message = $3)`,
      [userId, type, message]
    );
  }

  const student = studentMap.get("student2@capstonehub.local")?.user;
  if (student) {
    await query(
      `INSERT INTO technical_reports (student_id, screenshot_url, note, status)
       SELECT $1, '/uploads/demo-technical-report.png', 'زر تصدير الصورة لم يعمل أثناء تجربة المخطط.', 'in_progress'
       WHERE NOT EXISTS (SELECT 1 FROM technical_reports WHERE student_id = $1 AND note = 'زر تصدير الصورة لم يعمل أثناء تجربة المخطط.')`,
      [student.id]
    );
  }

  await query(
    `INSERT INTO assistant_feedback (user_id, prompt, response_summary, usefulness, tables_score, relationships_score, diagrams_score, comment, pipeline_type, model_name, evidence_score, correctness_score, hallucination_risk)
     SELECT $1, 'ولّد Blueprint لمشروع إدارة مشاريع التخرج', 'تم توليد جداول ومخططات وخطة MVP.', 5, 4, 4, 5, 'نتيجة مفيدة للعرض أمام اللجنة.', 'blueprint', 'rule-based-demo', 4, 4, 1
     WHERE NOT EXISTS (SELECT 1 FROM assistant_feedback WHERE prompt = 'ولّد Blueprint لمشروع إدارة مشاريع التخرج')`,
    [studentMap.get("student1@capstonehub.local")?.user.id || admin.id]
  );
}

async function recalculateLoads() {
  await query(`
    UPDATE supervisors s
    SET current_load = (
      SELECT COUNT(DISTINCT p.student_id)::int
      FROM projects p
      LEFT JOIN students st ON st.user_id = p.student_id
      WHERE p.academic_term = $1
        AND p.status <> 'rejected'
        AND p.is_archived = false
        AND (p.preferred_supervisor_id = s.user_id OR st.supervisor_id = s.user_id)
    )
  `, [currentTerm]);
}

async function seedHighRiskDemo(studentMap) {
  const highRisk = studentMap.get("student3@capstonehub.local");
  if (!highRisk?.project?.id) return;
  await query("UPDATE users SET last_login_at = now() - interval '45 days' WHERE id = $1", [highRisk.user.id]);
  await query(
    "UPDATE projects SET created_at = now() - interval '45 days', deadline = CURRENT_DATE + 14 WHERE id = $1",
    [highRisk.project.id]
  );
  await query(
    "UPDATE milestones SET status = 'todo', completed_at = null, due_date = CURRENT_DATE - 20 WHERE project_id = $1",
    [highRisk.project.id]
  );
}

async function seed() {
  await ensureSchema();
  await cleanupDemoNoise();
  await ensureDemoFiles();

  const term = await seedTerms();
  const admin = await upsertUser({
    email: "admin@capstonehub.local",
    role: "admin",
    fullName: "إدارة الجامعة",
    department: "هندسة المعلومات",
    phone: "+963 944 000 100",
    initials: "إج",
    color: "#111827"
  });
  const supervisorMap = await seedSupervisors(term);
  const studentMap = await seedStudents(supervisorMap, admin.id);
  await seedArchived(admin.id);
  await seedSupportingData(admin, supervisorMap, studentMap);
  await seedHighRiskDemo(studentMap);
  await recalculateLoads();

  await query(
    "UPDATE users SET password_hash = $1, profile_status = 'approved', profile_approved_at = COALESCE(profile_approved_at, now()), avatar_url = COALESCE(avatar_url, $2)",
    [password, "/uploads/demo-default.svg"]
  );
}

seed()
  .then(() => console.log(`Demo seed completed. All demo accounts use password: ${seedPassword}`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
