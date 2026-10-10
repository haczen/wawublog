import { describe, expect, it } from "bun:test";
import {
  buildWranglerObservabilityConfig,
  buildWranglerQueueConfig,
  buildWranglerRoutesConfig,
  buildWranglerTriggersConfig,
  buildWorkersDevConfig,
  collectWorkerSecrets,
} from "./deploy-cf";

describe("collectWorkerSecrets", () => {
  it("includes supported non-empty worker secrets", () => {
    const secrets = collectWorkerSecrets({
      JWT_SECRET: "jwt-secret",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "password",
      RIN_GITHUB_CLIENT_ID: "client-id",
      RIN_GITHUB_CLIENT_SECRET: "client-secret",
      S3_ACCESS_KEY_ID: "access-key",
      S3_SECRET_ACCESS_KEY: "secret-key",
      UNUSED: "ignored",
    });

    expect(secrets).toEqual({
      JWT_SECRET: "jwt-secret",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "password",
      RIN_GITHUB_CLIENT_ID: "client-id",
      RIN_GITHUB_CLIENT_SECRET: "client-secret",
      S3_ACCESS_KEY_ID: "access-key",
      S3_SECRET_ACCESS_KEY: "secret-key",
    });
  });

  it("omits empty secret values", () => {
    const secrets = collectWorkerSecrets({
      JWT_SECRET: "",
      ADMIN_USERNAME: undefined,
      ADMIN_PASSWORD: "password",
    });

    expect(secrets).toEqual({
      ADMIN_PASSWORD: "password",
    });
  });
});

describe("buildWranglerTriggersConfig", () => {
  it("omits cron triggers for preview deploys", () => {
    expect(buildWranglerTriggersConfig(true)).toBe("");
  });

  it("includes cron triggers for production deploys", () => {
    expect(buildWranglerTriggersConfig(false)).toContain("[triggers]");
    expect(buildWranglerTriggersConfig(false)).toContain('crons = ["*/20 * * * *"]');
  });
});

describe("buildWranglerQueueConfig", () => {
  it("includes queue consumers for preview deploys", () => {
    const config = buildWranglerQueueConfig("rin-preview-tasks", true);
    expect(config).toContain('queue = "rin-preview-tasks"');
    expect(config).toContain("[[queues.consumers]]");
  });

  it("includes queue consumers for production deploys", () => {
    const config = buildWranglerQueueConfig("rin-tasks", false);
    expect(config).toContain("[[queues.producers]]");
    expect(config).toContain("[[queues.consumers]]");
  });
});

describe("buildWranglerRoutesConfig", () => {
  it("omits routes when no domain is configured", () => {
    expect(buildWranglerRoutesConfig("", false)).toBe("");
  });

  it("omits routes for preview deploys", () => {
    expect(buildWranglerRoutesConfig("wawu.cc.cd", true)).toBe("");
  });

  it("attaches the domain as a custom domain for production deploys", () => {
    const config = buildWranglerRoutesConfig("wawu.cc.cd", false);
    expect(config).toContain('routes = [');
    expect(config).toContain('{ pattern = "wawu.cc.cd", custom_domain = true }');
  });

  it("attaches multiple comma-separated domains", () => {
    const config = buildWranglerRoutesConfig("wawu.cc.cd, www.wawu.cc.cd", false);
    expect(config).toContain('{ pattern = "wawu.cc.cd", custom_domain = true }');
    expect(config).toContain('{ pattern = "www.wawu.cc.cd", custom_domain = true }');
  });
});

describe("buildWorkersDevConfig", () => {
  it("omits workers_dev when disabled", () => {
    expect(buildWorkersDevConfig(false)).toBe("");
  });

  it("enables the workers.dev route when enabled", () => {
    expect(buildWorkersDevConfig(true)).toContain("workers_dev = true");
  });
});

describe("buildWranglerObservabilityConfig", () => {
  it("enables invocation logs and disables traces for preview deploys", () => {
    const config = buildWranglerObservabilityConfig(true);
    expect(config).toContain("[observability]");
    expect(config).toContain("[observability.logs]");
    expect(config).toContain("enabled = true");
    expect(config).toContain("invocation_logs = true");
    expect(config).toContain("[observability.traces]");
    expect(config).toContain("enabled = false");
  });

  it("omits observability overrides for production deploys", () => {
    expect(buildWranglerObservabilityConfig(false)).toBe("");
  });
});
