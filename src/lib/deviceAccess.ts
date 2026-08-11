export const TRUSTED_DEVICE_STORAGE_KEY = "uni-kicker-ranking:trusted-device:v1";

export interface TrustedDeviceCredential {
  token: string;
  expiresAt: string;
}

type DeviceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readTrustedDevice(storage: DeviceStorage, now = Date.now()): TrustedDeviceCredential | null {
  try {
    const raw = storage.getItem(TRUSTED_DEVICE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<TrustedDeviceCredential>;
    const expiresAt = typeof parsed.expiresAt === "string" ? Date.parse(parsed.expiresAt) : Number.NaN;

    if (typeof parsed.token !== "string" || !parsed.token.startsWith("device_") || Number.isNaN(expiresAt) || expiresAt <= now) {
      storage.removeItem(TRUSTED_DEVICE_STORAGE_KEY);
      return null;
    }

    return { token: parsed.token, expiresAt: parsed.expiresAt as string };
  } catch {
    storage.removeItem(TRUSTED_DEVICE_STORAGE_KEY);
    return null;
  }
}

export function saveTrustedDevice(storage: DeviceStorage, credential: TrustedDeviceCredential): void {
  storage.setItem(TRUSTED_DEVICE_STORAGE_KEY, JSON.stringify(credential));
}

export function clearTrustedDevice(storage: DeviceStorage): void {
  storage.removeItem(TRUSTED_DEVICE_STORAGE_KEY);
}

export function formatTrustedDeviceExpiry(expiresAt: string): string {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(expiresAt));
}
