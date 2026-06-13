import bcrypt from "bcryptjs";
import express from "express";
import { query } from "../db.js";
import { rateLimit, requireAuth, signToken } from "../middleware.js";
import { avatarUpload } from "../upload.js";

export const authRouter = express.Router();

function listFromBody(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(/[,،\n]/).map((item) => item.trim()).filter(Boolean);
}

function supervisorProfileComplete(user, supervisor) {
  if (user.role !== "supervisor") return false;
  return Boolean(
    user.avatar_url &&
    supervisor?.specialization?.trim() &&
    supervisor?.bio?.trim() &&
    supervisor?.languages?.length &&
    supervisor?.tools?.length &&
    supervisor?.expertise_keywords?.length
  );
}

async function serializeSession(user) {
  let supervisorProfile = null;
  if (user.role === "supervisor") {
    [supervisorProfile] = await query("SELECT * FROM supervisors WHERE user_id = $1", [user.id]);
  }
  return {
    token: signToken(user),
    user: {
      id: user.id,
      role: user.role,
      fullName: user.full_name,
      department: user.department,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      profileStatus: user.profile_status,
      profileConfirmation: user.profile_confirmation,
      supervisorProfile: supervisorProfile ? {
        specialization: supervisorProfile.specialization || "",
        bio: supervisorProfile.bio || "",
        expertiseKeywords: supervisorProfile.expertise_keywords || [],
        languages: supervisorProfile.languages || [],
        tools: supervisorProfile.tools || []
      } : null,
      supervisorProfileComplete: user.role === "supervisor" ? supervisorProfileComplete(user, supervisorProfile) : true
    }
  };
}

authRouter.post("/login", rateLimit({ windowMs: 15 * 60_000, max: 20 }), async (req, res) => {
  const { email, password } = req.body;
  const [user] = await query("SELECT * FROM users WHERE email = $1", [email]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: "بيانات الدخول غير صحيحة" });
  }
  user.last_login_at = new Date();
  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
  res.json(await serializeSession(user));
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const [user] = await query("SELECT * FROM users WHERE id = $1", [req.user.id]);
  if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
  res.json(await serializeSession(user));
});

authRouter.post("/avatar", requireAuth, avatarUpload.single("avatar"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "اختر صورة شخصية" });
  const [user] = await query(
    "UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING *",
    [`/uploads/${req.file.filename}`, req.user.id]
  );
  res.json(await serializeSession(user));
});

authRouter.put("/supervisor-profile", requireAuth, async (req, res) => {
  if (req.user.role !== "supervisor") return res.status(403).json({ message: "هذا الملف مخصص للمشرفين" });
  const specialization = String(req.body.specialization || "").trim();
  const bio = String(req.body.bio || "").trim();
  const expertiseKeywords = listFromBody(req.body.expertiseKeywords);
  const languages = listFromBody(req.body.languages);
  const tools = listFromBody(req.body.tools);
  if (!specialization || !bio || !expertiseKeywords.length || !languages.length || !tools.length) {
    return res.status(400).json({ message: "أكمل الاختصاص، النبذة، المهارات، اللغات، والبرامج" });
  }
  await query(
    `UPDATE supervisors
     SET specialization = $1,
         bio = $2,
         expertise_keywords = $3,
         languages = $4,
         tools = $5
     WHERE user_id = $6`,
    [specialization, bio, expertiseKeywords, languages, tools, req.user.id]
  );
  const [user] = await query("SELECT * FROM users WHERE id = $1", [req.user.id]);
  res.json(await serializeSession(user));
});

authRouter.post("/confirm-profile", requireAuth, async (req, res) => {
  const notes = String(req.body.notes || "").trim();
  const [current] = await query("SELECT * FROM users WHERE id = $1", [req.user.id]);
  if (!current) return res.status(404).json({ message: "المستخدم غير موجود" });

  const confirmation = {
    fullName: current.full_name,
    department: current.department,
    phone: current.phone,
    notes,
    confirmed: !notes
  };
  const [user] = await query(
    `UPDATE users
     SET profile_confirmation = $1,
         profile_status = 'pending_approval',
         profile_submitted_at = now()
     WHERE id = $2
     RETURNING *`,
    [confirmation, req.user.id]
  );

  const admins = await query("SELECT id FROM users WHERE role = 'admin'");
  await Promise.all(admins.map((admin) => query(
    "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'profile_approval', $2)",
    [admin.id, `طلب تأكيد ملف جديد من ${user.full_name}`]
  )));

  res.json(await serializeSession(user));
});
