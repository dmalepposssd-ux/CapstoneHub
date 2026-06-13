import { useEffect, useState } from "react";
import { Bell, Camera, ChevronDown, LogOut, Moon, Sun } from "lucide-react";
import { api } from "../api/client.js";
import { Avatar, EmptyState, UniversityLogo } from "../components/common.jsx";
import FloatingMessages from "../components/FloatingMessages.jsx";
import { flattenNav, navGroupForSection, notificationTarget, roleNav } from "../config/navigation.jsx";
import { classNames } from "../utils/helpers.js";

export default function Shell({ session, setSession, activeSection, setActiveSection, children }) {
  const [dark, setDark] = useState(false);
  const [reportStatus, setReportStatus] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [openNavGroup, setOpenNavGroup] = useState("");
  const [accessNotice, setAccessNotice] = useState("");
  const navItems = roleNav[session.user.role] || roleNav.student;
  const flatNavItems = flattenNav(navItems);
  const unreadNotifications = notifications.filter((item) => !item.is_read).length;
  const needsProfileApproval = session.user.role !== "admin" && session.user.profileStatus !== "approved";
  const needsAvatar = session.user.role === "student" && session.user.profileStatus === "approved" && !session.user.avatarUrl;
  const needsSupervisorSetup = session.user.role === "supervisor" && session.user.profileStatus === "approved" && !session.user.supervisorProfileComplete;
  const needsAccessSetup = needsProfileApproval || needsAvatar;
  const needsAnyAccessSetup = needsAccessSetup || needsSupervisorSetup;
  const unlockMessage = needsProfileApproval
    ? "أكد بياناتك أولاً ليتم فتح باقي الصلاحيات."
    : needsSupervisorSetup
      ? "أكمل ملفك التعريفي وصورتك الشخصية أولاً ليتم فتح باقي خيارات المشرف."
      : "ارفع صورتك الشخصية أولاً ليتم فتح باقي الصلاحيات.";
  const activeGroupId = navGroupForSection(navItems, activeSection);

  function showLockedNotice() {
    setAccessNotice(unlockMessage);
  }

  function openSection(sectionId) {
    if (needsAnyAccessSetup && sectionId !== "profile") {
      showLockedNotice();
      return;
    }
    setActiveSection(sectionId);
  }

  async function loadNotifications() {
    if (needsAnyAccessSetup) return;
    setNotificationsLoading(true);
    setNotificationsError("");
    try {
      setNotifications(await api("/notifications", session.token));
    } catch (err) {
      setNotificationsError(err.message);
    } finally {
      setNotificationsLoading(false);
    }
  }

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    if (activeGroupId) setOpenNavGroup(activeGroupId);
  }, [activeGroupId]);
  useEffect(() => { loadNotifications(); }, [session.token, needsAnyAccessSetup]);
  useEffect(() => {
    const timer = setInterval(loadNotifications, 30000);
    return () => clearInterval(timer);
  }, [session.token, needsAnyAccessSetup]);

  async function toggleNotifications() {
    if (needsAnyAccessSetup) {
      showLockedNotice();
      return;
    }
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (nextOpen) await loadNotifications();
  }

  async function markNotificationsRead() {
    if (needsAnyAccessSetup) {
      showLockedNotice();
      return;
    }
    await api("/notifications/read", session.token, { method: "PATCH" });
    await loadNotifications();
  }

  async function openNotification(item) {
    if (needsAnyAccessSetup) {
      showLockedNotice();
      return;
    }
    const target = notificationTarget(item, session.user.role);
    if (target) {
      openSection(target);
      setNotificationsOpen(false);
    }
    if (item.type === "message") {
      window.dispatchEvent(new CustomEvent("capstonehub:open-messages"));
    }
    if (!item.is_read) {
      const updated = await api(`/notifications/${item.id}/read`, session.token, { method: "PATCH" });
      setNotifications((current) => current.map((notification) => notification.id === item.id ? updated : notification));
    }
  }

  async function sendTechnicalReport() {
    if (needsAnyAccessSetup) {
      showLockedNotice();
      return;
    }
    setReportStatus("");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setReportStatus("المتصفح لا يدعم التقاط الشاشة");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const screenshot = canvas.toDataURL("image/png");
      await api("/messages/technical-report", session.token, {
        method: "POST",
        body: JSON.stringify({ screenshot, note: `تقرير تقني من ${session.user.fullName} - ${new Date().toLocaleString("ar")}` })
      });
      setReportStatus("تم إرسال لقطة الشاشة للأدمن");
      await loadNotifications();
    } catch (err) {
      setReportStatus(err.name === "NotAllowedError" ? "تم إلغاء التقاط الشاشة" : err.message);
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("avatar", file);
    try {
      setSession(await api("/auth/avatar", session.token, { method: "POST", body: form }));
    } catch (err) {
      setReportStatus(err.message);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-paper font-cairo text-ink dark:bg-zinc-950 dark:text-white" dir="rtl">
      <aside className="fixed right-0 top-0 z-30 hidden h-screen w-72 border-l border-emerald-950/10 bg-white text-nile shadow-2xl lg:block">
        <div className="flex h-full flex-col">
          <div className="bg-nile px-6 py-6 text-white">
            <div className="grid justify-items-center gap-3 text-center">
              <UniversityLogo compact inverse stacked />
              <label className="group relative cursor-pointer" title="تغيير الصورة الشخصية">
                <Avatar name={session.user.fullName} src={session.user.avatarUrl} size="lg" />
                <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                  <Camera size={18} />
                </span>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadAvatar} />
              </label>
              <p className="max-w-full truncate text-xs font-bold text-emerald-50">{session.user.fullName}</p>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const hasChildren = Boolean(item.children?.length);
              const active = hasChildren ? item.children.some((child) => child.id === activeSection) : activeSection === item.id;
              const expanded = hasChildren && openNavGroup === item.id;
              return (
                <div key={item.id} className="border-b border-emerald-950/10">
                  <button type="button" onClick={() => hasChildren ? setOpenNavGroup(expanded ? "" : item.id) : openSection(item.id)} className={classNames("flex w-full items-center justify-between px-5 py-4 text-right text-sm font-extrabold transition", active ? "bg-green-50 text-nile" : "text-nile hover:bg-green-50/70")}>
                    <span className="flex items-center gap-3"><Icon size={18} className="text-nile" />{item.label}</span>
                    {hasChildren && <ChevronDown size={16} className={classNames("text-emerald-800/60 transition-transform duration-300", expanded && "rotate-180")} />}
                  </button>
                  {hasChildren && (
                    <div className={classNames("grid overflow-hidden bg-green-50 transition-[grid-template-rows] duration-300 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                      <div className="min-h-0 py-2">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = activeSection === child.id;
                        return (
                          <button key={child.id} type="button" onClick={() => openSection(child.id)} className={classNames("flex w-full items-center gap-3 px-9 py-3 text-right text-sm font-bold transition", childActive ? "text-nile" : "text-emerald-800/70 hover:text-nile")}>
                            <ChildIcon size={16} />
                            {child.label}
                          </button>
                        );
                      })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          {reportStatus && <div className="border-t border-emerald-950/10 p-4">
            {reportStatus && <p className="mb-3 rounded-lg bg-green-50 p-2 text-xs font-bold text-nile">{reportStatus}</p>}
          </div>}
        </div>
      </aside>
      <header className="sticky top-0 z-20 border-b border-emerald-950/10 bg-white/95 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-950/95 lg:mr-72">
        <div className="flex items-center justify-between px-5 py-3">
          <p className="font-extrabold">{flatNavItems.find((item) => item.id === activeSection)?.label || (activeSection === "profile" ? "تأكيد بياناتي" : "لوحة التحكم")}</p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button title="تنبيهات" onClick={toggleNotifications} className="relative grid h-11 w-11 place-items-center rounded-lg border border-emerald-900/20 bg-nile text-white shadow-sm transition hover:bg-berry dark:border-white/15">
                <Bell size={18} />
                {unreadNotifications > 0 && <span className="absolute -left-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-xs text-white">{unreadNotifications}</span>}
              </button>
              {notificationsOpen && (
                <div className="absolute left-0 top-12 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-black/10 bg-white p-3 text-right shadow-2xl dark:border-white/10 dark:bg-zinc-900">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-extrabold text-ink dark:text-white">التنبيهات</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={loadNotifications} className="text-xs font-bold text-nile">تحديث</button>
                      <button type="button" onClick={markNotificationsRead} className="text-xs font-bold text-zinc-500">تعليم كمقروء</button>
                    </div>
                  </div>
                  <div className="mt-3 grid max-h-96 gap-2 overflow-y-auto">
                    {notificationsLoading && <p className="rounded-lg bg-zinc-100 p-3 text-sm font-bold text-zinc-500 dark:bg-zinc-800">جاري تحميل التنبيهات...</p>}
                    {notificationsError && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700 dark:bg-red-950 dark:text-red-200">{notificationsError}</p>}
                    {notifications.map((item) => {
                      const target = notificationTarget(item, session.user.role);
                      return (
                        <button key={item.id} type="button" onClick={() => openNotification(item)} className={classNames("w-full rounded-lg p-3 text-right text-sm transition hover:ring-2 hover:ring-nile/20", item.is_read ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" : "bg-emerald-50 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50")}>
                          <p className="font-bold">{item.message}</p>
                          <div className="mt-1 flex items-center justify-between gap-3 text-xs opacity-70">
                            <span>{new Date(item.created_at).toLocaleString("ar")}</span>
                            {target && <span className="font-extrabold">اضغط للانتقال</span>}
                          </div>
                        </button>
                      );
                    })}
                    {!notificationsLoading && !notificationsError && !notifications.length && <EmptyState>لا توجد تنبيهات حالياً.</EmptyState>}
                  </div>
                </div>
              )}
            </div>
            {session.user.role === "student" && (
              <button title="تسجيل مشكلة تقنية" onClick={sendTechnicalReport} className="inline-flex h-11 items-center gap-2 rounded-lg border border-emerald-900/20 bg-nile px-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-berry dark:border-white/15">
                <Camera size={18} />
                تسجيل مشكلة تقنية
              </button>
            )}
            <button title="تسجيل الخروج" onClick={() => setSession(null)} className="grid h-11 w-11 place-items-center rounded-lg border border-emerald-900/20 bg-nile text-white shadow-sm transition hover:bg-berry dark:border-white/15"><LogOut size={19} /></button>
            <button title="تبديل الوضع" onClick={() => setDark(!dark)} className="grid h-11 w-11 place-items-center rounded-lg border border-emerald-900/20 bg-nile text-white shadow-sm transition hover:bg-berry dark:border-white/15">{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-5 pb-3 lg:hidden">
          {flatNavItems.map((item) => (
            <button key={item.id} onClick={() => openSection(item.id)} className={classNames("shrink-0 rounded-lg border px-3 py-2 text-xs font-extrabold", activeSection === item.id ? "border-nile bg-nile text-white" : "border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900")}>{item.label}</button>
          ))}
        </div>
      </header>
      <main className="lg:mr-72">
        <div className="mx-auto max-w-7xl px-5 py-6">
          {accessNotice && <div className="toast mb-4">{accessNotice}</div>}
          {children}
        </div>
      </main>
      {!needsAnyAccessSetup && <FloatingMessages token={session.token} user={session.user} />}
    </div>
  );
}
