import type { SessionUser } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "Console", key: "console" },
  { href: "/dashboard/billing", label: "Elite Billing", key: "billing", roles: ["PLATFORM_ADMIN", "OWNER"] },
];

export function Shell({
  user,
  active,
  merchants,
  current,
  children,
}: {
  user: SessionUser;
  active: "console" | "billing";
  merchants?: { id: string; dbaName: string }[];
  current?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="topbar">
        <div className="brand"><b>■</b> {process.env.BRAND_NAME ?? "TradePay"}</div>
        <nav className="nav">
          {NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map((n) => (
            <a key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined}>{n.label}</a>
          ))}
        </nav>
        <div className="right">
          {user.role === "PLATFORM_ADMIN" && merchants && merchants.length > 1 && (
            <form>
              <select name="m" defaultValue={current} className="mono" style={{ background: "var(--panel)", color: "var(--text)", border: "1px solid var(--rule-strong)", height: 24, fontSize: 11 }}>
                {merchants.map((x) => <option key={x.id} value={x.id}>{x.dbaName}</option>)}
              </select>
              <button className="btn" style={{ height: 24, marginLeft: 6 }}>Go</button>
            </form>
          )}
          <div className="userbox">
            <span className="mono">{user.email}</span>
            <span className="st st-OPEN">{user.role.replace("_", " ")}</span>
            <form action="/api/auth/logout" method="post"><button className="linkbtn">Sign out</button></form>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}

export function Kpi({ label, value, delta, tone }: { label: string; value: string; delta?: string; tone?: "up" | "down" }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ""}`}>{value}</div>
      {delta && <div className="delta">{delta}</div>}
    </div>
  );
}

export function Row({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--rule)" }}>
      <span className="muted" style={{ fontSize: 12 }}>{k}</span>
      <span className={`mono ${tone ?? ""}`}>{v}</span>
    </div>
  );
}
