import universityLogo from "../assets/university-logo.png";
import { assetUrl, classNames, initials } from "../utils/helpers.js";

export function UniversityLogo({ compact = false, inverse = false, stacked = false }) {
  return (
    <div className={classNames(stacked ? "grid justify-items-center gap-3 text-center" : "flex items-center gap-3", compact ? "min-w-0" : "")}>
      <img src={universityLogo} className={classNames("shrink-0 object-contain", compact ? "h-16 w-40" : "h-28 w-72")} alt="Cordoba Private University logo" />
      <div className={classNames("leading-tight", compact && !stacked ? "hidden sm:block" : "")}>
        <p className={classNames("font-extrabold", inverse ? "text-white" : "text-ink dark:text-white", compact ? "text-base" : "text-2xl")}>جامعة قرطبة الخاصة</p>
        <p className={classNames("font-serif tracking-normal", inverse ? "text-white" : "text-zinc-700 dark:text-zinc-300", compact ? "text-xs" : "text-sm")}>CORDOBA PRIVATE UNIVERSITY</p>
        {!compact && <p className={classNames("mt-2 font-bold", inverse ? "text-white" : "text-nile")}>CapstoneHub</p>}
      </div>
    </div>
  );
}

export function MetricCard({ icon: Icon, label, value, compact = false }) {
  return (
    <div className={classNames("rounded-lg border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900", compact ? "p-3" : "p-4")}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={classNames("text-zinc-500 dark:text-zinc-400", compact ? "text-xs" : "text-sm")}>{label}</p>
          <p className={classNames("mt-1 break-words font-extrabold leading-tight text-ink dark:text-white", compact ? "text-xl" : "text-2xl")}>{value}</p>
        </div>
        <span className={classNames("grid shrink-0 place-items-center rounded-lg bg-nile text-white", compact ? "h-9 w-9" : "h-11 w-11")}>
          <Icon size={compact ? 18 : 22} />
        </span>
      </div>
    </div>
  );
}

export function EmptyState({ children }) {
  return <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">{children}</p>;
}

export function Avatar({ name, src, size = "md" }) {
  const sizes = {
    sm: "h-9 w-9 text-xs",
    md: "h-11 w-11 text-sm",
    lg: "h-16 w-16 text-lg"
  };
  return src ? (
    <img src={assetUrl(src)} alt={name || "avatar"} className={classNames("shrink-0 rounded-full object-cover ring-1 ring-black/10", sizes[size])} />
  ) : (
    <span className={classNames("grid shrink-0 place-items-center rounded-full bg-emerald-100 font-extrabold text-nile ring-1 ring-black/10", sizes[size])}>
      {initials(name)}
    </span>
  );
}
