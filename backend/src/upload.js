import fs from "fs";
import multer from "multer";
import path from "path";

const uploadDir = process.env.UPLOAD_DIR || "uploads";
fs.mkdirSync(uploadDir, { recursive: true });

// Magic numbers for file type validation
const MAGIC_NUMBERS = {
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  docx: Buffer.from([0x50, 0x4b, 0x03, 0x04]) // PK (ZIP header)
};

function verifyFileType(buffer, mimetype, extension) {
  if (extension === ".pdf") {
    return buffer.subarray(0, 4).equals(MAGIC_NUMBERS.pdf);
  }
  if (extension === ".docx") {
    return buffer.subarray(0, 4).equals(MAGIC_NUMBERS.docx);
  }
  return false;
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const sanitized = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${sanitized}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Check extension
    if (!allowed.includes(ext)) {
      return cb(new Error("الملفات المسموحة: PDF و DOCX فقط"));
    }
    
    // Check MIME type
    const mimeAllowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    if (!mimeAllowed.includes(file.mimetype)) {
      return cb(new Error("نوع الملف غير صحيح"));
    }
    
    // Will verify magic numbers in route handler
    cb(null, true);
  }
});

export const avatarUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".png", ".jpg", ".jpeg", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeAllowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(ext) || !mimeAllowed.includes(file.mimetype)) {
      return cb(new Error("الصور المسموحة: PNG و JPG و WEBP فقط"));
    }
    cb(null, true);
  }
});

// Verify file integrity after upload
export async function verifyUploadedFile(filepath) {
  const buffer = await fs.promises.readFile(filepath);
  const ext = path.extname(filepath).toLowerCase();
  
  if (!verifyFileType(buffer, "", ext)) {
    await fs.promises.unlink(filepath);
    const error = new Error("الملف تالف أو من نوع مختلف");
    error.statusCode = 400;
    throw error;
  }
  
  return true;
}
