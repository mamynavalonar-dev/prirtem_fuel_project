import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logoLoopProps = vi.fn();

vi.mock("../components/LogoLoop.jsx", () => ({
  default: function LogoLoopProbe(props) {
    logoLoopProps(props);
    return <div data-testid="logo-loop" />;
  },
}));

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

vi.mock("../utils/api.js", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, ...props }) => <a {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

import Login from "./Login.jsx";

describe("Login redesign", () => {
  let renderer;

  beforeEach(() => {
    vi.useFakeTimers();
    logoLoopProps.mockClear();
    globalThis.document = {
      visibilityState: "visible",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    if (renderer) {
      act(() => renderer.unmount());
      renderer = undefined;
    }
    vi.useRealTimers();
    delete globalThis.document;
  });

  it("keeps the partner logo loop and advances the editorial cards", async () => {
    await act(async () => {
      renderer = TestRenderer.create(<Login />);
      await Promise.resolve();
    });

    expect(logoLoopProps).toHaveBeenCalledTimes(1);
    expect(logoLoopProps.mock.calls[0][0].speed).toBe(12);

    const selectedBefore = renderer.root
      .findAllByProps({ role: "tab" })
      .find((tab) => tab.props["aria-selected"]);
    expect(selectedBefore.props["aria-label"]).toBe("Diapositive 1");

    await act(async () => {
      vi.advanceTimersByTime(4500);
      await Promise.resolve();
    });

    const selectedAfter = renderer.root
      .findAllByProps({ role: "tab" })
      .find((tab) => tab.props["aria-selected"]);
    expect(selectedAfter.props["aria-label"]).toBe("Diapositive 2");
  });

  it("keeps an accessible form structure after the full redesign", async () => {
    await act(async () => {
      renderer = TestRenderer.create(<Login />);
      await Promise.resolve();
    });

    const username = renderer.root.findByProps({ id: "login-username" });
    const password = renderer.root.findByProps({ id: "login-password" });
    const usernameLabel = renderer.root.findByProps({ htmlFor: "login-username" });
    const passwordLabel = renderer.root.findByProps({ htmlFor: "login-password" });

    expect(username.props.type).toBe("text");
    expect(password.props.type).toBe("password");
    expect(usernameLabel.type).toBe("label");
    expect(passwordLabel.type).toBe("label");
  });

  it("does not mount a WebGL canvas on the login route", async () => {
    await act(async () => {
      renderer = TestRenderer.create(<Login />);
      await Promise.resolve();
    });

    expect(renderer.root.findAllByType("canvas")).toHaveLength(0);
  });
});
