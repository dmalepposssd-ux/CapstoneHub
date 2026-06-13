import jwt from "jsonwebtoken";

const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-secret-change-this");
const weakProductionSecrets = new Set([
  "dev-secret-change-this",
  "change-me-in-production-immediately",
  "local-demo-jwt-secret-change-before-production",
  "secret",
  "changeme"
]);
if (process.env.NODE_ENV === "production" && (!jwtSecret || jwtSecret.length < 32 || weakProductionSecrets.has(jwtSecret))) {
  throw new Error("A strong JWT_SECRET is required when NODE_ENV=production");
}
const attempts = new Map();

export function rateLimit({ windowMs = 60_000, max = 20 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.originalUrl}`;
    const now = Date.now();
    const entry = attempts.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.count += 1;
    attempts.set(key, entry);
    if (entry.count > max) return res.status(429).json({ message: "طلبات كثيرة، حاول لاحقاً" });
    next();
  };
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, fullName: user.full_name, department: user.department, profileStatus: user.profile_status },
    jwtSecret,
    { expiresIn: "24h" }
  );
}

export function requireAuth(req, res, next) {
  const headerToken = req.headers.authorization?.replace("Bearer ", "");
  const queryToken = typeof req.query?.token === "string" ? req.query.token : "";
  const token = headerToken || queryToken.trim();
  if (!token) return res.status(401).json({ message: "Authentication required" });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

export function requireApproved(req, res, next) {
  if (req.user.role === "admin" || req.user.profileStatus === "approved") return next();
  return res.status(403).json({ message: "يجب تأكيد بياناتك وموافقة الإدارة قبل استخدام النظام" });
}

// Global error handler middleware
export function globalErrorHandler(err, req, res, next) {
  console.error("Error:", err);
  
  if (err.message?.includes("duplicate key")) {
    return res.status(400).json({ message: "هذا العنصر موجود بالفعل" });
  }
  if (err.message?.includes("foreign key")) {
    return res.status(400).json({ message: "بيانات غير صحيحة" });
  }
  
  const statusCode = err.statusCode || 500;
  const message = err.message || "حدث خطأ في الخادم";
  res.status(statusCode).json({ message });
}

// Request validation middleware
export function validateRequest(schema) {
  return (req, res, next) => {
    const errors = [];
    
    for (const [field, rule] of Object.entries(schema)) {
      const value = req.body[field];
      
      if (rule.required && (!value || value.toString().trim() === "")) {
        errors.push(`${field} مطلوب`);
        continue;
      }
      
      if (rule.minLength && value?.length < rule.minLength) {
        errors.push(`${field} يجب أن يكون أطول من ${rule.minLength} أحرف`);
      }
      if (rule.maxLength && value?.length > rule.maxLength) {
        errors.push(`${field} يجب أن يكون أقل من ${rule.maxLength} أحرف`);
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(`${field} صيغة غير صحيحة`);
      }
    }
    
    if (errors.length) {
      return res.status(400).json({ message: "خطأ في البيانات المدخلة", errors });
    }
    next();
  };
}
