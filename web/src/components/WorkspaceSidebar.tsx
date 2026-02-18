import { Skeleton } from "@/components/ui/skeleton";
import { THEMES, useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { Palette, Plus, Settings, X } from "lucide-react";
import type { FormEvent } from "react";
import { useRef, useState } from "react";

type WorkspaceItem = {
  workspaceId: string;
  name: string;
  role: string;
};

type Props = {
  workspaces: WorkspaceItem[] | undefined;
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (e: FormEvent) => void;
  workspaceName: string;
  setWorkspaceName: (v: string) => void;
  pendingMutations: Set<string>;
  mutationError: string;
};

export function WorkspaceSidebar({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  workspaceName,
  setWorkspaceName,
  pendingMutations,
  mutationError,
}: Props) {
  const { theme, setTheme } = useTheme();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpenModal() {
    setShowCreateModal(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!workspaceName.trim()) return;
    await onCreateWorkspace(e);
    setShowCreateModal(false);
  }

  return (
    <aside className="hidden w-[72px] shrink-0 flex-col items-center gap-1.5 border-r border-border bg-card py-3 md:flex">
      {workspaces === undefined ? (
        <>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 w-11 rounded-2xl" />
          ))}
        </>
      ) : (
        workspaces.map((ws) => {
          const initial = ws.name.charAt(0).toUpperCase();
          const isSelected = ws.workspaceId === selectedWorkspaceId;
          return (
            <div
              key={ws.workspaceId}
              className="relative flex w-full items-center justify-center"
            >
              <span
                className={cn(
                  "absolute left-0 h-5 w-1 rounded-r-full bg-primary transition-all duration-200",
                  isSelected
                    ? "opacity-100 scale-y-100"
                    : "opacity-0 scale-y-0",
                )}
              />
              <button
                type="button"
                title={ws.name}
                onClick={() => onSelectWorkspace(ws.workspaceId)}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold transition-all duration-200",
                  isSelected
                    ? "rounded-xl bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:rounded-xl hover:bg-primary/20 hover:text-primary",
                )}
              >
                {initial}
              </button>
            </div>
          );
        })
      )}

      {workspaces !== undefined && workspaces.length > 0 && (
        <div className="my-1 h-px w-8 bg-border" />
      )}
      <div className="relative flex w-full items-center justify-center">
        <button
          type="button"
          title="Create workspace"
          onClick={handleOpenModal}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground transition-all duration-200 hover:rounded-xl hover:bg-green-500/20 hover:text-green-500"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Create workspace modal */}
      {showCreateModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                Nouveau workspace
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Nom du workspace
                </label>
                <input
                  ref={inputRef}
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Mon équipe..."
                  className="h-10 rounded-lg border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
              {mutationError && (
                <p className="text-xs text-red-400">{mutationError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="h-9 flex-1 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={
                    !workspaceName.trim() ||
                    pendingMutations.has("createWorkspace")
                  }
                  className="h-9 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {pendingMutations.has("createWorkspace")
                    ? "Création..."
                    : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings link */}
      <div className="flex w-full items-center justify-center">
        <Link
          to="/settings"
          title="Paramètres"
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground transition-all duration-200 hover:rounded-xl hover:bg-primary/20 hover:text-primary"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>

      {/* Theme picker button */}
      <div className="relative flex w-full items-center justify-center">
        <button
          type="button"
          title="Thème"
          onClick={() => setShowThemePicker((p) => !p)}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-200",
            showThemePicker
              ? "rounded-xl bg-primary/20 text-primary"
              : "bg-muted text-muted-foreground hover:rounded-xl hover:bg-primary/20 hover:text-primary",
          )}
        >
          <Palette className="h-5 w-5" />
        </button>

        {/* Theme picker popover */}
        {showThemePicker && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowThemePicker(false)}
            />
            {/* Panel */}
            <div className="absolute bottom-0 left-14 z-50 w-52 rounded-xl border border-border bg-card p-3 shadow-xl">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Thème
              </p>
              <div className="grid grid-cols-2 gap-2">
                {THEMES.map((t) => {
                  const isActive = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTheme(t.id);
                        setShowThemePicker(false);
                      }}
                      className={cn(
                        "relative flex flex-col items-start gap-1.5 rounded-lg border p-2 transition-all",
                        isActive
                          ? "border-primary bg-primary/10"
                          : "border-border bg-input hover:border-primary/40",
                      )}
                    >
                      {/* Color strip */}
                      <div
                        className="h-6 w-full rounded-md"
                        style={{ background: t.bg }}
                      >
                        <div
                          className="h-full w-2/5 rounded-md opacity-90"
                          style={{ background: t.primary }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-[11px] font-medium",
                          isActive ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {t.label}
                      </span>
                      {isActive && (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
