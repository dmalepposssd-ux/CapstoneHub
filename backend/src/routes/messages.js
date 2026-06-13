import express from "express";
import fs from "fs/promises";
import path from "path";
import { query } from "../db.js";
import { requireApproved, requireAuth } from "../middleware.js";

const sseClients = new Map();

function formatSse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function broadcastToUser(userId, event, data) {
  const clients = sseClients.get(String(userId));
  if (!clients?.size) return;
  for (const res of [...clients]) {
    if (res.writableEnded) {
      clients.delete(res);
      continue;
    }
    try {
      res.write(formatSse(event, data));
    } catch {
      clients.delete(res);
    }
  }
  if (!clients.size) sseClients.delete(String(userId));
}

export const messagesRouter = express.Router();
messagesRouter.use(requireAuth);
messagesRouter.use(requireApproved);

messagesRouter.get("/contacts", async (req, res) => {
  const rows = await query(
    "SELECT id, full_name, role, department, avatar_url FROM users WHERE id <> $1 ORDER BY role, full_name",
    [req.user.id]
  );
  res.json(rows);
});

messagesRouter.get("/", async (req, res) => {
  const rows = await query(
    `SELECT m.*, sender.full_name AS sender_name, sender.avatar_url AS sender_avatar_url,
       recipient.full_name AS recipient_name, recipient.avatar_url AS recipient_avatar_url
     FROM messages m
     JOIN users sender ON sender.id = m.sender_id
     JOIN users recipient ON recipient.id = m.recipient_id
     WHERE m.sender_id = $1 OR m.recipient_id = $1
     ORDER BY m.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

messagesRouter.get("/unread-count", async (req, res) => {
  const [row] = await query(
    "SELECT COUNT(*)::int AS total FROM messages WHERE recipient_id = $1 AND read_at IS NULL",
    [req.user.id]
  );
  res.json(row);
});

messagesRouter.get("/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write("retry: 10000\n\n");

  const userId = String(req.user.id);
  const clients = sseClients.get(userId) || new Set();
  clients.add(res);
  sseClients.set(userId, clients);
  res.write(formatSse("connected", { message: "connected" }));

  req.on("close", () => {
    clients.delete(res);
    if (!clients.size) sseClients.delete(userId);
  });
});

messagesRouter.patch("/read/:partnerId", async (req, res) => {
  const partnerId = Number(req.params.partnerId);
  if (!partnerId || partnerId === req.user.id) return res.status(400).json({ message: "المحادثة غير صالحة" });
  await query(
    "UPDATE messages SET read_at = now() WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL",
    [partnerId, req.user.id]
  );
  const [row] = await query(
    "SELECT COUNT(*)::int AS total FROM messages WHERE recipient_id = $1 AND read_at IS NULL",
    [req.user.id]
  );
  broadcastToUser(req.user.id, "messages", { type: "read", unreadCount: row.total || 0 });
  res.status(204).send();
});

messagesRouter.post("/", async (req, res) => {
  const recipientId = Number(req.body.recipientId);
  const body = String(req.body.body || "").trim();
  const topic = String(req.body.topic || "محادثة مباشرة").trim();
  if (!recipientId || recipientId === req.user.id) {
    return res.status(400).json({ message: "مستلم الرسالة غير صالح" });
  }
  if (!body) {
    return res.status(400).json({ message: "نص الرسالة مطلوب" });
  }
  const [recipient] = await query("SELECT id FROM users WHERE id = $1", [recipientId]);
  if (!recipient) return res.status(404).json({ message: "المستخدم غير موجود" });

  const [message] = await query(
    `INSERT INTO messages (topic, sender_id, recipient_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [topic, req.user.id, recipientId, body]
  );
  await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'message', $2)", [recipientId, `رسالة جديدة: ${topic}`]);
  const [unread] = await query(
    "SELECT COUNT(*)::int AS total FROM messages WHERE recipient_id = $1 AND read_at IS NULL",
    [recipientId]
  );
  broadcastToUser(recipientId, "messages", { type: "new-message", message, unreadCount: unread.total || 0 });
  broadcastToUser(req.user.id, "messages", { type: "sent-message", message });
  res.status(201).json(message);
});

messagesRouter.post("/profile-update-request", async (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ message: "هذا الطلب مخصص للطلاب" });
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ message: "اكتب التعديل المطلوب على ملفك" });

  const admins = await query("SELECT id FROM users WHERE role = 'admin'");
  if (!admins.length) return res.status(404).json({ message: "لا يوجد حساب إدارة لاستقبال الطلب" });

  const messages = [];
  for (const admin of admins) {
    const [message] = await query(
      `INSERT INTO messages (topic, sender_id, recipient_id, body)
       VALUES ('طلب تعديل الملف الشخصي', $1, $2, $3)
       RETURNING *`,
      [req.user.id, admin.id, body]
    );
    await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'profile_update', $2)", [admin.id, `طلب تعديل ملف شخصي من ${req.user.fullName}`]);
    const [unread] = await query(
      "SELECT COUNT(*)::int AS total FROM messages WHERE recipient_id = $1 AND read_at IS NULL",
      [admin.id]
    );
    broadcastToUser(admin.id, "messages", { type: "new-message", message, unreadCount: unread.total || 0 });
    messages.push(message);
  }

  res.status(201).json({ messages });
});

messagesRouter.post("/technical-report", async (req, res) => {
  const screenshot = String(req.body.screenshot || "");
  const note = String(req.body.note || "لقطة شاشة من الطالب للتصحيح التقني").trim();
  const match = screenshot.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return res.status(400).json({ message: "صيغة لقطة الشاشة غير صحيحة" });

  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
    return res.status(400).json({ message: "حجم لقطة الشاشة غير صالح" });
  }

  const uploadDir = process.env.UPLOAD_DIR || "uploads";
  await fs.mkdir(uploadDir, { recursive: true });
  const filename = `${Date.now()}-technical-report-${req.user.id}.png`;
  const filepath = path.join(uploadDir, filename);
  await fs.writeFile(filepath, buffer);
  const screenshotUrl = `/uploads/${filename}`;

  const [report] = await query(
    "INSERT INTO technical_reports (student_id, screenshot_url, note) VALUES ($1, $2, $3) RETURNING *",
    [req.user.id, screenshotUrl, note]
  );

  const admins = await query("SELECT id FROM users WHERE role = 'admin'");
  if (!admins.length) return res.status(404).json({ message: "لا يوجد حساب إدارة لاستقبال التقرير" });

  const body = `${note}\n\nرقم التقرير: ${report.id}\nلقطة الشاشة: ${screenshotUrl}`;
  const messages = [];
  for (const admin of admins) {
    const [message] = await query(
      `INSERT INTO messages (topic, sender_id, recipient_id, body)
       VALUES ('تصحيح تقني', $1, $2, $3)
       RETURNING *`,
      [req.user.id, admin.id, body]
    );
    await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'technical_report', $2)", [admin.id, "وصل تقرير تقني جديد من طالب"]);
    const [unread] = await query(
      "SELECT COUNT(*)::int AS total FROM messages WHERE recipient_id = $1 AND read_at IS NULL",
      [admin.id]
    );
    broadcastToUser(admin.id, "messages", { type: "new-message", message, unreadCount: unread.total || 0 });
    messages.push(message);
  }

  res.status(201).json({ report, messages });
});

messagesRouter.post("/diagram-share", async (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ message: "مشاركة المخططات مخصصة للطلاب" });

  const recipientId = Number(req.body.recipientId);
  const screenshot = String(req.body.screenshot || "");
  const note = String(req.body.note || "مخطط مشروع من الطالب").trim();
  const mermaidCode = String(req.body.mermaidCode || "").trim();
  if (!recipientId || recipientId === req.user.id) {
    return res.status(400).json({ message: "اختر مشرفاً صالحاً لمشاركة المخطط" });
  }

  const [recipient] = await query("SELECT id, role FROM users WHERE id = $1", [recipientId]);
  if (!recipient || recipient.role !== "supervisor") {
    return res.status(404).json({ message: "المشرف غير موجود" });
  }

  const match = screenshot.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return res.status(400).json({ message: "صيغة صورة المخطط غير صحيحة" });

  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
    return res.status(400).json({ message: "حجم صورة المخطط غير صالح" });
  }

  const uploadDir = process.env.UPLOAD_DIR || "uploads";
  await fs.mkdir(uploadDir, { recursive: true });
  const filename = `${Date.now()}-diagram-${req.user.id}.png`;
  const filepath = path.join(uploadDir, filename);
  await fs.writeFile(filepath, buffer);
  const imageUrl = `/uploads/${filename}`;

  const bodyParts = [
    note,
    "",
    `صورة المخطط: ${imageUrl}`,
    mermaidCode ? `\nكود Mermaid:\n${mermaidCode}` : ""
  ].filter(Boolean);

  const [message] = await query(
    `INSERT INTO messages (topic, sender_id, recipient_id, body)
     VALUES ('مشاركة مخطط مشروع', $1, $2, $3)
     RETURNING *`,
    [req.user.id, recipientId, bodyParts.join("\n")]
  );
  await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'message', $2)", [recipientId, "وصلك مخطط مشروع جديد من طالب"]);
  const [unread] = await query(
    "SELECT COUNT(*)::int AS total FROM messages WHERE recipient_id = $1 AND read_at IS NULL",
    [recipientId]
  );
  broadcastToUser(recipientId, "messages", { type: "new-message", message, unreadCount: unread.total || 0 });
  res.status(201).json({ message, imageUrl });
});
