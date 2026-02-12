import { useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/')({
  component: IndexRedirectPage,
});

function IndexRedirectPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;
    if (session?.user) {
      void navigate({ to: '/app', replace: true });
      return;
    }
    void navigate({ to: '/login', replace: true });
  }, [isPending, navigate, session?.user]);

  return (
    <div className="grid min-h-[40vh] place-items-center rounded-xl border border-[#2f3136] bg-[#141518] p-6 text-sm text-slate-300">
      Redirection...
    </div>
  );
}
