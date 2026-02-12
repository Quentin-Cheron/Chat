import { openUrl } from "@tauri-apps/plugin-opener";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  Clock3,
  ExternalLink,
  Server,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { humanizeResolverError, resolveInviteCode } from "./lib/resolver";
import {
  readRecentServers,
  removeRecentServer,
  toggleFavoriteServer,
  writeRecentServer,
} from "./lib/storage";

export function App() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState(readRecentServers);
  const [manualUrl, setManualUrl] = useState("");

  const statusLabel = useMemo(
    () => (loading ? "Connexion..." : "Rejoindre via code"),
    [loading],
  );

  async function runJoin(inputCode: string) {
    setLoading(true);
    setError(null);

    try {
      const payload = await resolveInviteCode(inputCode.trim());
      setRecent(
        writeRecentServer({
          code: payload.code,
          targetUrl: payload.targetUrl,
          at: new Date().toISOString(),
        }),
      );
      await openExternal(payload.redirectTo);
    } catch (joinError) {
      const message =
        joinError instanceof Error ? joinError.message : "Erreur inconnue.";
      setError(humanizeResolverError(message));
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim()) return;
    await runJoin(code);
  }

  async function onOpenManualServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualUrl.trim()) return;
    try {
      const url = new URL(manualUrl.trim());
      if (
        url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          (url.hostname === "localhost" || url.hostname === "127.0.0.1")
        )
      ) {
        setError("Utilisez https:// (ou http://localhost en dev).");
        return;
      }
      await openExternal(url.toString());
      setManualUrl("");
    } catch {
      setError("URL serveur invalide.");
    }
  }

  return (
    <main className="desktop-root">
      <section className="window-shell">
        <div className="window-content">
          <aside className="sidebar">
            <p className="sidebar-label">Serveurs recents</p>
            {!recent.length ? (
              <p className="sidebar-empty">Aucun serveur recent.</p>
            ) : null}
            <div className="sidebar-list">
              {recent.map((item) => (
                <div key={`${item.code}:${item.at}`} className="sidebar-item">
                  <button
                    className="sidebar-item-main"
                    onClick={() => void runJoin(item.code)}
                  >
                    <p className="server-line">
                      <Server size={14} /> {item.targetUrl}
                    </p>
                    <p className="code-line">Code: {item.code}</p>
                    <p className="date-line">
                      <Clock3 size={13} /> {new Date(item.at).toLocaleString()}
                    </p>
                  </button>
                  <div className="sidebar-item-actions">
                    <button
                      className={`icon-btn ${item.favorite ? "active" : ""}`}
                      title="Favori"
                      onClick={() => setRecent(toggleFavoriteServer(item.code))}
                    >
                      <Star size={13} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Supprimer"
                      onClick={() => setRecent(removeRecentServer(item.code))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <form className="manual-form" onSubmit={onOpenManualServer}>
              <label htmlFor="manual-url">Connexion directe</label>
              <input
                id="manual-url"
                value={manualUrl}
                onChange={(event) => setManualUrl(event.target.value)}
                placeholder="https://chat.entreprise.com"
              />
              <button type="submit">Ouvrir serveur</button>
            </form>
          </aside>

          <section className="main-pane">
            <p className="eyebrow">Souverainete des donnees</p>
            <h1>Vos donnees restent sur le serveur de votre organisation.</h1>
            <p className="subtext">
              Entrez un code d'invitation. L'application resout la cible puis
              vous redirige vers l'instance privee.
            </p>

            <form className="join-form" onSubmit={onSubmit}>
              <label htmlFor="code">Code d'invitation</label>
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ex: bM8q3xK9"
                autoComplete="off"
                required
              />
              <button type="submit" disabled={loading}>
                {statusLabel}
              </button>
            </form>

            {error ? <p className="error">{error}</p> : null}

            <div className="trust-row">
              <span>
                <ShieldCheck size={14} /> Donnees hebergees sur votre serveur
              </span>
              <span>
                <ExternalLink size={14} /> Redirection vers instance cible
              </span>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

async function openExternal(url: string) {
  const label = `server-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  try {
    const webview = new WebviewWindow(label, {
      title: "PrivateChat Workspace",
      url,
      width: 1280,
      height: 820,
      minWidth: 980,
      minHeight: 640,
      center: true,
    });
    webview.once("tauri://error", async () => {
      await openUrl(url);
    });
    return;
  } catch {
    // fallback to opener plugin below
  }

  try {
    await openUrl(url);
    return;
  } catch {
    window.location.assign(url);
  }
}
