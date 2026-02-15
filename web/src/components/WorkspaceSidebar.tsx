import { cn } from "@/lib/utils";

type WorkspaceItem = {
  workspaceId: string;
  name: string;
  role: string;
};

type Props = {
  workspaces: WorkspaceItem[];
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
};

export function WorkspaceSidebar({ workspaces, selectedWorkspaceId, onSelectWorkspace }: Props) {
  return (
    <aside className="hidden flex-col items-center gap-2 border-r border-surface-3 bg-surface py-3 md:flex">
      {workspaces.map((ws) => {
        const initial = ws.name.charAt(0).toUpperCase();
        const isSelected = ws.workspaceId === selectedWorkspaceId;
        return (
          <button
            key={ws.workspaceId}
            type="button"
            title={ws.name}
            onClick={() => onSelectWorkspace(ws.workspaceId)}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold transition-all",
              isSelected
                ? "bg-accent text-white shadow-[0_0_0_2px_rgba(124,90,246,0.5)]"
                : "bg-surface-3 text-muted-foreground hover:bg-surface-4 hover:text-foreground",
            )}
          >
            {initial}
          </button>
        );
      })}
    </aside>
  );
}
