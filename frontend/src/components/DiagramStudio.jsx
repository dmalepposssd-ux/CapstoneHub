import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Copy, Database, Download, Eye, FileCode2, MousePointer2, Palette, Share2, Square, Trash2, Type, Workflow } from "lucide-react";
import { api } from "../api/client.js";

const examples = {
  erd: `erDiagram
  Student ||--o{ Project : submits
  Supervisor ||--o{ Project : supervises
  Project ||--o{ Submission : receives
  Submission ||--|| DocumentAnalysis : analyzed_by`,
  flowchart: `flowchart TD
  A[كتابة فكرة المشروع] --> B[توليد Blueprint]
  B --> C[مراجعة المشرف]
  C --> D[رفع ملفات الأطروحة]
  D --> E[تحليل بالمساعد]
  E --> F[تحسين وتسليم]`,
  sequence: `sequenceDiagram
  participant S as Student
  participant C as CapstoneHub
  participant A as AI Service
  S->>C: Upload thesis file
  C->>A: Extract and analyze text
  A-->>C: Readiness and notes
  C-->>S: Show analysis`
};

function extractMermaidBlock(value) {
  const match = String(value || "").match(/```mermaid\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : String(value || "").trim();
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, options = {}) {
  ctx.save();
  ctx.direction = options.direction || "rtl";
  ctx.textAlign = options.align || "right";
  ctx.fillStyle = options.color || "#334155";
  ctx.font = options.font || "28px Cairo, Arial, sans-serif";
  const words = String(text).split(/\s+/);
  let line = "";
  let cursorY = y;
  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(nextLine).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
      line = word;
      return;
    }
    line = nextLine;
  });
  if (line) {
    ctx.fillText(line, x, cursorY);
    cursorY += lineHeight;
  }
  ctx.restore();
  return cursorY;
}

function drawCodeBlock(ctx, title, code, x, y, width) {
  const lines = code.split("\n");
  const lineHeight = 30;
  const height = 72 + lines.length * lineHeight;
  ctx.save();
  ctx.fillStyle = "#ecfdf5";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.font = "bold 28px Cairo, Arial, sans-serif";
  ctx.fillStyle = "#065f46";
  ctx.fillText(title, x + width - 28, y + 42);
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.font = "24px Consolas, 'Courier New', monospace";
  ctx.fillStyle = "#111827";
  lines.forEach((line, index) => {
    ctx.fillText(line, x + 28, y + 82 + index * lineHeight);
  });
  ctx.restore();
  return y + height + 34;
}

function drawGuideHeader(ctx, pageNumber, title) {
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, 1240, 1754);
  ctx.fillStyle = "#047857";
  ctx.fillRect(0, 0, 1240, 18);
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.font = "bold 48px Cairo, Arial, sans-serif";
  ctx.fillStyle = "#064e3b";
  ctx.fillText(title, 1148, 90);
  ctx.font = "24px Cairo, Arial, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("CapstoneHub - مرجع سريع للطلاب", 1148, 130);
  ctx.textAlign = "center";
  ctx.font = "22px Cairo, Arial, sans-serif";
  ctx.fillText(`صفحة ${pageNumber}`, 620, 1694);
}

function drawSectionTitle(ctx, text, y) {
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.font = "bold 34px Cairo, Arial, sans-serif";
  ctx.fillStyle = "#047857";
  ctx.fillText(text, 1148, y);
  return y + 46;
}

function drawBullets(ctx, items, y) {
  let cursorY = y;
  items.forEach((item) => {
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.font = "bold 26px Cairo, Arial, sans-serif";
    ctx.fillStyle = "#047857";
    ctx.fillText("•", 1148, cursorY);
    cursorY = drawWrappedText(ctx, item, 1118, cursorY, 960, 36, {
      font: "26px Cairo, Arial, sans-serif",
      color: "#334155"
    }) + 8;
  });
  return cursorY + 16;
}

function createMermaidGuidePages() {
  const pageWidth = 1240;
  const pageHeight = 1754;
  const pages = [document.createElement("canvas"), document.createElement("canvas")];
  pages.forEach((canvas) => {
    canvas.width = pageWidth;
    canvas.height = pageHeight;
  });

  const first = pages[0].getContext("2d");
  drawGuideHeader(first, 1, "مرجع كتابة كود Mermaid");
  let y = 196;
  y = drawSectionTitle(first, "الفكرة العامة", y);
  y = drawWrappedText(
    first,
    "Mermaid يسمح لك بكتابة المخططات كنص بسيط. ابدأ بنوع المخطط في أول سطر، ثم اكتب العناصر والعلاقات سطراً بعد سطر. بعد كل تعديل راقب المعاينة وصحح السطر الذي يظهر فيه الخطأ.",
    1148,
    y,
    1056,
    40,
    { font: "28px Cairo, Arial, sans-serif", color: "#334155" }
  ) + 30;
  y = drawSectionTitle(first, "قواعد مهمة قبل البدء", y);
  y = drawBullets(first, [
    "اكتب نوع المخطط أولاً مثل: flowchart TD أو erDiagram أو sequenceDiagram.",
    "استخدم أسماء إنكليزية قصيرة للعقد مثل A و B و Project، واكتب النص العربي داخل الأقواس.",
    "حافظ على المسافات في بداية الأسطر الفرعية، ولا تخلط بين أنواع المخططات في نفس الكود.",
    "إذا تعطل الرسم، جرّب تعليق السطر الأخير أو حذفه لمعرفة مكان الخطأ."
  ], y);
  y = drawSectionTitle(first, "مثال Flowchart", y);
  y = drawCodeBlock(first, "تدفق خطوات المشروع", `flowchart TD
  A[كتابة فكرة المشروع] --> B[تحليل المتطلبات]
  B --> C{هل الفكرة واضحة؟}
  C -- نعم --> D[رسم الصفحات]
  C -- لا --> E[أسئلة توضيحية]
  E --> B`, 92, y, 1056);
  y = drawSectionTitle(first, "رموز مفيدة في Flowchart", y);
  drawBullets(first, [
    "A[نص] يرسم مستطيلاً، و A(نص) يرسم عقدة بحواف دائرية.",
    "A --> B سهم مباشر، و A -.-> B سهم متقطع، و A -- تسمية --> B سهم مع نص."
  ], y);

  const second = pages[1].getContext("2d");
  drawGuideHeader(second, 2, "أمثلة Mermaid جاهزة");
  y = 196;
  y = drawSectionTitle(second, "مثال ERD", y);
  y = drawCodeBlock(second, "علاقات قاعدة البيانات", `erDiagram
  STUDENT ||--o{ PROJECT : submits
  SUPERVISOR ||--o{ PROJECT : supervises
  PROJECT ||--o{ SUBMISSION : receives
  SUBMISSION ||--|| ANALYSIS : analyzed_by`, 92, y, 1056);
  y = drawSectionTitle(second, "معاني علاقات ERD", y);
  y = drawBullets(second, [
    "|| تعني عنصر واحد إلزامي، و o{ تعني صفر أو أكثر.",
    "اكتب أسماء الجداول بحروف إنكليزية واضحة، وضع معنى العلاقة بعد النقطتين."
  ], y);
  y = drawSectionTitle(second, "مثال Sequence Diagram", y);
  y = drawCodeBlock(second, "تتابع رفع ملف وتحليله", `sequenceDiagram
  participant S as Student
  participant C as CapstoneHub
  participant A as AI Service
  S->>C: Upload thesis chapter
  C->>A: Analyze content
  A-->>C: Return notes
  C-->>S: Show feedback`, 92, y, 1056);
  y = drawSectionTitle(second, "فحص سريع قبل التسليم", y);
  drawBullets(second, [
    "هل نوع المخطط في أول سطر صحيح؟",
    "هل كل سهم يصل بين عنصرين موجودين؟",
    "هل النص الطويل داخل أقواس أو بعد اسم العلاقة؟",
    "هل المخطط يشرح فكرة المشروع بوضوح للمشرف؟"
  ], y);
  return pages;
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function buildPdfFromCanvases(canvases) {
  const encoder = new TextEncoder();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const encode = (value) => encoder.encode(value);
  const objects = [];
  const objectCount = 2 + canvases.length * 3;
  const kids = [];

  objects[1] = [encode("<< /Type /Catalog /Pages 2 0 R >>")];
  canvases.forEach((canvas, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const imageName = `/GuidePage${index + 1}`;
    const jpegBytes = dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92));
    const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm ${imageName} Do Q`;
    kids.push(`${pageId} 0 R`);
    objects[pageId] = [encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << ${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)];
    objects[imageId] = [
      encode(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
      jpegBytes,
      encode("\nendstream")
    ];
    objects[contentId] = [encode(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)];
  });
  objects[2] = [encode(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${canvases.length} >>`)];

  const chunks = [encode("%PDF-1.4\n")];
  const offsets = new Array(objectCount + 1).fill(0);
  let size = chunks[0].length;
  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = size;
    const objectChunks = [encode(`${id} 0 obj\n`), ...objects[id], encode("\nendobj\n")];
    objectChunks.forEach((chunk) => {
      chunks.push(chunk);
      size += chunk.length;
    });
  }

  const xrefOffset = size;
  const entries = ["0000000000 65535 f "];
  for (let id = 1; id <= objectCount; id += 1) {
    entries.push(`${String(offsets[id]).padStart(10, "0")} 00000 n `);
  }
  chunks.push(encode(`xref\n0 ${objectCount + 1}\n${entries.join("\n")}\ntrailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return new Blob(chunks, { type: "application/pdf" });
}

function downloadMermaidGuidePdf() {
  const pages = createMermaidGuidePages();
  const blob = buildPdfFromCanvases(pages);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mermaid-reference-guide.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const colorPresets = [
  { id: "academic", label: "أكاديمي", primaryColor: "#eef2ff", primaryBorderColor: "#7c3aed", primaryTextColor: "#111827", lineColor: "#374151" },
  { id: "green", label: "أخضر", primaryColor: "#dcfce7", primaryBorderColor: "#047857", primaryTextColor: "#064e3b", lineColor: "#065f46" },
  { id: "blue", label: "أزرق", primaryColor: "#dbeafe", primaryBorderColor: "#2563eb", primaryTextColor: "#172554", lineColor: "#1d4ed8" },
  { id: "rose", label: "وردي", primaryColor: "#ffe4e6", primaryBorderColor: "#e11d48", primaryTextColor: "#4c0519", lineColor: "#be123c" }
];

const editorTools = [
  { id: "select", label: "تحديد", icon: MousePointer2 },
  { id: "text", label: "نص", icon: Type },
  { id: "box", label: "مربع", icon: Square },
  { id: "arrow", label: "سهم", icon: ArrowRight }
];

const arrowTypes = [
  { id: "default", label: "سهم عادي", end: "triangle" },
  { id: "dashed", label: "سهم متقطع", end: "triangle", dash: "8 6" },
  { id: "double", label: "اتجاهين", start: "triangle", end: "triangle" },
  { id: "line", label: "خط علاقة", end: null },
  { id: "inheritance", label: "وراثة UML", end: "hollowTriangle" },
  { id: "aggregation", label: "تجميع UML", start: "hollowDiamond", end: "triangle" },
  { id: "composition", label: "تركيب UML", start: "diamond", end: "triangle" }
];

function arrowTypeConfig(type) {
  return arrowTypes.find((item) => item.id === type) || arrowTypes[0];
}

function markerPath(kind) {
  if (kind === "diamond" || kind === "hollowDiamond") return "M1,5 L5,1 L9,5 L5,9 z";
  return "M1,1 L10,5 L1,9 z";
}

function markerRefX(kind, position) {
  if (position === "start") return "1";
  if (kind === "diamond" || kind === "hollowDiamond") return "9";
  return "10";
}

function appendArrowMarker(defs, id, kind, color, position = "end") {
  if (!kind) return null;
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", id);
  marker.setAttribute("markerWidth", "12");
  marker.setAttribute("markerHeight", "12");
  marker.setAttribute("refX", markerRefX(kind, position));
  marker.setAttribute("refY", "5");
  marker.setAttribute("orient", "auto-start-reverse");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", markerPath(kind));
  path.setAttribute("fill", kind.startsWith("hollow") ? "#ffffff" : color);
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", "1.6");
  marker.appendChild(path);
  defs.appendChild(marker);
  return `url(#${id})`;
}

function mermaidConfig(colors) {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: colors,
    flowchart: { htmlLabels: false, useMaxWidth: false },
    sequence: { useMaxWidth: false },
    er: { useMaxWidth: false }
  };
}

function svgSize(root) {
  const viewBox = root.getAttribute("viewBox")?.split(/\s+/).map(Number);
  const widthAttr = root.getAttribute("width");
  const heightAttr = root.getAttribute("height");
  return {
    width: Math.ceil(viewBox?.[2] || (widthAttr?.includes("%") ? 0 : Number.parseFloat(widthAttr)) || 1200),
    height: Math.ceil(viewBox?.[3] || (heightAttr?.includes("%") ? 0 : Number.parseFloat(heightAttr)) || 800)
  };
}

function replaceForeignObjectLabels(root) {
  root.querySelectorAll("foreignObject").forEach((node) => {
    const label = String(node.textContent || "").replace(/\s+/g, " ").trim();
    if (!label) {
      node.remove();
      return;
    }

    const x = Number.parseFloat(node.getAttribute("x") || "0");
    const y = Number.parseFloat(node.getAttribute("y") || "0");
    const width = Number.parseFloat(node.getAttribute("width") || "0");
    const height = Number.parseFloat(node.getAttribute("height") || "0");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(x + width / 2));
    text.setAttribute("y", String(y + height / 2));
    text.setAttribute("fill", "#111827");
    text.setAttribute("font-size", "16");
    text.setAttribute("font-family", "Cairo, Arial, sans-serif");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.textContent = label;
    node.replaceWith(text);
  });
}

function serializePreviewSvg(previewElement, fallbackSvg, annotations = []) {
  const svgNode = previewElement?.querySelector("svg");
  const parser = new DOMParser();
  const fallbackDoc = parser.parseFromString(fallbackSvg || "", "image/svg+xml");
  const clone = svgNode ? svgNode.cloneNode(true) : fallbackDoc.documentElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.querySelectorAll("br").forEach((node) => node.remove());
  replaceForeignObjectLabels(clone);
  const { width, height } = svgSize(clone);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("viewBox", clone.getAttribute("viewBox") || `0 0 ${width} ${height}`);
  annotations.forEach((item) => {
    if (item.type === "box") {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String((item.x / 100) * width));
      rect.setAttribute("y", String((item.y / 100) * height));
      rect.setAttribute("width", String(((item.w || 22) / 100) * width));
      rect.setAttribute("height", String(((item.h || 10) / 100) * height));
      rect.setAttribute("rx", "8");
      rect.setAttribute("fill", item.fill || "#ffffff");
      rect.setAttribute("stroke", item.color || "#047857");
      rect.setAttribute("stroke-width", "3");
      clone.appendChild(rect);
      if (item.text) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(((item.x + (item.w || 22) / 2) / 100) * width));
        text.setAttribute("y", String(((item.y + (item.h || 10) / 2) / 100) * height));
        text.setAttribute("fill", item.textColor || "#111827");
        text.setAttribute("font-size", String(item.size || 18));
        text.setAttribute("font-weight", "700");
        text.setAttribute("font-family", "Cairo, Arial, sans-serif");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.textContent = item.text;
        clone.appendChild(text);
      }
      return;
    }

    if (item.type === "arrow") {
      let defs = clone.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        clone.prepend(defs);
      }
      const arrow = arrowTypeConfig(item.arrowType);
      const color = item.color || "#047857";
      const startMarker = appendArrowMarker(defs, `arrow-start-${item.id}`, arrow.start, color, "start");
      const endMarker = appendArrowMarker(defs, `arrow-end-${item.id}`, arrow.end, color, "end");
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String((item.x / 100) * width));
      line.setAttribute("y1", String((item.y / 100) * height));
      line.setAttribute("x2", String(((item.x + (item.w || 20)) / 100) * width));
      line.setAttribute("y2", String(((item.y + (item.h || 0)) / 100) * height));
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", String(item.stroke || 4));
      line.setAttribute("stroke-linecap", "round");
      if (arrow.dash) line.setAttribute("stroke-dasharray", arrow.dash);
      if (startMarker) line.setAttribute("marker-start", startMarker);
      if (endMarker) line.setAttribute("marker-end", endMarker);
      clone.appendChild(line);
      return;
    }

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String((item.x / 100) * width));
    text.setAttribute("y", String((item.y / 100) * height));
    text.setAttribute("fill", item.color || "#047857");
    text.setAttribute("font-size", String(item.size || 18));
    text.setAttribute("font-weight", "700");
    text.setAttribute("font-family", "Cairo, Arial, sans-serif");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.textContent = item.text;
    clone.appendChild(text);
  });
  return new XMLSerializer().serializeToString(clone);
}

function renderSvgWithBrowser(normalizedSvg, width, height) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    const blob = new Blob([normalizedSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        context.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Browser SVG render failed"));
    };
    image.src = url;
  });
}

async function renderSvgWithCanvg(normalizedSvg, width, height) {
  const { Canvg } = await import("canvg");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const renderer = await Canvg.fromString(context, normalizedSvg, {
    ignoreAnimation: true,
    ignoreMouse: true,
    enableRedraw: false
  });
  await renderer.render();
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = "source-over";
  return canvas.toDataURL("image/png");
}

async function svgToPngDataUrl(svg) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() === "parsererror") {
    throw new Error("Invalid SVG");
  }
  const { width, height } = svgSize(root);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const normalizedSvg = new XMLSerializer().serializeToString(root);
  try {
    return await renderSvgWithBrowser(normalizedSvg, width, height);
  } catch {
    return renderSvgWithCanvg(normalizedSvg, width, height);
  }
}

export default function DiagramStudio({ token, supervisorId, showToast }) {
  const [source, setSource] = useState(examples.erd);
  const [rendered, setRendered] = useState("");
  const [error, setError] = useState("");
  const [mermaidApi, setMermaidApi] = useState(null);
  const [colors, setColors] = useState(colorPresets[0]);
  const [editorTool, setEditorTool] = useState("select");
  const [annotationDraft, setAnnotationDraft] = useState({
    text: "ملاحظة",
    color: "#047857",
    fill: "#ecfdf5",
    textColor: "#111827",
    size: 18,
    stroke: 4,
    w: 22,
    h: 10,
    arrowType: "default"
  });
  const [annotations, setAnnotations] = useState([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const [draggingAnnotation, setDraggingAnnotation] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef(null);
  const renderId = useRef(0);
  const mermaidCode = useMemo(() => extractMermaidBlock(source), [source]);

  useEffect(() => {
    let mounted = true;
    import("mermaid").then((module) => {
      const api = module.default;
      api.initialize(mermaidConfig(colors));
      if (mounted) setMermaidApi(api);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      const code = mermaidCode.trim();
      if (!mermaidApi) return;
      if (!code) {
        setRendered("");
        setError("");
        return;
      }

      try {
        setError("");
        mermaidApi.initialize(mermaidConfig(colors));
        const id = `diagram-studio-${Date.now()}-${renderId.current += 1}`;
        await mermaidApi.parse(code);
        const result = await mermaidApi.render(id, code);
        if (!cancelled) setRendered(result.svg);
      } catch (err) {
        if (!cancelled) {
          setRendered("");
          setError("تعذر رسم المخطط. تأكد أن الكود من نوع Mermaid وأن الصياغة صحيحة.");
        }
      }
    }

    renderDiagram();
    return () => { cancelled = true; };
  }, [colors, mermaidApi, mermaidCode]);

  async function copyCode() {
    await navigator.clipboard.writeText(mermaidCode);
    showToast?.("diagramStudio", "تم نسخ كود Mermaid");
  }

  function pickPreset(preset) {
    setColors(preset);
    showToast?.("diagramStudio", `تم تطبيق ألوان ${preset.label}`);
  }

  function downloadGuidePdf() {
    downloadMermaidGuidePdf();
    showToast?.("diagramStudio", "تم تنزيل مرجع Mermaid كملف PDF");
  }

  function previewPercent(event) {
    const svg = previewRef.current?.querySelector("svg");
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    ) {
      return null;
    }
    const x = Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - box.top) / box.height) * 100));
    return { x: Math.round(x), y: Math.round(y) };
  }

  function boundedPosition(item, x, y) {
    if (item.type === "box") {
      return {
        x: Math.max(0, Math.min(100 - (item.w || 22), x)),
        y: Math.max(0, Math.min(100 - (item.h || 10), y))
      };
    }
    if (item.type === "arrow") {
      return {
        x: Math.max(0, Math.min(100 - Math.max(6, Math.abs(item.w || 22)), x)),
        y: Math.max(0, Math.min(98, y))
      };
    }
    return {
      x: Math.max(4, Math.min(96, x)),
      y: Math.max(4, Math.min(96, y))
    };
  }

  function addEditorItemAt(point) {
    const base = {
      id: Date.now(),
      type: editorTool,
      x: point.x,
      y: point.y,
      text: annotationDraft.text.trim(),
      color: annotationDraft.color,
      fill: annotationDraft.fill,
      textColor: annotationDraft.textColor,
      size: annotationDraft.size,
      stroke: annotationDraft.stroke,
      w: annotationDraft.w,
      h: annotationDraft.h,
      arrowType: annotationDraft.arrowType
    };
    if (editorTool === "text" && !base.text) return;
    if (editorTool === "arrow") {
      base.text = "";
      base.w = annotationDraft.w || 22;
      base.h = 0;
    }
    if (editorTool === "box" && !base.text) base.text = "عنوان";
    const position = boundedPosition(base, base.x, base.y);
    base.x = position.x;
    base.y = position.y;
    setAnnotations((current) => [...current, base]);
    setSelectedAnnotationId(base.id);
    setEditorTool("select");
  }

  function handlePreviewClick(event) {
    if (event.target.closest("[data-editor-item]")) return;
    const point = previewPercent(event);
    if (!point) return;
    if (editorTool === "select") {
      setSelectedAnnotationId(null);
      return;
    }
    addEditorItemAt(point);
  }

  function startDrag(event, item) {
    event.stopPropagation();
    setSelectedAnnotationId(item.id);
    const point = previewPercent(event);
    if (!point) return;
    setDraggingAnnotation({ id: item.id, dx: point.x - item.x, dy: point.y - item.y });
  }

  function moveDrag(event) {
    if (!draggingAnnotation) return;
    const point = previewPercent(event);
    if (!point) return;
    setAnnotations((current) => current.map((item) => (
      item.id === draggingAnnotation.id
        ? { ...item, ...boundedPosition(item, point.x - draggingAnnotation.dx, point.y - draggingAnnotation.dy) }
        : item
    )));
  }

  function stopDrag() {
    setDraggingAnnotation(null);
  }

  function addAnnotation() {
    const point = { x: 50, y: 12 };
    addEditorItemAt(point);
  }

  const selectedAnnotation = annotations.find((item) => item.id === selectedAnnotationId);

  function updateSelectedAnnotation(patch) {
    if (!selectedAnnotationId) return;
    setAnnotations((current) => current.map((item) => {
      if (item.id !== selectedAnnotationId) return item;
      const next = { ...item, ...patch };
      return { ...next, ...boundedPosition(next, next.x, next.y) };
    }));
  }

  async function exportPng() {
    if (!rendered) return;
    setExporting(true);
    try {
      const svg = serializePreviewSvg(previewRef.current, rendered, annotations);
      const dataUrl = await svgToPngDataUrl(svg);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "capstone-diagram.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast?.("diagramStudio", "تم تصدير المخطط كصورة PNG");
    } catch (err) {
      showToast?.("diagramStudio", "تعذر تصدير الصورة. جرّب مخططاً أبسط أو صحح كود Mermaid.");
    } finally {
      setExporting(false);
    }
  }

  async function shareWithSupervisor() {
    if (!rendered) return;
    if (!supervisorId) {
      showToast?.("diagramStudio", "لا يوجد مشرف مرتبط بالمشروع بعد");
      return;
    }
    setSharing(true);
    try {
      const svg = serializePreviewSvg(previewRef.current, rendered, annotations);
      const screenshot = await svgToPngDataUrl(svg);
      await api("/messages/diagram-share", token, {
        method: "POST",
        body: JSON.stringify({
          recipientId: supervisorId,
          screenshot,
          mermaidCode,
          note: "أشارك معك مخططاً من أداة رسم المخططات لمراجعته."
        })
      });
      showToast?.("diagramStudio", "تمت مشاركة المخطط مع المشرف");
    } catch (err) {
      showToast?.("diagramStudio", err.message || "تعذر مشاركة المخطط مع المشرف");
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="grid gap-6">
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="panel-title">رسم المخططات</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">الصق كود Mermaid أو ملف Markdown يحتوي على ```mermaid وسيتم رسم المخطط مباشرة.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadGuidePdf} className="secondary-btn" data-testid="download-mermaid-guide"><BookOpen size={16} /> مرجع Mermaid PDF</button>
            <button type="button" onClick={() => setSource(examples.erd)} className="secondary-btn"><Database size={16} /> ERD</button>
            <button type="button" onClick={() => setSource(examples.flowchart)} className="secondary-btn"><Workflow size={16} /> Flowchart</button>
            <button type="button" onClick={() => setSource(examples.sequence)} className="secondary-btn"><FileCode2 size={16} /> Sequence</button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-extrabold text-nile">الكود</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyCode} className="mini-action text-nile"><Copy size={15} /> نسخ</button>
              <button type="button" onClick={() => downloadText("diagram.mmd", mermaidCode)} className="mini-action text-nile"><Download size={15} /> تنزيل</button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
            <div className="flex items-center gap-2 text-sm font-extrabold text-nile"><Palette size={16} /> ألوان المخطط</div>
            <div className="flex flex-wrap gap-2">
              {colorPresets.map((preset) => (
                <button key={preset.id} type="button" onClick={() => pickPreset(preset)} className="mini-action">
                  <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: preset.primaryColor }} />
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-bold">لون العناصر<input type="color" className="mt-1 h-10 w-full" value={colors.primaryColor} onChange={(event) => setColors({ ...colors, primaryColor: event.target.value })} /></label>
              <label className="text-xs font-bold">لون الخطوط<input type="color" className="mt-1 h-10 w-full" value={colors.lineColor} onChange={(event) => setColors({ ...colors, lineColor: event.target.value, primaryBorderColor: event.target.value })} /></label>
            </div>
          </div>
          <textarea
            className="field min-h-[440px] resize-y font-mono text-sm leading-6"
            dir="ltr"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Eye size={18} className="text-nile" />
              <h3 className="font-extrabold text-nile">المعاينة</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportPng} disabled={!rendered || exporting} className="secondary-btn disabled:opacity-60"><Download size={16} /> تصدير الصورة</button>
              <button type="button" onClick={shareWithSupervisor} disabled={!rendered || sharing} className="secondary-btn disabled:opacity-60"><Share2 size={16} /> مشاركة مع المشرف</button>
            </div>
          </div>
          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-extrabold text-red-700 dark:bg-red-950 dark:text-red-100">{error}</p>}
          <div className="diagram-editor-panel">
            <div className="flex items-center gap-2 text-sm font-extrabold text-nile"><Type size={16} /> محرر بسيط على المخطط</div>
            <div className="diagram-editor-tools">
              {editorTools.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEditorTool(id)}
                  className={`mini-action ${editorTool === id ? "border-nile text-nile" : ""}`}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <div className="diagram-editor-form">
              <label className="diagram-editor-label diagram-editor-main-field">
                <span>النص</span>
                <input className="diagram-editor-input" value={annotationDraft.text} onChange={(event) => setAnnotationDraft({ ...annotationDraft, text: event.target.value })} placeholder="نص العنصر" />
              </label>
              <label className="diagram-editor-label">
                <span>نوع السهم</span>
                <select title="نوع السهم" className="diagram-editor-input" value={annotationDraft.arrowType} onChange={(event) => setAnnotationDraft({ ...annotationDraft, arrowType: event.target.value })}>
                  {arrowTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
              </label>
              <label className="diagram-editor-label">
                <span>الحد</span>
                <input type="color" className="diagram-editor-color" value={annotationDraft.color} onChange={(event) => setAnnotationDraft({ ...annotationDraft, color: event.target.value })} />
              </label>
              <label className="diagram-editor-label">
                <span>التعبئة</span>
                <input type="color" className="diagram-editor-color" value={annotationDraft.fill} onChange={(event) => setAnnotationDraft({ ...annotationDraft, fill: event.target.value })} />
              </label>
              <label className="diagram-editor-label">
                <span>حجم النص</span>
                <input type="number" min="10" max="42" className="diagram-editor-input" value={annotationDraft.size} onChange={(event) => setAnnotationDraft({ ...annotationDraft, size: Number(event.target.value) })} />
              </label>
              <label className="diagram-editor-label">
                <span>العرض</span>
                <input type="number" min="5" max="80" className="diagram-editor-input" value={annotationDraft.w} onChange={(event) => setAnnotationDraft({ ...annotationDraft, w: Number(event.target.value) })} />
              </label>
              <button type="button" onClick={addAnnotation} className="primary-btn diagram-editor-action mt-0 whitespace-nowrap">إضافة بالوسط</button>
            </div>
            <p className="text-xs font-bold text-zinc-500">اختر أداة ثم اضغط داخل المخطط للإضافة. استخدم أداة تحديد لتحريك العناصر بالسحب.</p>
            {selectedAnnotation && (
              <div className="diagram-editor-form">
                <label className="diagram-editor-label diagram-editor-main-field">
                  <span>العنصر المحدد</span>
                  <input className="diagram-editor-input" value={selectedAnnotation.text || ""} onChange={(event) => updateSelectedAnnotation({ text: event.target.value })} placeholder="نص العنصر المحدد" disabled={selectedAnnotation.type === "arrow"} />
                </label>
                <label className="diagram-editor-label">
                  <span>نوع السهم</span>
                  <select className="diagram-editor-input" value={selectedAnnotation.arrowType || "default"} onChange={(event) => updateSelectedAnnotation({ arrowType: event.target.value })} disabled={selectedAnnotation.type !== "arrow"}>
                    {arrowTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                  </select>
                </label>
                <label className="diagram-editor-label">
                  <span>اللون</span>
                  <input type="color" className="diagram-editor-color" value={selectedAnnotation.color || "#047857"} onChange={(event) => updateSelectedAnnotation({ color: event.target.value })} />
                </label>
                <label className="diagram-editor-label">
                  <span>الحجم</span>
                  <input type="number" min="10" max="42" className="diagram-editor-input" value={selectedAnnotation.size || 18} onChange={(event) => updateSelectedAnnotation({ size: Number(event.target.value) })} />
                </label>
                <label className="diagram-editor-label">
                  <span>العرض</span>
                  <input type="number" min="5" max="80" className="diagram-editor-input" value={selectedAnnotation.w || 20} onChange={(event) => updateSelectedAnnotation({ w: Number(event.target.value) })} />
                </label>
                <button type="button" onClick={() => setAnnotations((current) => current.filter((item) => item.id !== selectedAnnotationId))} className="secondary-btn diagram-editor-action text-red-700"><Trash2 size={16} /> حذف المحدد</button>
              </div>
            )}
          </div>
          <div
            ref={previewRef}
            onClick={handlePreviewClick}
            onPointerMove={moveDrag}
            onPointerUp={stopDrag}
            onPointerLeave={stopDrag}
            className="mt-4 min-h-[440px] overflow-auto rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950"
          >
            {rendered ? (
              <div className="diagram-preview relative min-w-max">
                <div dangerouslySetInnerHTML={{ __html: rendered }} />
                {annotations.map((item) => {
                  const active = item.id === selectedAnnotationId;
                  if (item.type === "box") {
                    return (
                      <div
                        key={item.id}
                        data-editor-item
                        onPointerDown={(event) => startDrag(event, item)}
                        className={`absolute grid cursor-move place-items-center rounded-lg border-2 px-2 text-center font-extrabold ${active ? "ring-2 ring-nile" : ""}`}
                        style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.w || 22}%`, height: `${item.h || 10}%`, borderColor: item.color, background: item.fill, color: item.textColor || "#111827", fontSize: `${item.size || 18}px` }}
                      >
                        {item.text}
                      </div>
                    );
                  }
                  if (item.type === "arrow") {
                    const arrow = arrowTypeConfig(item.arrowType);
                    const color = item.color || "#047857";
                    const startMarkerId = `preview-arrow-start-${item.id}`;
                    const endMarkerId = `preview-arrow-end-${item.id}`;
                    return (
                      <svg
                        key={item.id}
                        data-editor-item
                        onPointerDown={(event) => startDrag(event, item)}
                        className={`absolute cursor-move overflow-visible ${active ? "ring-2 ring-nile" : ""}`}
                        style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${Math.max(6, Math.abs(item.w || 22))}%`, height: "2rem" }}
                        viewBox="0 0 100 24"
                      >
                        <defs>
                          {arrow.start && (
                            <marker id={startMarkerId} markerWidth="12" markerHeight="12" refX={markerRefX(arrow.start, "start")} refY="5" orient="auto-start-reverse">
                              <path d={markerPath(arrow.start)} fill={arrow.start.startsWith("hollow") ? "#ffffff" : color} stroke={color} strokeWidth="1.6" />
                            </marker>
                          )}
                          {arrow.end && (
                            <marker id={endMarkerId} markerWidth="12" markerHeight="12" refX={markerRefX(arrow.end, "end")} refY="5" orient="auto-start-reverse">
                              <path d={markerPath(arrow.end)} fill={arrow.end.startsWith("hollow") ? "#ffffff" : color} stroke={color} strokeWidth="1.6" />
                            </marker>
                          )}
                        </defs>
                        <line
                          x1="4"
                          y1="12"
                          x2="96"
                          y2="12"
                          stroke={color}
                          strokeWidth={item.stroke || 4}
                          strokeLinecap="round"
                          strokeDasharray={arrow.dash || undefined}
                          markerStart={arrow.start ? `url(#${startMarkerId})` : undefined}
                          markerEnd={arrow.end ? `url(#${endMarkerId})` : undefined}
                        />
                      </svg>
                    );
                  }
                  return (
                    <span
                      key={item.id}
                      data-editor-item
                      onPointerDown={(event) => startDrag(event, item)}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move whitespace-nowrap font-extrabold ${active ? "rounded bg-white/80 px-1 ring-2 ring-nile" : ""}`}
                      style={{ left: `${item.x}%`, top: `${item.y}%`, color: item.color, fontSize: `${item.size}px` }}
                    >
                      {item.text}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-[400px] place-items-center text-center text-sm font-bold text-zinc-500">
                الصق كود Mermaid صالح حتى تظهر المعاينة هنا.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
