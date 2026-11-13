import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/dashboard");
  return (
    <main className="login">
      <div className="login-box panel">
        <div className="panel-h">
          <span className="brand"><b>■</b> {process.env.BRAND_NAME ?? "BCI Synergy POS"}</span>
          <span className="tag">Operator console</span>
        </div>
        <div className="panel-b">
          <LoginForm />
        </div>
      </div>
      <div className="login-foot mono dim">Authorized users only · activity is logged</div>
    </main>
  );
}
