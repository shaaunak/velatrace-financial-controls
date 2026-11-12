export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type ActorRole = "ANALYST" | "CONTROLLER" | "AUDITOR";

export interface DemoActor {
  actorId: string;
  role: ActorRole;
  displayName: string;
}

export const DEMO_ACTORS: DemoActor[] = [
  { actorId: "analyst_maya", role: "ANALYST", displayName: "Maya Lin (Operations Analyst)" },
  { actorId: "controller_marcus", role: "CONTROLLER", displayName: "Marcus Vance (Financial Controller)" },
  { actorId: "auditor_elena", role: "AUDITOR", displayName: "Elena Rostova (Internal Auditor)" },
];

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { actor?: DemoActor } = {}
): Promise<T> {
  const { actor, headers, ...rest } = options;
  const activeActor = actor || DEMO_ACTORS[0];

  const mergedHeaders: Record<string, string> = {
    "X-Actor-Id": activeActor.actorId,
    "X-Actor-Role": activeActor.role,
    ...(headers as Record<string, string>),
  };
  if (!(rest.body instanceof FormData) && !mergedHeaders["Content-Type"]) {
    mergedHeaders["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...rest,
    headers: mergedHeaders,
    cache: "no-store",
  });

  if (!res.ok) {
    let errBody: unknown = null;
    try {
      errBody = await res.json();
    } catch {
      errBody = await res.text();
    }
    const detail = (errBody as { detail?: unknown })?.detail ?? errBody;
    const msg =
      typeof detail === "string"
        ? detail
        : (detail as { message?: string })?.message || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, detail);
  }

  return res.json() as Promise<T>;
}

export function formatUsd(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

export function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(val);
}
