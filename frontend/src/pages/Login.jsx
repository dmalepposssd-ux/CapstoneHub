import { useState } from "react";
import { Send } from "lucide-react";
import { api } from "../api/client.js";
import { UniversityLogo } from "../components/common.jsx";

const demoAccounts = [
  ["طالب", "student1@capstonehub.local", "Password123!"],
  ["مشرف", "sara@capstonehub.local", "Password123!"],
  ["إدارة", "admin@capstonehub.local", "Password123!"]
];

export default function Login({ onLogin }) {
  const [email, setEmail] = useState(demoAccounts[0][1]);
  const [password, setPassword] = useState(demoAccounts[0][2]);
  const [error, setError] = useState("");

  function selectDemoAccount(account) {
    setEmail(account[1]);
    setPassword(account[2]);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/auth/login", null, { method: "POST", body: JSON.stringify({ email, password }) });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f7faf8_0%,#f7faf8_58%,#e4f4eb_58%,#e4f4eb_100%)] text-ink dark:bg-zinc-950 dark:text-white">
      <section className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-5 py-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <UniversityLogo />
          <h1 className="mt-8 max-w-2xl text-4xl font-extrabold leading-tight md:text-6xl">منصة إدارة مشاريع التخرج</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-700 dark:text-zinc-300">
            منصة عربية تربط الطلاب والمشرفين والإدارة مع مساعد AI للمطابقة، تقييم المقترحات، والتنبيه المبكر لمخاطر التأخير.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {demoAccounts.map((account) => {
              const [label, value] = account;
              return (
              <button key={value} type="button" onClick={() => selectDemoAccount(account)} className="rounded-lg border border-black/10 bg-white px-4 py-3 text-right text-sm font-bold shadow-sm transition hover:border-nile dark:border-white/10 dark:bg-zinc-900">
                {label}
                <span className="block truncate text-xs font-normal text-zinc-500">{value}</span>
              </button>
              );
            })}
          </div>
        </div>
        <form onSubmit={submit} className="rounded-lg border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-2xl font-extrabold">تسجيل الدخول</h2>
          <label className="mt-6 block text-sm font-bold">البريد الإلكتروني</label>
          <input className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-nile dark:border-zinc-700 dark:bg-zinc-950" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label className="mt-4 block text-sm font-bold">كلمة المرور</label>
          <input className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-nile dark:border-zinc-700 dark:bg-zinc-950" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
          <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-nile px-4 py-3 font-extrabold text-white transition hover:bg-emerald-800">
            <Send size={18} /> دخول
          </button>
        </form>
      </section>
    </main>
  );
}
