import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { api } from "../api/client.js";
import { classNames, roleLabels } from "../utils/helpers.js";

export default function PendingProfileDashboard({ session, setSession }) {
  const [notes, setNotes] = useState(session.user.profileConfirmation?.notes || "");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const waiting = session.user.profileStatus === "pending_approval";

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const nextSession = await api("/auth/confirm-profile", session.token, {
        method: "POST",
        body: JSON.stringify({ notes })
      });
      setSession(nextSession);
    } catch (err) {
      setError(err.message);
    }
  }

  async function refreshStatus() {
    setRefreshing(true);
    setError("");
    try {
      setSession(await api("/auth/me", session.token));
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="panel">
        <h2 className="panel-title">{waiting ? "بانتظار موافقة الإدارة" : "تأكيد بياناتي"}</h2>
        <p className="mt-3 leading-7 text-zinc-600 dark:text-zinc-300">
          {waiting ? "تم إرسال تأكيد بياناتك للإدارة. بعد الموافقة تنفتح لك باقي الخيارات." : "راجع معلوماتك الأساسية. إذا كانت صحيحة اضغط موافقة، وإذا فيها خطأ اكتب ملاحظة لمدير النظام."}
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800"><p className="text-sm text-zinc-500">الاسم</p><p className="font-extrabold">{session.user.fullName}</p></div>
          <div className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800"><p className="text-sm text-zinc-500">الدور</p><p className="font-extrabold">{roleLabels[session.user.role]}</p></div>
          <div className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800"><p className="text-sm text-zinc-500">القسم</p><p className="font-extrabold">{session.user.department}</p></div>
          <div className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800"><p className="text-sm text-zinc-500">رقم التواصل</p><p className="font-extrabold">{session.user.phone || "غير محدد"}</p></div>
        </div>
        {waiting ? (
          <div className="mt-5 rounded-lg bg-green-50 p-4 font-bold text-nile dark:bg-emerald-950 dark:text-emerald-100">
            طلبك قيد المراجعة لدى الإدارة.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 grid gap-3">
            <textarea className="field mt-0 min-h-24" placeholder="إذا يوجد خطأ، اكتب ملاحظة لمدير النظام. اتركها فارغة إذا البيانات صحيحة." value={notes} onChange={(event) => setNotes(event.target.value)} />
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
            <button className="primary-btn mt-0">{notes.trim() ? "إرسال الملاحظة للإدارة" : "أوافق، بياناتي صحيحة"}</button>
          </form>
        )}
        <button type="button" onClick={refreshStatus} className="secondary-btn mt-4" disabled={refreshing}>
          {refreshing ? "جاري التحديث..." : "تحديث حالة الموافقة"}
        </button>
      </section>
    </div>
  );
}
