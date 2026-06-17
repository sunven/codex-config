import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { AppState } from "./appState";

const invokeMock = vi.hoisted(() => vi.fn());
const openMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openMock,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setTitle: vi.fn(),
  }),
}));

function appState(overrides: Partial<AppState> = {}): AppState {
  return {
    homeDir: "/Users/test/.codex",
    configPath: "/Users/test/.codex/config.toml",
    resolvedPath: "/Users/test/.codex/config.toml",
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
    preferences: {},
    ...overrides,
  };
}

function appStateWithModelProviders(overrides: Partial<AppState> = {}): AppState {
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

function appStateWithMcpServers(overrides: Partial<AppState> = {}): AppState {
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

function appStateWithSkills(overrides: Partial<AppState> = {}): AppState {
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
          symlink: false,
          targetDirectory: undefined,
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
          symlink: false,
          targetDirectory: undefined,
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
    openMock.mockReset();
  });

  it("renders the control-center shell with primary tabs", async () => {
    invokeMock.mockResolvedValueOnce(appState());

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Codex 配置" })).toBeVisible();
    expect(screen.queryByText(/管理本机 Codex 配置/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新" })).toBeVisible();
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

    resolveRefresh(appState());

    expect(await screen.findByRole("button", { name: "刷新" })).toBeEnabled();
  });
});

describe("Config workbench", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows global settings with field metadata and write gating", async () => {
    invokeMock.mockResolvedValueOnce(appState());

    render(<App />);

    expect(await screen.findByRole("heading", { name: "全局配置" })).toBeVisible();

    const globalSettings = screen.getByRole("region", { name: "全局配置" });
    expect(globalSettings).toHaveTextContent("Model");
    expect(globalSettings).toHaveTextContent("model");
    expect(globalSettings).toHaveTextContent("当前值");
    expect(globalSettings).toHaveTextContent("gpt-5");
    expect(globalSettings).toHaveTextContent("caution");
    expect(globalSettings).toHaveTextContent("dangerous");
    expect(globalSettings).toHaveTextContent("secret");
    expect(globalSettings).toHaveTextContent("继承 / 未设置");

    expect(screen.getByRole("button", { name: "保存全局配置" })).toBeDisabled();
  });

  it("saves global settings directly without requiring a preview", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockResolvedValueOnce(appState())
      .mockResolvedValueOnce({
        changed: true,
        state: appState({
          fields: appState().fields.map((field) =>
            field.path === "model" ? { ...field, value: "gpt-5-mini" } : field,
          ),
          rawToml: "model = \"gpt-5-mini\"",
        }),
      });

    render(<App />);

    const globalSettings = await screen.findByRole("region", { name: "全局配置" });
    const modelInput = within(globalSettings).getByLabelText("Model");
    await user.clear(modelInput);
    await user.type(modelInput, "gpt-5-mini");

    expect(screen.getByRole("button", { name: "保存全局配置" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "保存全局配置" }));

    expect(invokeMock).toHaveBeenCalledWith("save_changes", {
      changes: [{ path: "model", scope: "root", action: "set", value: "gpt-5-mini" }],
      fileToken: null,
    });
    expect(await screen.findByText("已保存。")).toBeVisible();
  });

  it("saves select field changes only when the save button is clicked", async () => {
    const user = userEvent.setup();
    const reasoningField = {
      path: "model_reasoning_effort",
      label: "Reasoning effort",
      group: "Model",
      kind: "select" as const,
      value: "medium",
      editable: true,
      risk: "normal" as const,
      options: ["low", "medium", "high"],
    };
    const initialState = appState({
      fields: [...appState().fields, reasoningField],
      rawToml: "model_reasoning_effort = \"medium\"",
    });
    const savedState = appState({
      fields: [
        ...appState().fields,
        {
          ...reasoningField,
          value: "high",
        },
      ],
      rawToml: "model_reasoning_effort = \"high\"",
    });
    invokeMock
      .mockResolvedValueOnce(initialState)
      .mockResolvedValueOnce({
        changed: true,
        state: savedState,
      })
      .mockResolvedValueOnce(savedState);

    render(<App />);

    const globalSettings = await screen.findByRole("region", { name: "全局配置" });

    await user.selectOptions(within(globalSettings).getByLabelText("Reasoning effort"), "high");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "保存全局配置" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "保存全局配置" }));
    await screen.findByText("已保存。");
    await user.click(screen.getByRole("button", { name: "刷新" }));

    expect(invokeMock).toHaveBeenCalledWith("save_changes", {
      changes: [
        {
          path: "model_reasoning_effort",
          scope: "root",
          action: "set",
          value: "high",
        },
      ],
      fileToken: null,
    });
    expect(within(globalSettings).getByDisplayValue("high")).toBeVisible();
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

    expect(await screen.findByRole("button", { name: "保存全局配置" })).toBeDisabled();
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

describe("Raw TOML", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows parse errors near the editor and saves raw TOML directly", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockResolvedValueOnce(appState({
        parseIssue: {
          message: "TOML parse error at line 2",
        },
      }))
      .mockResolvedValueOnce({
        changed: true,
        state: appState({
          rawToml: "model = \"gpt-5-mini\"",
        }),
      });

    render(<App />);

    const rawToml = await screen.findByRole("region", { name: "高级 TOML 编辑" });

    expect(within(rawToml).getByRole("alert")).toHaveTextContent("TOML parse error at line 2");

    const editor = within(rawToml).getByRole("textbox", { name: "原始 TOML" });
    await user.clear(editor);
    await user.type(editor, "model = \"gpt-5-mini\"");

    expect(within(rawToml).getByRole("button", { name: "保存原始 TOML" })).toBeEnabled();

    await user.click(within(rawToml).getByRole("button", { name: "保存原始 TOML" }));

    expect(invokeMock).toHaveBeenCalledWith("save_raw_toml", {
      rawToml: "model = \"gpt-5-mini\"",
      fileToken: null,
    });
    expect(await screen.findByText("已保存原始 TOML。")).toBeVisible();
  });
});

describe("Model provider editor", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows provider metadata and saves provider changes directly", async () => {
    const user = userEvent.setup();
    const baseState = appStateWithModelProviders();
    invokeMock
      .mockResolvedValueOnce(appStateWithModelProviders())
      .mockResolvedValueOnce({
        changed: true,
        state: appStateWithModelProviders({
          modelProviders: {
            reservedIds: ["openai", "azure", "ollama", "lmstudio"],
            providers: [
              {
                ...baseState.modelProviders.providers[0]!,
                baseUrl: "https://models.example.test/v1/updated",
              },
              baseState.modelProviders.providers[1],
            ],
          },
        }),
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

    await user.click(within(providers).getByRole("button", { name: "保存 provider local-gpt" }));

    expect(invokeMock).toHaveBeenCalledWith("save_model_provider", {
      draft: expect.objectContaining({
        id: "local-gpt",
        baseUrl: "https://models.example.test/v1/updated",
      }),
      fileToken: null,
    });
    expect(await screen.findByText(/已保存 model provider/)).toBeVisible();
  });

  it("deletes providers directly and disables reserved provider deletion", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockResolvedValueOnce(appStateWithModelProviders())
      .mockResolvedValueOnce({
        changed: true,
        state: appStateWithModelProviders({
          modelProviders: {
            reservedIds: ["openai", "azure", "ollama", "lmstudio"],
            providers: [],
          },
        }),
      });

    render(<App />);

    const providers = await screen.findByRole("region", { name: "Model providers" });
    expect(within(providers).getByRole("button", { name: "删除 provider openai" })).toBeDisabled();

    await user.click(within(providers).getByRole("button", { name: "删除 provider local-gpt" }));

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

  it("shows server metadata and saves server changes directly", async () => {
    const user = userEvent.setup();
    const baseState = appStateWithMcpServers();
    invokeMock
      .mockResolvedValueOnce(appStateWithMcpServers())
      .mockResolvedValueOnce({
        changed: true,
        state: appStateWithMcpServers({
          mcpServers: {
            servers: [
              {
                ...baseState.mcpServers.servers[0]!,
                command: "uvx",
              },
              baseState.mcpServers.servers[1],
            ],
          },
        }),
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

    await user.click(within(servers).getByRole("button", { name: "保存 MCP server filesystem" }));

    expect(invokeMock).toHaveBeenCalledWith("save_mcp_server", {
      draft: expect.objectContaining({
        id: "filesystem",
        command: "uvx",
      }),
      fileToken: null,
    });
    expect(await screen.findByText(/已保存 MCP server/)).toBeVisible();
  });

  it("deletes servers directly", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockResolvedValueOnce(appStateWithMcpServers())
      .mockResolvedValueOnce({
        changed: true,
        state: appStateWithMcpServers({
          mcpServers: {
            servers: [],
          },
        }),
      });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "MCP Servers" }));

    const servers = screen.getByRole("region", { name: "MCP servers" });

    await user.click(within(servers).getByRole("button", { name: "删除 MCP server filesystem" }));

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
    expect(skills).toHaveTextContent("2.0 KB");
    expect(skills).not.toHaveTextContent("Codex global skills · configured");
    expect(skills).not.toHaveTextContent(
      "Test-driven development workflow with a deliberately long description",
    );
    expect(within(skills).getByRole("switch", { name: "停用 skill tdd" })).toBeChecked();
    expect(within(skills).getByRole("switch", { name: "启用 skill triage" })).not.toBeChecked();

    const search = within(skills).getByRole("searchbox", { name: "搜索全局 skills" });
    await user.type(search, "triage");

    expect(skills).toHaveTextContent("1 / 2 skills");
    expect(skills).toHaveTextContent("triage");
    expect(skills).not.toHaveTextContent("Test-driven development workflow");

    await user.clear(search);
    expect(within(skills).queryByRole("button", { name: "查看 skill tdd" })).not.toBeInTheDocument();
    await user.click(within(skills).getByRole("button", { name: "选择 skill tdd" }));

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

  it("imports a skill directory into Agent global skills", async () => {
    const user = userEvent.setup();
    const initialState = appStateWithSkills();
    const nextState = appStateWithSkills({
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
            exists: true,
          },
        ],
        skills: [
          {
            name: "imported",
            description: "Imported skill description.",
            path: "/Users/test/.agents/skills/imported/SKILL.md",
            directory: "/Users/test/.agents/skills/imported",
            symlink: true,
            targetDirectory: "/Users/test/skills/imported",
            source: "Agent global skills",
            enabled: true,
            configured: false,
            size: 4096,
          },
        ],
      },
    });

    openMock.mockResolvedValueOnce("/Users/test/skills/imported");
    invokeMock
      .mockResolvedValueOnce(initialState)
      .mockResolvedValueOnce({
        changed: true,
        state: nextState,
      });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Skills" }));

    const skills = screen.getByRole("region", { name: "全局 Skills" });
    expect(within(skills).getByRole("button", { name: "新增 skill" })).toBeVisible();

    await user.click(within(skills).getByRole("button", { name: "新增 skill" }));

    expect(openMock).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "选择 skill 目录",
    });
    expect(invokeMock).toHaveBeenCalledWith("import_skill_directory", {
      directory: "/Users/test/skills/imported",
    });
    expect(await screen.findByText(/已导入 skill。/)).toBeVisible();
    expect(skills).toHaveTextContent("1 skills");
    expect(skills).toHaveTextContent("软链");
    expect(skills).toHaveTextContent("原始位置：/Users/test/skills/imported");
    expect(within(skills).getByText("软链")).toBeVisible();
    expect(within(skills).getAllByText("原始位置：/Users/test/skills/imported").length).toBeGreaterThan(
      0,
    );
    expect(within(skills).getByRole("button", { name: "选择 skill imported" })).toBeVisible();
    expect(within(skills).getByRole("heading", { name: "imported" })).toBeVisible();
    expect(within(skills).getByText("/Users/test/.agents/skills/imported")).toBeVisible();
  });

  it("does not import when the skill directory picker is canceled", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValueOnce(null);
    invokeMock.mockResolvedValueOnce(appStateWithSkills());

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Skills" }));

    const skills = screen.getByRole("region", { name: "全局 Skills" });
    await user.click(within(skills).getByRole("button", { name: "新增 skill" }));

    expect(openMock).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "选择 skill 目录",
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).not.toHaveBeenCalledWith("import_skill_directory", expect.anything());
    expect(skills).toHaveTextContent("2 skills");
  });

  it("shows import failures without clearing the current skills list", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValueOnce("/Users/test/skills/broken");
    invokeMock
      .mockResolvedValueOnce(appStateWithSkills())
      .mockRejectedValueOnce("Agent global skills root is not discoverable");

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Skills" }));

    const skills = screen.getByRole("region", { name: "全局 Skills" });
    await user.click(within(skills).getByRole("button", { name: "新增 skill" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Agent global skills root is not discoverable",
    );
    expect(skills).toHaveTextContent("2 skills");
    expect(within(skills).getByRole("button", { name: "选择 skill tdd" })).toBeVisible();
  });

  it("disables skill import when the app is not writable", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce(
      appStateWithSkills({
        writable: false,
        readonlyReason: "config.toml 语法有误。",
      }),
    );

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Skills" }));

    expect(
      within(screen.getByRole("region", { name: "全局 Skills" })).getByRole("button", {
        name: "新增 skill",
      }),
    ).toBeDisabled();
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
