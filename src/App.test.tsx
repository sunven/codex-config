import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setTitle: vi.fn(),
  }),
}));

function appState(overrides = {}) {
  return {
    homeDir: "/Users/test/.codex",
    configPath: "/Users/test/.codex/config.toml",
    resolvedPath: "/Users/test/.codex/config.toml",
    backupDir: "/Users/test/.codex/backups",
    writable: true,
    health: {
      status: "ready",
      configExists: true,
      schemaVersion: "2026-06-08",
      codex: {
        binaryPath: "/opt/homebrew/bin/codex",
        version: "codex 1.2.3",
        found: true,
      },
    },
    fields: [
      {
        path: "features.fast_mode",
        label: "Fast mode",
        group: "Features",
        kind: "boolean",
        value: "false",
        editable: true,
        risk: "normal",
        note: "Use the optimized Codex execution profile.",
      },
      {
        path: "model",
        label: "Model",
        group: "Model",
        kind: "text",
        value: "gpt-5",
        editable: true,
        risk: "caution",
        note: "Default model for new sessions.",
      },
      {
        path: "approval_policy",
        label: "Approval policy",
        group: "Safety",
        kind: "select",
        value: undefined,
        editable: true,
        risk: "dangerous",
        options: ["never", "on-request", "on-failure"],
        note: "Controls when Codex asks before running commands.",
      },
      {
        path: "shell_environment_policy",
        label: "Shell environment policy",
        group: "Safety",
        kind: "status",
        value: "read-only object",
        editable: false,
        risk: "secret",
      },
    ],
    profileFields: [
      {
        path: "model",
        label: "Model",
        group: "Model",
        kind: "text",
        value: "gpt-5-mini",
        editable: true,
        risk: "caution",
      },
    ],
    catalogFields: [
      {
        path: "features.fast_mode",
        label: "Fast mode",
        group: "Features",
        kind: "boolean",
        value: "false",
        editable: true,
        risk: "normal",
        note: "Use the optimized Codex execution profile.",
      },
      {
        path: "approval_policy",
        label: "Approval policy",
        group: "Safety",
        kind: "select",
        value: undefined,
        editable: true,
        risk: "dangerous",
        options: ["never", "on-request", "on-failure"],
        note: "Controls when Codex asks before running commands.",
      },
      {
        path: "model_provider.env_key",
        label: "Provider env key",
        group: "Model providers",
        kind: "text",
        value: undefined,
        editable: true,
        risk: "secret",
        note: "Very long schema note that should wrap cleanly without overlapping controls or metadata badges in the catalog list.",
      },
      {
        path: "experimental_resume",
        label: "Experimental resume",
        group: "Sessions",
        kind: "boolean",
        value: undefined,
        editable: false,
        risk: "experimental",
      },
    ],
    modelProviders: {
      providers: [],
      reservedIds: ["openai"],
    },
    mcpServers: {
      servers: [],
    },
    codexSessions: {
      sessionsDir: "/Users/test/.codex/sessions",
      sessions: [
        {
          id: "2026/06/08/rollout-2026-06-08T10-00-00-alpha.jsonl",
          sessionId: "alpha",
          title: "Refactor config UI",
          cwd: "/Users/test/project",
          path: "/Users/test/.codex/sessions/2026/06/08/rollout-2026-06-08T10-00-00-alpha.jsonl",
          relativePath: "2026/06/08/rollout-2026-06-08T10-00-00-alpha.jsonl",
          createdAt: "2026-06-08T02:00:00.000Z",
          lastTimestamp: "2026-06-08T02:05:00.000Z",
          cliVersion: "1.2.3",
          modelProvider: "openai",
          size: 1536,
          modifiedMs: 1780893900000,
          messageCount: 8,
          userMessageCount: 3,
        },
        {
          id: "2026/05/31/rollout-2026-05-31T08-00-00-beta.jsonl",
          title: "Broken transcript",
          path: "/Users/test/.codex/sessions/2026/05/31/rollout-2026-05-31T08-00-00-beta.jsonl",
          relativePath: "2026/05/31/rollout-2026-05-31T08-00-00-beta.jsonl",
          createdAt: "2026-05-31T00:00:00.000Z",
          size: 512,
          messageCount: 0,
          userMessageCount: 0,
          parseError: "Unexpected JSON token at line 2",
        },
        {
          id: "2025/12/24/rollout-2025-12-24T08-00-00-gamma.jsonl",
          title: "Older session",
          path: "/Users/test/.codex/sessions/2025/12/24/rollout-2025-12-24T08-00-00-gamma.jsonl",
          relativePath: "2025/12/24/rollout-2025-12-24T08-00-00-gamma.jsonl",
          createdAt: "2025-12-24T00:00:00.000Z",
          size: 1024,
          messageCount: 4,
          userMessageCount: 1,
        },
      ],
    },
    skills: {
      roots: [],
      skills: [],
    },
    rawToml: "model = \"gpt-5\"",
    profileStatus: {
      activeProfile: "work",
      exists: true,
      missing: false,
    },
    profileWarnings: [
      {
        path: "model",
        profile: "work",
        rootValue: "gpt-5",
        profileValue: "gpt-5-mini",
        message: "profile overrides model",
      },
    ],
    backups: [],
    preferences: {},
    ...overrides,
  };
}

function appStateWithModelProviders(overrides = {}) {
  return appState({
    modelProviders: {
      reservedIds: ["openai", "azure", "ollama", "lmstudio"],
      providers: [
        {
          id: "local-gpt",
          name: "Local GPT",
          baseUrl: "https://models.example.test/v1/a/very/long/provider/path/that/should/wrap",
          envKey: "LOCAL_GPT_KEY",
          envKeyInstructions: "Set LOCAL_GPT_KEY before launching Codex.",
          wireApi: "responses",
          requestMaxRetries: 2,
          streamMaxRetries: 3,
          streamIdleTimeoutMs: 120000,
          requiresOpenaiAuth: false,
          supportsWebsockets: true,
          queryParams: {
            organization: "workspace-alpha",
          },
          httpHeaders: {
            "X-Long-Provider-Header": "very-long-header-value-that-should-not-overlap",
          },
          envHttpHeaders: {
            Authorization: "LOCAL_GPT_KEY",
          },
          hasAdvancedFields: true,
        },
        {
          id: "openai",
          name: "Built-in OpenAI",
          baseUrl: "https://api.openai.com/v1",
          envKey: "OPENAI_API_KEY",
          envKeyInstructions: "",
          wireApi: "responses",
          queryParams: {},
          httpHeaders: {},
          envHttpHeaders: {},
          hasAdvancedFields: false,
        },
      ],
    },
    ...overrides,
  });
}

function appStateWithMcpServers(overrides = {}) {
  return appState({
    mcpServers: {
      servers: [
        {
          id: "filesystem",
          command: "npx",
          args: [
            "@modelcontextprotocol/server-filesystem",
            "/Users/test/projects/a-very-long-workspace-path-that-should-wrap",
          ],
          env: {
            MCP_FILESYSTEM_ROOT:
              "/Users/test/projects/a-very-long-workspace-path-that-should-wrap",
          },
          startupTimeoutMs: 30000,
          enabled: true,
          hasAdvancedFields: true,
        },
        {
          id: "disabled-server",
          command: "node",
          args: ["server.js"],
          env: {},
          enabled: false,
          hasAdvancedFields: false,
        },
      ],
    },
    ...overrides,
  });
}

function appStateWithSkills(overrides = {}): any {
  return appState({
    skills: {
      roots: [
        {
          path: "/Users/test/.codex/skills",
          label: "Codex global skills",
          exists: true,
        },
        {
          path: "/Users/test/.agents/skills",
          label: "Agent global skills",
          exists: false,
        },
      ],
      skills: [
        {
          name: "tdd",
          description:
            "Test-driven development workflow with a deliberately long description that should wrap without overlapping the action buttons or preview panel.",
          path: "/Users/test/.codex/skills/tdd/SKILL.md",
          directory: "/Users/test/.codex/skills/tdd",
          source: "Codex global skills",
          enabled: true,
          configured: true,
          size: 2048,
        },
        {
          name: "triage",
          description: "Issue triage workflow.",
          path: "/Users/test/.codex/skills/triage/SKILL.md",
          directory: "/Users/test/.codex/skills/triage",
          source: "Codex global skills",
          enabled: false,
          configured: false,
          size: 1024,
        },
      ],
    },
    ...overrides,
  });
}

describe("App shell", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("renders the control-center shell with status summary and primary tabs", async () => {
    invokeMock.mockResolvedValueOnce(appState());

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Codex 配置" })).toBeVisible();
    expect(screen.getByText(/管理本机 Codex 配置/)).toBeVisible();
    expect(screen.getByRole("button", { name: "刷新" })).toBeVisible();
    expect(screen.getAllByText("codex 1.2.3").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(document.title).toBe("codex-config /opt/homebrew/bin/codex codex 1.2.3");
    });
    expect(screen.getByRole("tab", { name: "Codex 配置" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Sessions" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "MCP Servers" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Skills" })).toBeVisible();
  });

  it("switches between the primary workspaces from the tab bar", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce(appState());

    render(<App />);

    expect(await screen.findByRole("heading", { name: "全局配置" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Sessions" }));
    expect(screen.getByRole("tab", { name: "Sessions", selected: true })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Codex sessions" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "MCP Servers" }));
    expect(screen.getByRole("tab", { name: "MCP Servers", selected: true })).toBeVisible();
    expect(screen.getByRole("heading", { name: "MCP servers" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.getByRole("tab", { name: "Skills", selected: true })).toBeVisible();
    expect(screen.getByRole("heading", { name: "全局 Skills" })).toBeVisible();
  });

  it("shows a destructive alert when the app state cannot load", async () => {
    invokeMock.mockRejectedValueOnce("config.toml parse failed");

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("config.toml parse failed");
  });

  it("disables the refresh action while the app state is reloading", async () => {
    const user = userEvent.setup();
    let resolveRefresh: (value: unknown) => void = () => {};
    invokeMock
      .mockResolvedValueOnce(appState())
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveRefresh = resolve;
      }));

    render(<App />);

    const refreshButton = await screen.findByRole("button", { name: "刷新" });

    await user.click(refreshButton);

    expect(screen.getByRole("button", { name: "刷新中" })).toBeDisabled();

    resolveRefresh(appState({
      health: {
        ...appState().health,
        schemaVersion: "2026-06-09",
      },
    }));

    expect(await screen.findByRole("button", { name: "刷新" })).toBeEnabled();
    expect(screen.getByText("2026-06-09")).toBeVisible();
  });
});

describe("Config workbench", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows global and profile settings with field metadata and write gating", async () => {
    invokeMock.mockResolvedValueOnce(appState());

    render(<App />);

    expect(await screen.findByRole("heading", { name: "开启 Fast 模式" })).toBeVisible();
    expect(screen.getByText("正在编辑 active profile：work")).toBeVisible();
    expect(screen.getByText("当前 profile 覆盖了全局配置")).toBeVisible();

    const globalSettings = screen.getByRole("region", { name: "全局配置" });
    expect(globalSettings).toHaveTextContent("Model");
    expect(globalSettings).toHaveTextContent("model");
    expect(globalSettings).toHaveTextContent("当前值");
    expect(globalSettings).toHaveTextContent("gpt-5");
    expect(globalSettings).toHaveTextContent("caution");
    expect(globalSettings).toHaveTextContent("dangerous");
    expect(globalSettings).toHaveTextContent("secret");
    expect(globalSettings).toHaveTextContent("继承 / 未设置");

    expect(screen.getByRole("button", { name: "预览全局配置" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存全局配置" })).toBeDisabled();
  });

  it("keeps global settings save gated behind a successful preview", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockResolvedValueOnce(appState())
      .mockResolvedValueOnce({
        changed: true,
        fieldDiffs: [
          {
            scope: "root",
            path: "model",
            label: "Model",
            before: "gpt-5",
            after: "gpt-5-mini",
          },
        ],
        textDiff: "-model = \"gpt-5\"\n+model = \"gpt-5-mini\"",
        candidateRawToml: "model = \"gpt-5-mini\"",
      });

    render(<App />);

    const globalSettings = await screen.findByRole("region", { name: "全局配置" });
    const modelInput = within(globalSettings).getByLabelText("Model");
    await user.clear(modelInput);
    await user.type(modelInput, "gpt-5-mini");

    expect(screen.getByRole("button", { name: "预览全局配置" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "保存全局配置" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "预览全局配置" }));

    expect(await screen.findByText("改为")).toBeVisible();
    expect(screen.getByRole("button", { name: "保存全局配置" })).toBeEnabled();
  });

  it("keeps config write actions disabled when the config is read-only", async () => {
    invokeMock.mockResolvedValueOnce(appState({
      writable: false,
      readonlyReason: "config.toml is not writable",
      health: {
        ...appState().health,
        status: "readOnly",
      },
    }));

    render(<App />);

    expect(await screen.findByText("只读")).toBeVisible();
    expect(screen.getByText("config.toml is not writable")).toBeVisible();
    expect(screen.getByRole("button", { name: "预览全局配置" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存全局配置" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "预览 Fast 模式" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存 Fast 模式" })).toBeDisabled();
  });
});

describe("Field catalog", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("filters schema fields and shows metadata with an empty result state", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce(appState());

    render(<App />);

    const catalog = await screen.findByRole("region", { name: "字段目录" });
    const search = within(catalog).getByRole("searchbox", { name: "搜索字段目录" });

    expect(catalog).toHaveTextContent("4 个字段");
    expect(catalog).toHaveTextContent("Fast mode");
    expect(catalog).toHaveTextContent("dangerous");
    expect(catalog).toHaveTextContent("secret");
    expect(catalog).toHaveTextContent("experimental");
    expect(catalog).toHaveTextContent("read-only");

    await user.type(search, "secret");

    expect(catalog).toHaveTextContent("1 / 4 个字段");
    expect(catalog).toHaveTextContent("Provider env key");
    expect(catalog).not.toHaveTextContent("Fast mode");

    await user.clear(search);
    await user.type(search, "no-such-field");

    expect(catalog).toHaveTextContent("没有匹配的 schema 字段。");
  });

  it("exposes the catalog search as a keyboard-focusable searchbox", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce(appState());

    render(<App />);

    const catalog = await screen.findByRole("region", { name: "字段目录" });
    const search = within(catalog).getByRole("searchbox", { name: "搜索字段目录" });

    await user.click(search);

    expect(search).toHaveFocus();
  });
});

describe("Preview, raw TOML, and backups", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows diff and raw TOML surfaces with parse errors near the editor", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockResolvedValueOnce(appState({
        parseIssue: {
          message: "TOML parse error at line 2",
        },
      }))
      .mockResolvedValueOnce({
        changed: true,
        fieldDiffs: [
          {
            scope: "root",
            path: "model",
            label: "Model",
            before: "gpt-5",
            after: "gpt-5-mini",
          },
        ],
        textDiff: "-model = \"gpt-5\"\n+model = \"gpt-5-mini\"",
        candidateRawToml: "model = \"gpt-5-mini\"",
      });

    render(<App />);

    const preview = await screen.findByRole("region", { name: "变更预览" });
    const rawToml = screen.getByRole("region", { name: "高级 TOML 编辑" });

    expect(preview).toHaveTextContent("预览后会在这里显示 TOML diff。");
    expect(within(rawToml).getByRole("alert")).toHaveTextContent("TOML parse error at line 2");

    const editor = within(rawToml).getByRole("textbox", { name: "原始 TOML" });
    await user.clear(editor);
    await user.type(editor, "model = \"gpt-5-mini\"");

    expect(within(rawToml).getByRole("button", { name: "预览原始 TOML" })).toBeEnabled();
    expect(within(rawToml).getByRole("button", { name: "保存原始 TOML" })).toBeDisabled();

    await user.click(within(rawToml).getByRole("button", { name: "预览原始 TOML" }));

    expect(await within(preview).findByText("Model")).toBeVisible();
    expect(within(preview).getByText("改为")).toBeVisible();
    expect(within(rawToml).getByRole("button", { name: "保存原始 TOML" })).toBeEnabled();
  });

  it("shows backup history as a quiet list and disables restore when read-only", async () => {
    invokeMock.mockResolvedValueOnce(appState({
      writable: false,
      readonlyReason: "config.toml is not writable",
      health: {
        ...appState().health,
        status: "readOnly",
      },
      backups: [
        {
          id: "2026-06-08T10-00-00-config.toml.bak",
          path: "/Users/test/.codex/backups/2026-06-08T10-00-00-config.toml.bak",
          size: 2048,
          modifiedMs: 1780893900000,
        },
      ],
    }));

    render(<App />);

    const backups = await screen.findByRole("region", { name: "备份" });

    expect(backups).toHaveTextContent("~/backups");
    expect(backups).toHaveTextContent("2026-06-08T10-00-00-config.toml.bak");
    expect(backups).toHaveTextContent("2.0 KB");
    expect(within(backups).getByRole("button", { name: "恢复备份 2026-06-08T10-00-00-config.toml.bak" })).toBeDisabled();
  });
});

describe("Model provider editor", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows provider metadata and keeps save gated behind a preview", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockResolvedValueOnce(appStateWithModelProviders())
      .mockResolvedValueOnce({
        changed: true,
        fieldDiffs: [],
        textDiff: "-base_url = \"https://models.example.test/v1/a/very/long/provider/path/that/should/wrap\"\n+base_url = \"https://models.example.test/v1/updated\"",
        candidateRawToml: "[model_providers.local-gpt]",
      });

    render(<App />);

    const providers = await screen.findByRole("region", { name: "Model providers" });
    expect(providers).toHaveTextContent("2 providers");
    expect(providers).toHaveTextContent("Local GPT");
    expect(providers).toHaveTextContent("local-gpt");
    expect(providers).toHaveTextContent("LOCAL_GPT_KEY");
    expect(providers).toHaveTextContent("advanced fields");
    expect(providers).toHaveTextContent("built-in");
    expect(within(providers).getByRole("button", { name: "新建 model provider" })).toBeVisible();

    await user.click(within(providers).getByRole("button", { name: "选择 provider Local GPT" }));
    const baseUrlInput = within(providers).getByLabelText("Base URL");

    await user.clear(baseUrlInput);
    await user.type(baseUrlInput, "https://models.example.test/v1/updated");

    expect(within(providers).getByRole("button", { name: "预览保存 provider local-gpt" })).toBeEnabled();
    expect(within(providers).getByRole("button", { name: "保存 provider local-gpt" })).toBeDisabled();

    await user.click(within(providers).getByRole("button", { name: "预览保存 provider local-gpt" }));

    expect(await screen.findByText(/updated/)).toBeVisible();
    expect(within(providers).getByRole("button", { name: "保存 provider local-gpt" })).toBeEnabled();
  });

  it("keeps provider deletion behind preview and disables reserved provider deletion", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockResolvedValueOnce(appStateWithModelProviders())
      .mockResolvedValueOnce({
        changed: true,
        fieldDiffs: [],
        textDiff: "-[model_providers.local-gpt]",
        candidateRawToml: "model = \"gpt-5\"",
      })
      .mockResolvedValueOnce({
        changed: true,
        backupPath: "/Users/test/.codex/backups/config.toml.bak",
        state: appStateWithModelProviders({
          modelProviders: {
            reservedIds: ["openai", "azure", "ollama", "lmstudio"],
            providers: [],
          },
        }),
      });

    render(<App />);

    const providers = await screen.findByRole("region", { name: "Model providers" });
    expect(within(providers).getByRole("button", { name: "预览删除 provider openai" })).toBeDisabled();
    expect(within(providers).getByRole("button", { name: "确认删除 provider openai" })).toBeDisabled();

    await user.click(within(providers).getByRole("button", { name: "预览删除 provider local-gpt" }));

    expect(invokeMock).toHaveBeenCalledWith("preview_delete_model_provider", {
      id: "local-gpt",
    });
    expect(within(providers).getByRole("button", { name: "确认删除 provider local-gpt" })).toBeEnabled();

    await user.click(within(providers).getByRole("button", { name: "确认删除 provider local-gpt" }));

    expect(invokeMock).toHaveBeenCalledWith("delete_model_provider", {
      id: "local-gpt",
      fileToken: null,
    });
    expect(await screen.findByText(/已删除 model provider/)).toBeVisible();
  });
});

describe("MCP server editor", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows server metadata and keeps save gated behind a preview", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockResolvedValueOnce(appStateWithMcpServers())
      .mockResolvedValueOnce({
        changed: true,
        fieldDiffs: [],
        textDiff: "-command = \"npx\"\n+command = \"uvx\"",
        candidateRawToml: "[mcp_servers.filesystem]",
      });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "MCP Servers" }));

    const servers = screen.getByRole("region", { name: "MCP servers" });
    expect(servers).toHaveTextContent("2 servers");
    expect(servers).toHaveTextContent("filesystem");
    expect(servers).toHaveTextContent("@modelcontextprotocol/server-filesystem");
    expect(servers).toHaveTextContent("MCP_FILESYSTEM_ROOT");
    expect(servers).toHaveTextContent("enabled");
    expect(servers).toHaveTextContent("disabled");
    expect(servers).toHaveTextContent("advanced fields");
    expect(within(servers).getByRole("button", { name: "新建 MCP server" })).toBeVisible();

    await user.click(within(servers).getByRole("button", { name: "选择 MCP server filesystem" }));
    const commandInput = within(servers).getByLabelText("Command");

    await user.clear(commandInput);
    await user.type(commandInput, "uvx");

    expect(within(servers).getByRole("button", { name: "预览保存 MCP server filesystem" })).toBeEnabled();
    expect(within(servers).getByRole("button", { name: "保存 MCP server filesystem" })).toBeDisabled();

    await user.click(within(servers).getByRole("button", { name: "预览保存 MCP server filesystem" }));

    expect(await screen.findByText(/uvx/)).toBeVisible();
    expect(within(servers).getByRole("button", { name: "保存 MCP server filesystem" })).toBeEnabled();
  });

  it("keeps server deletion behind preview confirmation", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockResolvedValueOnce(appStateWithMcpServers())
      .mockResolvedValueOnce({
        changed: true,
        fieldDiffs: [],
        textDiff: "-[mcp_servers.filesystem]",
        candidateRawToml: "model = \"gpt-5\"",
      })
      .mockResolvedValueOnce({
        changed: true,
        backupPath: "/Users/test/.codex/backups/config.toml.bak",
        state: appStateWithMcpServers({
          mcpServers: {
            servers: [],
          },
        }),
      });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "MCP Servers" }));

    const servers = screen.getByRole("region", { name: "MCP servers" });
    expect(within(servers).getByRole("button", { name: "确认删除 MCP server filesystem" })).toBeDisabled();

    await user.click(within(servers).getByRole("button", { name: "预览删除 MCP server filesystem" }));

    expect(invokeMock).toHaveBeenCalledWith("preview_delete_mcp_server", {
      id: "filesystem",
    });
    expect(within(servers).getByRole("button", { name: "确认删除 MCP server filesystem" })).toBeEnabled();

    await user.click(within(servers).getByRole("button", { name: "确认删除 MCP server filesystem" }));

    expect(invokeMock).toHaveBeenCalledWith("delete_mcp_server", {
      id: "filesystem",
      fileToken: null,
    });
    expect(await screen.findByText(/已删除 MCP server/)).toBeVisible();
  });
});

describe("Skills workspace", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows skill roots, filters skills, and previews markdown content", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockResolvedValueOnce(appStateWithSkills())
      .mockResolvedValueOnce({
        name: "tdd",
        description: "Test-driven development workflow.",
        path: "/Users/test/.codex/skills/tdd/SKILL.md",
        rawMarkdown: "---\nname: tdd\n---\n# Test-driven development\nUse red-green-refactor.",
      });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Skills" }));

    const skills = screen.getByRole("region", { name: "全局 Skills" });
    expect(skills).toHaveTextContent("Codex global skills");
    expect(skills).toHaveTextContent("~/skills");
    expect(skills).toHaveTextContent("Agent global skills");
    expect(skills).toHaveTextContent("未找到");
    expect(skills).toHaveTextContent("2 skills");
    expect(skills).toHaveTextContent("enabled");
    expect(skills).toHaveTextContent("disabled");
    expect(skills).toHaveTextContent("configured");

    const search = within(skills).getByRole("searchbox", { name: "搜索全局 skills" });
    await user.type(search, "triage");

    expect(skills).toHaveTextContent("1 / 2 skills");
    expect(skills).toHaveTextContent("triage");
    expect(skills).not.toHaveTextContent("Test-driven development workflow");

    await user.clear(search);
    await user.click(within(skills).getByRole("button", { name: "查看 skill tdd" }));

    expect(invokeMock).toHaveBeenCalledWith("read_skill_content", {
      path: "/Users/test/.codex/skills/tdd/SKILL.md",
    });
    expect(await within(skills).findByText(/red-green-refactor/)).toBeVisible();
  });

  it("saves skill enablement with explicit action labels", async () => {
    const user = userEvent.setup();
    const initialState = appStateWithSkills();
    const nextState = appStateWithSkills();
    nextState.skills.skills[0]!.enabled = false;

    invokeMock
      .mockResolvedValueOnce(initialState)
      .mockResolvedValueOnce({
        changed: true,
        backupPath: "/Users/test/.codex/backups/config.toml.bak",
        state: nextState,
      });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Skills" }));

    const skills = screen.getByRole("region", { name: "全局 Skills" });
    const skillSwitch = within(skills).getByRole("switch", { name: "停用 skill tdd" });
    expect(skillSwitch).toBeChecked();

    await user.click(skillSwitch);

    expect(invokeMock).toHaveBeenCalledWith("save_skill_enabled", {
      path: "/Users/test/.codex/skills/tdd/SKILL.md",
      enabled: false,
      fileToken: null,
    });
    expect(await screen.findByText("已停用 skill。重启 Codex 后生效。")).toBeVisible();
  });
});

describe("Sessions workspace", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows sessions grouped by year and month with metadata and parse errors", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce(appState());

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Sessions" }));

    const sessions = screen.getByRole("region", { name: "Codex sessions" });
    expect(sessions).toHaveTextContent("~/sessions");
    expect(sessions).toHaveTextContent("会话数量");
    expect(sessions).toHaveTextContent("3");
    expect(sessions).toHaveTextContent("3.0 KB");

    expect(within(sessions).getByRole("tab", { name: /2026/ })).toHaveAttribute("aria-selected", "true");
    expect(within(sessions).getByRole("tab", { name: /2025/ })).toBeVisible();
    expect(within(sessions).getByRole("button", { name: /06 月/ })).toHaveAttribute("aria-expanded", "true");
    expect(sessions).toHaveTextContent("Refactor config UI");
    expect(sessions).toHaveTextContent("3 user / 8 messages");
    expect(sessions).toHaveTextContent("codex 1.2.3");
    expect(sessions).toHaveTextContent("openai");
    expect(sessions).toHaveTextContent("Unexpected JSON token at line 2");
    expect(within(sessions).getByRole("button", { name: "预览删除 Refactor config UI" })).toBeVisible();
  });

  it("keeps session deletion gated behind a second confirmation click", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockResolvedValueOnce(appState())
      .mockResolvedValueOnce(appState({
        codexSessions: {
          sessionsDir: "/Users/test/.codex/sessions",
          sessions: [],
        },
      }));

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Sessions" }));

    await user.click(screen.getByRole("button", { name: "预览删除 Refactor config UI" }));
    expect(screen.getByText("再次点击删除会删除这个 Codex 会话 .jsonl 文件。")).toBeVisible();
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "确认删除 Refactor config UI" }));

    expect(invokeMock).toHaveBeenCalledWith("delete_session", {
      id: "2026/06/08/rollout-2026-06-08T10-00-00-alpha.jsonl",
    });
    expect(await screen.findByText("已删除 Codex session 文件。")).toBeVisible();
  });

  it("shows a quiet empty state when there are no sessions", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce(appState({
      codexSessions: {
        sessionsDir: "/Users/test/.codex/sessions",
        sessions: [],
      },
    }));

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Sessions" }));

    const sessions = screen.getByRole("region", { name: "Codex sessions" });
    expect(sessions).toHaveTextContent("当前 Codex Home 下没有 session 记录。");
    expect(sessions).toHaveTextContent("会话数量");
    expect(sessions).toHaveTextContent("0");
  });
});
