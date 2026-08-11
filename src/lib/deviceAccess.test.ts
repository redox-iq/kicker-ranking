import { describe, expect, it } from "vitest";
import { clearTrustedDevice, readTrustedDevice, saveTrustedDevice, TRUSTED_DEVICE_STORAGE_KEY } from "./deviceAccess";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("trusted device storage", () => {
  it("keeps a valid device token", () => {
    const storage = new MemoryStorage();
    const credential = { token: "device_valid-token", expiresAt: "2026-09-10T12:00:00.000Z" };

    saveTrustedDevice(storage, credential);

    expect(readTrustedDevice(storage, Date.parse("2026-08-11T12:00:00.000Z"))).toEqual(credential);
  });

  it("removes expired or malformed credentials", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      TRUSTED_DEVICE_STORAGE_KEY,
      JSON.stringify({ token: "device_expired", expiresAt: "2026-08-10T12:00:00.000Z" })
    );

    expect(readTrustedDevice(storage, Date.parse("2026-08-11T12:00:00.000Z"))).toBeNull();
    expect(storage.getItem(TRUSTED_DEVICE_STORAGE_KEY)).toBeNull();
  });

  it("forgets a saved device", () => {
    const storage = new MemoryStorage();
    saveTrustedDevice(storage, { token: "device_valid-token", expiresAt: "2026-09-10T12:00:00.000Z" });

    clearTrustedDevice(storage);

    expect(storage.getItem(TRUSTED_DEVICE_STORAGE_KEY)).toBeNull();
  });
});
