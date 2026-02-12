import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/install")({
  component: InstallPage,
});

function InstallPage() {
  return (
    <Card className="reveal">
      <CardHeader>
        <CardTitle className="text-4xl">Installation guide</CardTitle>
        <CardDescription>
          Parcours utilisateur ultra simple pour deployer un serveur privé.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 text-sm text-muted-foreground">
          <li className="rounded-xl border-2 border-border bg-white p-4">
            <strong className="mb-1 block text-foreground">
              1. VPS Ubuntu
            </strong>
            Achete un VPS, connecte-toi en SSH, et prepare un domaine (ex:
            chat.tondomaine.com).
          </li>
          <li className="rounded-xl border-2 border-border bg-white p-4">
            <strong className="mb-1 block text-foreground">
              2. Commande unique
            </strong>
            Lance:{" "}
            <code className="font-mono">
              curl -fsSL https://ton-domaine/install.sh | sudo bash
            </code>
          </li>
          <li className="rounded-xl border-2 border-border bg-white p-4">
            <strong className="mb-1 block text-foreground">
              3. Partage invitation
            </strong>
            Recupere l’URL final et invite tes amis directement.
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
