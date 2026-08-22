import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loginCss = readFileSync(new URL("./Login.css", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("./Login.jsx", import.meta.url), "utf8");

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

describe("Login visual performance budget", () => {
  it("uses opaque surfaces without expensive live backdrop blur", () => {
    expect(loginCss).not.toContain("backdrop-filter");
    expect(loginCss).toContain("--color-surface-raised: #ffffff;");
    expect(loginCss).toContain("--login-surface: var(--color-surface-raised);");
    expect(loginCss).toContain("background: var(--login-surface);");
  });

  it("uses the accessible institutional PRIRTEM palette", () => {
    expect(loginCss).toContain("--color-brand-navy: #0b1739;");
    expect(loginCss).toContain("--color-brand-blue: #3156d3;");
    expect(loginCss).toContain("--color-brand-orange: #f25a2b;");
    expect(loginCss).toContain("--color-brand-gold: #f2b544;");
    expect(loginCss).toContain("--color-brand-teal: #0d806f;");
    expect(contrast("#11172a", "#ffffff")).toBeGreaterThanOrEqual(7);
    expect(contrast("#5f687b", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", "#0b1739")).toBeGreaterThanOrEqual(7);
    expect(contrast("#ffffff", "#3156d3")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#b93815", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("removes the WebGL ball pit from the login bundle", () => {
    expect(loginSource).not.toContain("Ballpit");
    expect(loginSource).not.toContain("Suspense");
    expect(loginSource).not.toContain("lazy(");
  });

  it("does not permanently promote every slide image", () => {
    expect(loginCss).not.toContain("will-change: opacity");
  });
});
