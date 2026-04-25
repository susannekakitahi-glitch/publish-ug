/**
 * Posta frontend ↔ Zernio backend proxy.
 *
 * The backend hides the real Zernio API key. If VITE_POSTA_BACKEND is unset
 * (local dev / static preview with no backend) the helpers return null and
 * callers fall back to the mock OAuth flow.
 */
import type { Platform } from "./state";

const BASE =
  import.meta.env.VITE_POSTA_BACKEND ||
  "https://posta-backend-ucvedwse.fly.dev";

const ZERNIO_PLATFORM: Record<Platform, string> = {
  facebook: "facebook",
  instagram: "instagram",
  x: "twitter",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube",
  whatsapp: "whatsapp",
  telegram: "telegram",
};

export function zernioEnabled(): boolean {
  return Boolean(BASE);
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${r.status} ${text.slice(0, 300)}`);
  }
  return (await r.json()) as T;
}

export interface ZernioProfile {
  _id: string;
  name: string;
  isDefault?: boolean;
}

export async function listProfiles(): Promise<ZernioProfile[]> {
  const r = await j<{ profiles: ZernioProfile[] }>("/profiles");
  return r.profiles || [];
}

export async function getDefaultProfileId(): Promise<string> {
  const profs = await listProfiles();
  const def = profs.find((p) => p.isDefault) || profs[0];
  if (!def) throw new Error("No Zernio profile exists yet — create one first.");
  return def._id;
}

export async function createProfile(name: string): Promise<ZernioProfile> {
  const r = await j<{ profile: ZernioProfile }>("/profiles", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return r.profile;
}

export interface ZernioAccount {
  _id: string;
  platform: string;
  username?: string;
  name?: string;
  profileId?: string;
}

export async function listAccounts(profileId: string): Promise<ZernioAccount[]> {
  const r = await j<{ accounts?: ZernioAccount[] }>(
    `/profiles/${profileId}/accounts`
  );
  return r.accounts || [];
}

export async function getConnectUrl(
  platform: Platform,
  profileId: string
): Promise<string> {
  const zp = ZERNIO_PLATFORM[platform];
  const r = await j<{ authUrl: string }>(
    `/connect/${zp}?profileId=${encodeURIComponent(profileId)}`
  );
  return r.authUrl;
}
