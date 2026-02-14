export type HealthPayload = {
  ok: boolean;
  service: string;
  app: string;
  ts: string;
};

export type BootstrapPayload = {
  app: string;
  adminEmail: string;
  url: string;
  inviteUrl: string;
  note: string;
};

export type SessionPayload = {
  session: {
    id: string;
    userId: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    token: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  } | null;
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type PasswordStatusPayload = {
  mustChangePassword: boolean;
};

export type WorkspaceMembership = {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  workspaceId: string;
  userId: string;
  workspace: {
    id: string;
    name: string;
    ownerId: string;
    createdAt: string;
    updatedAt: string;
    _count: {
      members: number;
      channels: number;
    };
  };
};

export type ChannelPayload = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  type: "TEXT";
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type MessagePayload = {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
};

export type ResolvedInvitePayload = {
  code: string;
  targetUrl: string;
  redirectTo: string;
  expiresAt: string | null;
};

const resolverBaseUrl = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_RESOLVER_BASE_URL || '').replace(/\/$/, '');
const publicJoinBaseUrl = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_PUBLIC_JOIN_BASE_URL || '').replace(/\/$/, '');

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function resolverRequest<T>(path: string): Promise<T> {
  const resolvedPath = resolverBaseUrl ? `${resolverBaseUrl}${path}` : path;
  const response = await fetch(resolvedPath, {
    credentials: "omit",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getHealth(): Promise<HealthPayload> {
  return request<HealthPayload>("/api/health");
}

export function getBootstrap(): Promise<BootstrapPayload> {
  return request<BootstrapPayload>("/api/bootstrap");
}

export async function registerWithEmail(params: {
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  const response = await fetch("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export async function loginWithEmail(params: {
  email: string;
  password: string;
}): Promise<void> {
  const response = await fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

export function getSession(): Promise<SessionPayload> {
  return request<SessionPayload>("/api/auth/get-session");
}

export function getPasswordStatus(): Promise<PasswordStatusPayload> {
  return request<PasswordStatusPayload>("/api/auth/password-status");
}

export async function changePassword(params: { currentPassword: string; newPassword: string }): Promise<void> {
  const response = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export function listWorkspaces(): Promise<WorkspaceMembership[]> {
  return request<WorkspaceMembership[]>("/api/workspaces");
}

export async function createWorkspace(name: string): Promise<void> {
  const response = await fetch("/api/workspaces", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export function listChannels(workspaceId: string): Promise<ChannelPayload[]> {
  return request<ChannelPayload[]>(`/api/workspaces/${workspaceId}/channels`);
}

export async function createChannel(workspaceId: string, name: string): Promise<void> {
  const response = await fetch(`/api/workspaces/${workspaceId}/channels`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ name, type: "TEXT" }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export async function createInvite(workspaceId: string): Promise<{ code: string }> {
  const response = await fetch(`/api/workspaces/${workspaceId}/invites`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ expiresInHours: 24 }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json() as Promise<{ code: string }>;
}

export async function joinInvite(code: string): Promise<void> {
  const response = await fetch(`/api/invites/${code}/join`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export function listMessages(channelId: string): Promise<MessagePayload[]> {
  return request<MessagePayload[]>(`/api/channels/${channelId}/messages?limit=30`);
}

export async function sendMessage(channelId: string, content: string): Promise<void> {
  const response = await fetch(`/api/channels/${channelId}/messages`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export function resolveInviteCode(code: string): Promise<ResolvedInvitePayload> {
  return resolverRequest<ResolvedInvitePayload>(`/api/resolver/resolve/${encodeURIComponent(code)}`);
}

export function getShareInviteLink(code: string): string {
  return `${window.location.origin}/invite/${encodeURIComponent(code)}`;
}

export function getResolverJoinLink(code: string): string | null {
  if (!publicJoinBaseUrl) {
    return null;
  }
  return `${publicJoinBaseUrl}/join?code=${encodeURIComponent(code)}`;
}
