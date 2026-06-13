import { BarChart3, Bell, Bot, CalendarDays, Camera, CheckCircle2, Download, Eye, FileText, LayoutDashboard, PencilRuler, Upload, User, UserPlus, Users } from "lucide-react";

export const roleNav = {
  student: [
    {
      id: "profileGroup",
      label: "الملف التعريفي",
      icon: User,
      children: [
        { id: "profile", label: "بياناتي", icon: User },
        { id: "overview", label: "لوحة الطالب", icon: LayoutDashboard },
        { id: "calendar", label: "التقويم الأكاديمي", icon: Bell },
        { id: "surveys", label: "الاستبيانات", icon: FileText }
      ]
    },
    {
      id: "projectWorkspace",
      label: "مشروعي",
      icon: LayoutDashboard,
      children: [
        { id: "request", label: "طلب المشروع", icon: FileText },
        { id: "ideas", label: "المشاريع المقترحة من الجامعة", icon: FileText },
        { id: "library", label: "مكتبة المشاريع", icon: FileText },
        { id: "diagramStudio", label: "رسم المخططات", icon: PencilRuler },
        { id: "submissions", label: "الملفات والفصول", icon: Upload }
      ]
    },
    { id: "matches", label: "المشرفون", icon: Users },
    { id: "meetingRequest", label: "طلب اجتماع مع المشرف", icon: CalendarDays }
  ],
  supervisor: [
    { id: "profile", label: "الملف التعريفي", icon: User },
    { id: "overview", label: "لوحة المشرف", icon: LayoutDashboard },
    { id: "projectTracking", label: "متابعة المشاريع", icon: Eye },
    { id: "proposals", label: "المقترحات", icon: FileText },
    { id: "timeline", label: "مراحل الطلاب", icon: CalendarDays },
    { id: "score", label: "Rubric التقييم", icon: CheckCircle2 },
    { id: "projectAiReview", label: "تقييم مشروع بالمساعد", icon: Bot },
    { id: "assistantAnalytics", label: "تحليل المساعد", icon: BarChart3 },
    { id: "ideas", label: "المشاريع المقترحة من الجامعة", icon: FileText },
    { id: "library", label: "مكتبة المشاريع", icon: FileText },
    { id: "meetings", label: "الاجتماعات", icon: CalendarDays },
    { id: "surveys", label: "الاستبيانات", icon: FileText }
  ],
  admin: [
    { id: "overview", label: "لوحة الإدارة", icon: LayoutDashboard },
    { id: "technicalReports", label: "المشاكل التقنية", icon: Camera },
    { id: "projects", label: "تقارير المشاريع", icon: Download },
    {
      id: "usersGroup",
      label: "المستخدمون",
      icon: Users,
      children: [
        { id: "users", label: "الحسابات وتأكيد الملفات", icon: Users },
        { id: "createUser", label: "إنشاء حساب جديد", icon: UserPlus }
      ]
    },
    { id: "meetings", label: "الاجتماعات", icon: CalendarDays },
    { id: "calendar", label: "التقويم الأكاديمي", icon: Bell },
    { id: "terms", label: "الفصول والتسجيل", icon: CalendarDays },
    { id: "notificationsAdmin", label: "إدارة التنبيهات", icon: Bell },
    { id: "matching", label: "تعيين المشرفين", icon: UserPlus },
    { id: "ideas", label: "المشاريع المقترحة من الجامعة", icon: FileText },
    { id: "library", label: "مكتبة المشاريع", icon: FileText },
    { id: "rubrics", label: "نماذج التقييم", icon: CheckCircle2 },
    { id: "assistantAnalytics", label: "تحليل المساعد", icon: BarChart3 },
    { id: "surveys", label: "الاستبيانات", icon: FileText }
  ]
};

export function flattenNav(items) {
  return items.flatMap((item) => item.children ? item.children : item);
}

export function navGroupForSection(items, sectionId) {
  return items.find((item) => item.children?.some((child) => child.id === sectionId))?.id || "";
}

export function notificationTarget(notification, role) {
  const type = notification?.type;
  const targets = {
    student: {
      project_request: "request",
      review: "request",
      update_required: "request",
      blueprint_review: "request",
      archive_review: "request",
      milestone: "overview",
      overdue: "overview",
      deadline: "calendar",
      defense: "calendar",
      meeting: "meetingRequest",
      meeting_request: "meetingRequest",
      message: "projectTracking",
      profile_approved: "profile",
      profile_approval: "profile",
      profile_update: "profile",
      technical_report: "profile",
      survey: "surveys"
    },
    supervisor: {
      review_required: "proposals",
      review: "proposals",
      project_request: "proposals",
      blueprint_review: "projectAiReview",
      milestone: "timeline",
      overdue: "timeline",
      meeting: "meetings",
      meeting_request: "meetings",
      deadline: "calendar",
      defense: "calendar",
      message: "overview",
      profile_approved: "profile",
      profile_approval: "profile",
      profile_update: "profile",
      technical_report: "profile",
      survey: "surveys"
    },
    admin: {
      project_request: "projects",
      technical_report: "technicalReports",
      profile_update: "users",
      profile_approval: "users",
      profile_approved: "users",
      archive_review: "projects",
      review_required: "projects",
      review: "projects",
      blueprint_review: "projects",
      milestone: "projects",
      overdue: "projects",
      deadline: "calendar",
      defense: "calendar",
      meeting: "meetings",
      meeting_request: "meetings",
      message: "overview",
      survey: "surveys"
    }
  };
  return targets[role]?.[type] || "";
}
