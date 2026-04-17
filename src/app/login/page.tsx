export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { err?: string; next?: string };
}) {
  const hasError = searchParams.err === "1";
  const next = searchParams.next || "/admin";

  return (
    <div className="lg-wrap">
      <div className="lg-bg-blob lg-blob-1" />
      <div className="lg-bg-blob lg-blob-2" />

      <div className="lg-card">
        <div className="lg-header">
          <div className="lg-logo">
            <i className="fas fa-landmark"></i>
          </div>
          <h1>Bagnoli Monitor</h1>
          <p>Area riservata · accesso Commissariato</p>
        </div>

        <form className="lg-form" method="POST" action="/api/login">
          <input type="hidden" name="next" value={next} />

          <label className="lg-field">
            <span className="lg-lbl">
              <i className="fas fa-user"></i> Utente
            </span>
            <input
              type="text"
              name="user"
              autoComplete="username"
              required
              autoFocus
              placeholder="admin"
              defaultValue="admin"
            />
          </label>

          <label className="lg-field">
            <span className="lg-lbl">
              <i className="fas fa-key"></i> Password
            </span>
            <input
              type="password"
              name="pass"
              autoComplete="current-password"
              required
              placeholder="••••••••••••"
            />
          </label>

          <label className="lg-remember">
            <input type="checkbox" name="remember" defaultChecked />
            <span>Ricordami per 30 giorni su questo dispositivo</span>
          </label>

          {hasError && (
            <div className="lg-error">
              <i className="fas fa-circle-exclamation"></i> Utente o password errati
            </div>
          )}

          <button type="submit" className="lg-submit">
            <i className="fas fa-right-to-bracket"></i> Accedi
          </button>

          <a href="/" className="lg-back">
            ← Torna al sito pubblico
          </a>
        </form>

        <div className="lg-footer">
          <span>Protocollo sessione firmata HMAC-SHA256</span>
          <span>
            <i className="fas fa-shield-halved"></i> Solo HTTPS · cookie httpOnly
          </span>
        </div>
      </div>
    </div>
  );
}
