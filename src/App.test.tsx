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

async function findSectionByHeading(name: string | RegExp) {
  const heading = await screen.findByRole("heading", { name });
  const section = heading.closest("section");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

function cardByText(container: HTMLElement, text: string | RegExp) {
  const element = within(container).getByText(text);
  const card = element.closest("div[class*='bg-[var(--muted)]'], div[class*='bg-[#eff6ff]'], div[class*='bg-[#f0fdf4]']");
  expect(card).not.toBeNull();
  return card as HTMLElement;
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
    expect(screen.getByRole("button", { name: "Codex 配置" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sessions" })).toBeVisible();
    expect(screen.getByRole("button", { name: "MCP Servers" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Skills" })).toBeVisible();
  });

  it("shows a loading skeleton before the initial state resolves", async () => {
    let resolveState: (value: AppState) => void = () => {};
    invokeMock.mockReturnValueOnce(
      new Promise<AppState>((resolve) => {
        resolveState = resolve;
      }),
    );

    render(<App />);

    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();

    resolveState(appState());

    expect(await screen.findByRole("heading", { name: "全局配置" })).toBeVisible();
    expect(document.querySelector(".animate-pulse")).not.toBeInTheDocument();
  });

  it("switches between the primary workspaces from the tab bar", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce(appState());

    render(<App />);

    expect(await screen.findByRole("heading", { name: "全局配置" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.getByRole("heading", { name: "Codex sessions" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "MCP Servers" }));
    expect(screen.getByRole("heading", { name: "MCP servers" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Skills" }));
    expect(screen.getByRole("heading", { name: "全局 Skills" })).toBeVisible();
  });

  it("shows a destructive alert when the app state cannot load", async () => {
    invokeMock.mockRejectedValueOnce("config.toml parse failed");

    render(<App />);

    expect(await screen.findByText("config.toml parse failed")).toBeVisible();
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

    const globalSettings = await findSectionByHeading("全局配置");
    expect(globalSettings).toHaveTextContent("Model");
    expect(globalSettings).toHaveTextContent("model");
    expect(screen.getByDisplayValue("gpt-5")).toBeVisible();
    expect(globalSettings).toHaveTextContent("Approval policy");
    expect(globalSettings).toHaveTextContent("Shell environment policy");
    expect(screen.getByRole("combobox", { name: "Approval policy" })).toBeVisible();

    expect(within(globalSettings).getByRole("button", { name: "保存到 config.toml" })).toBeDisabled();
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

    const globalSettings = await findSectionByHeading("全局配置");
    const modelInput = within(globalSettings).getByLabelText("Model");
    await user.clear(modelInput);
    await user.type(modelInput, "gpt-5-mini");

    expect(within(globalSettings).getByRole("button", { name: "保存到 config.toml" })).toBeEnabled();

    await user.click(within(globalSettings).getByRole("button", { name: "保存到 config.toml" }));

    expect(invokeMock).toHaveBeenCalledWith("save_changes", {
      changes: [{ path: "model", action: "set", value: "gpt-5-mini" }],
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

    const globalSettings = await findSectionByHeading("全局配置");

    await user.selectOptions(within(globalSettings).getByLabelText("Reasoning effort"), "high");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(within(globalSettings).getByRole("button", { name: "保存到 config.toml" })).toBeEnabled();

    await user.click(within(globalSettings).getByRole("button", { name: "保存到 config.toml" }));
    await screen.findByText("已保存。");
    await user.click(screen.getByRole("button", { name: "刷新" }));

    expect(invokeMock).toHaveBeenCalledWith("save_changes", {
      changes: [
        {
          path: "model_reasoning_effort",
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

    const globalSettings = await findSectionByHeading("全局配置");
    expect(within(globalSettings).getByRole("button", { name: "保存到 config.toml" })).toBeDisabled();
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

    const rawToml = await findSectionByHeading("高级 TOML 编辑");

    expect(within(rawToml).getByText("TOML parse error at line 2")).toBeVisible();

    const editor = rawToml.querySelector("#raw-toml-editor") as HTMLTextAreaElement;
    expect(editor).not.toBeNull();
    await user.clear(editor);
    await user.type(editor, "model = \"gpt-5-mini\"");

    expect(within(rawToml).getByRole("button", { name: "保存 TOML" })).toBeEnabled();

    await user.click(within(rawToml).getByRole("button", { name: "保存 TOML" }));

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

    const providers = await findSectionByHeading("Model providers");
    expect(providers).toHaveTextContent("2 providers");
    expect(providers).toHaveTextContent("Local GPT");
    expect(providers).toHaveTextContent("local-gpt");
    expect(providers).toHaveTextContent("LOCAL_GPT_KEY");
    expect(providers).toHaveTextContent("advanced fields");
    expect(providers).toHaveTextContent("built-in");
    expect(within(providers).getByRole("button", { name: "新建 provider" })).toBeVisible();

    await user.click(within(providers).getByText("Local GPT"));
    const baseUrlInput = within(providers).getByLabelText("Base URL");

    await user.clear(baseUrlInput);
    await user.type(baseUrlInput, "https://models.example.test/v1/updated");

    await user.click(within(providers).getByRole("button", { name: "保存 provider" }));

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

    const providers = await findSectionByHeading("Model providers");
    const localProvider = cardByText(providers, "Local GPT");
    const openaiProvider = cardByText(providers, "Built-in OpenAI");
    expect(within(openaiProvider).getByRole("button", { name: "删除" })).toBeDisabled();

    await user.click(within(localProvider).getByRole("button", { name: "删除" }));

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

    await user.click(await screen.findByRole("button", { name: "MCP Servers" }));

    const servers = await findSectionByHeading("MCP servers");
    expect(servers).toHaveTextContent("2 servers");
    expect(servers).toHaveTextContent("filesystem");
    expect(servers).toHaveTextContent("@modelcontextprotocol/server-filesystem");
    expect(servers).toHaveTextContent("MCP_FILESYSTEM_ROOT");
    expect(servers).toHaveTextContent("enabled");
    expect(servers).toHaveTextContent("disabled");
    expect(servers).toHaveTextContent("advanced fields");
    expect(within(servers).getByRole("button", { name: "新建 MCP server" })).toBeVisible();

    await user.click(within(servers).getByText("filesystem", { selector: "strong" }));
    const commandInput = within(servers).getByLabelText("Command");

    await user.clear(commandInput);
    await user.type(commandInput, "uvx");

    await user.click(within(servers).getByRole("button", { name: "保存 server" }));

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

    await user.click(await screen.findByRole("button", { name: "MCP Servers" }));

    const servers = await findSectionByHeading("MCP servers");
    const filesystemServer = cardByText(servers, "filesystem");

    await user.click(within(filesystemServer).getByRole("button", { name: "删除" }));

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

    await user.click(await screen.findByRole("button", { name: "Skills" }));

    const skills = await findSectionByHeading("全局 Skills");
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
    const skillSwitches = within(skills).getAllByRole("switch");
    expect(skillSwitches[0]).toBeChecked();
    expect(skillSwitches[1]).not.toBeChecked();

    const search = within(skills).getByRole("searchbox", { name: "搜索全局 skills" });
    await user.type(search, "triage");

    expect(skills).toHaveTextContent("1 / 2 skills");
    expect(skills).toHaveTextContent("triage");
    expect(skills).not.toHaveTextContent("Test-driven development workflow");

    await user.clear(search);
    expect(within(skills).queryByRole("button", { name: "查看 skill tdd" })).not.toBeInTheDocument();
    await user.click(within(skills).getByText("tdd", { selector: "strong" }));

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

    await user.click(await screen.findByRole("button", { name: "Skills" }));

    const skills = await findSectionByHeading("全局 Skills");
    const skillSwitch = within(skills).getAllByRole("switch")[0]!;
    expect(skillSwitch).toBeChecked();

    await user.click(skillSwitch);

    expect(invokeMock).toHaveBeenCalledWith("save_skill_enabled", {
      path: "/Users/test/.codex/skills/tdd/SKILL.md",
      enabled: false,
      fileToken: null,
    });
    expect(await screen.findByText("已停用 skill。重启 Codex 后生效。")).toBeVisible();
  });

  it("deletes a skill after an explicit confirmation click", async () => {
    const user = userEvent.setup();
    const initialState = appStateWithSkills();
    const nextState = appStateWithSkills({
      skills: {
        ...initialState.skills,
        skills: [initialState.skills.skills[1]!],
      },
    });

    invokeMock
      .mockResolvedValueOnce(initialState)
      .mockResolvedValueOnce({
        changed: true,
        state: nextState,
      });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Skills" }));

    const skills = await findSectionByHeading("全局 Skills");
    const tddCard = within(skills)
      .getByRole("button", { name: "删除 skill tdd" })
      .closest("div[class*='bg-[#eff6ff]']");
    expect(tddCard).not.toBeNull();

    await user.click(within(tddCard as HTMLElement).getByRole("button", { name: "删除 skill tdd" }));

    expect(screen.getByText("再次点击删除会移除这个 skill。")).toBeVisible();
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await user.click(
      within(tddCard as HTMLElement).getByRole("button", { name: "确认删除 skill tdd" }),
    );

    expect(invokeMock).toHaveBeenCalledWith("delete_skill", {
      path: "/Users/test/.codex/skills/tdd/SKILL.md",
      fileToken: null,
    });
    expect(await screen.findByText("已删除 skill。重启 Codex 或开启新会话后生效。")).toBeVisible();
    expect(skills).not.toHaveTextContent("tdd");
    expect(skills).toHaveTextContent("1 skills");
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
        refreshError: undefined,
        imported: [
          {
            name: "imported",
            sourceDirectory: "/Users/test/skills/imported",
            linkDirectory: "/Users/test/.agents/skills/imported",
            skillPath: "/Users/test/.agents/skills/imported/SKILL.md",
          },
        ],
        existing: [],
        skipped: [],
        conflicts: [],
      });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Skills" }));

    const skills = await findSectionByHeading("全局 Skills");
    expect(within(skills).getByRole("button", { name: "新增 skill" })).toBeVisible();

    await user.click(within(skills).getByRole("button", { name: "新增 skill" }));

    expect(openMock).toHaveBeenCalledWith({
      directory: true,
      multiple: true,
      title: "选择 skill 目录或父目录",
    });
    expect(invokeMock).toHaveBeenCalledWith("import_skill_directories", {
      directories: ["/Users/test/skills/imported"],
    });
    expect(await screen.findByText(/已导入 1 个 skills。/)).toBeVisible();
    expect(skills).toHaveTextContent("1 skills");
    expect(skills).toHaveTextContent("软链");
    expect(skills).toHaveTextContent("原始位置：/Users/test/skills/imported");
    expect(within(skills).getByText("软链")).toBeVisible();
    expect(within(skills).getAllByText("原始位置：/Users/test/skills/imported").length).toBeGreaterThan(
      0,
    );
    expect(within(skills).getByText("imported", { selector: "strong" })).toBeVisible();
    expect(within(skills).getByRole("heading", { name: "imported" })).toBeVisible();
    expect(within(skills).getByText("/Users/test/.agents/skills/imported")).toBeVisible();
  });

  it("imports multiple selected directories and shows mixed batch details", async () => {
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
            name: "alpha",
            path: "/Users/test/.agents/skills/alpha/SKILL.md",
            directory: "/Users/test/.agents/skills/alpha",
            symlink: true,
            targetDirectory: "/Users/test/skills/alpha",
            source: "Agent global skills",
            enabled: true,
            configured: false,
            size: 1024,
          },
          {
            name: "beta",
            path: "/Users/test/.agents/skills/beta/SKILL.md",
            directory: "/Users/test/.agents/skills/beta",
            symlink: true,
            targetDirectory: "/Users/test/skills/beta",
            source: "Agent global skills",
            enabled: true,
            configured: false,
            size: 1024,
          },
        ],
      },
    });
    openMock.mockResolvedValueOnce([
      "/Users/test/skills/alpha",
      "/Users/test/skills/beta",
      "/Users/test/skills/broken",
      "/Users/test/skills/conflict",
    ]);
    invokeMock
      .mockResolvedValueOnce(initialState)
      .mockResolvedValueOnce({
        changed: true,
        state: nextState,
        refreshError: undefined,
        imported: [
          {
            name: "alpha",
            sourceDirectory: "/Users/test/skills/alpha",
            linkDirectory: "/Users/test/.agents/skills/alpha",
            skillPath: "/Users/test/.agents/skills/alpha/SKILL.md",
          },
        ],
        existing: [
          {
            name: "beta",
            sourceDirectory: "/Users/test/skills/beta",
            linkDirectory: "/Users/test/.agents/skills/beta",
            skillPath: "/Users/test/.agents/skills/beta/SKILL.md",
          },
        ],
        skipped: [
          {
            sourceDirectory: "/Users/test/skills/broken",
            code: "no_skill_found",
            reason: "no SKILL.md found in selected directory",
          },
        ],
        conflicts: [
          {
            sourceDirectory: "/Users/test/skills/conflict",
            code: "destination_conflict",
            reason: "a skill entry with this directory name already exists",
          },
        ],
      });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Skills" }));
    const skills = await findSectionByHeading("全局 Skills");
    await user.click(within(skills).getByRole("button", { name: "新增 skill" }));

    expect(invokeMock).toHaveBeenCalledWith("import_skill_directories", {
      directories: [
        "/Users/test/skills/alpha",
        "/Users/test/skills/beta",
        "/Users/test/skills/broken",
        "/Users/test/skills/conflict",
      ],
    });
    expect(
      await screen.findByText("已导入 1 个 skills，1 个已存在，1 个跳过，1 个名称冲突。重启 Codex 或开启新会话后生效。"),
    ).toBeVisible();
    expect(within(skills).getByText("导入结果明细")).toBeVisible();
    expect(within(skills).getByText("已导入")).toBeVisible();
    expect(within(skills).getByText("已存在")).toBeVisible();
    expect(within(skills).getByText("冲突")).toBeVisible();
    expect(within(skills).getByText("跳过")).toBeVisible();
    expect(within(skills).getByText(/no SKILL\.md found/)).toBeVisible();
    expect(within(skills).getByText(/a skill entry with this directory name already exists/)).toBeVisible();
    expect(within(skills).getByRole("heading", { name: "alpha" })).toBeVisible();
  });

  it("folds import details after twelve rows", async () => {
    const user = userEvent.setup();
    const skipped = Array.from({ length: 13 }, (_, index) => ({
      sourceDirectory: `/Users/test/skills/broken-${index}`,
      code: "no_skill_found",
      reason: "no SKILL.md found in selected directory",
    }));
    openMock.mockResolvedValueOnce("/Users/test/skills/bundle");
    invokeMock
      .mockResolvedValueOnce(appStateWithSkills())
      .mockResolvedValueOnce({
        changed: false,
        state: appStateWithSkills(),
        refreshError: undefined,
        imported: [],
        existing: [],
        skipped,
        conflicts: [],
      });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Skills" }));
    const skills = await findSectionByHeading("全局 Skills");
    await user.click(within(skills).getByRole("button", { name: "新增 skill" }));

    expect(await within(skills).findByText("查看其余 1 条结果")).toBeVisible();
  });

  it("does not import when the skill directory picker is canceled", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValueOnce(null);
    invokeMock.mockResolvedValueOnce(appStateWithSkills());

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Skills" }));

    const skills = await findSectionByHeading("全局 Skills");
    await user.click(within(skills).getByRole("button", { name: "新增 skill" }));

    expect(openMock).toHaveBeenCalledWith({
      directory: true,
      multiple: true,
      title: "选择 skill 目录或父目录",
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).not.toHaveBeenCalledWith("import_skill_directories", expect.anything());
    expect(skills).toHaveTextContent("2 skills");
  });

  it("shows import failures without clearing the current skills list", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValueOnce("/Users/test/skills/broken");
    invokeMock
      .mockResolvedValueOnce(appStateWithSkills())
      .mockRejectedValueOnce("Agent global skills root is not discoverable");

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Skills" }));

    const skills = await findSectionByHeading("全局 Skills");
    await user.click(within(skills).getByRole("button", { name: "新增 skill" }));

    expect(await screen.findByText("Agent global skills root is not discoverable")).toBeVisible();
    expect(skills).toHaveTextContent("2 skills");
    expect(within(skills).getByText("tdd", { selector: "strong" })).toBeVisible();
  });

  it("shows refresh warnings without hiding imported batch outcomes", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValueOnce("/Users/test/skills/imported");
    invokeMock
      .mockResolvedValueOnce(appStateWithSkills())
      .mockResolvedValueOnce({
        changed: true,
        state: undefined,
        refreshError: "config.toml parse failed",
        imported: [
          {
            name: "imported",
            sourceDirectory: "/Users/test/skills/imported",
            linkDirectory: "/Users/test/.agents/skills/imported",
            skillPath: "/Users/test/.agents/skills/imported/SKILL.md",
          },
        ],
        existing: [],
        skipped: [],
        conflicts: [],
      });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Skills" }));
    const skills = await findSectionByHeading("全局 Skills");
    await user.click(within(skills).getByRole("button", { name: "新增 skill" }));

    expect(
      await screen.findByText("已导入 1 个 skills。状态刷新失败：config.toml parse failed"),
    ).toBeVisible();
    expect(within(skills).getByText("文件系统导入已完成，但状态刷新失败：config.toml parse failed")).toBeVisible();
    expect(within(skills).getByText("已导入")).toBeVisible();
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

    await user.click(await screen.findByRole("button", { name: "Skills" }));

    const skills = await findSectionByHeading("全局 Skills");
    expect(within(skills).getByRole("button", { name: "新增 skill" })).toBeDisabled();
    expect(within(skills).getByRole("button", { name: "删除 skill tdd" })).toBeDisabled();
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

    await user.click(await screen.findByRole("button", { name: "Sessions" }));

    const sessions = await findSectionByHeading("Codex sessions");
    expect(sessions).toHaveTextContent("~/sessions");
    expect(sessions).toHaveTextContent("会话数量");
    expect(sessions).toHaveTextContent("3");
    expect(sessions).toHaveTextContent("3.0 KB");

    expect(within(sessions).getByRole("button", { name: /2026/ })).toBeVisible();
    expect(within(sessions).getByRole("button", { name: /2025/ })).toBeVisible();
    expect(within(sessions).getByRole("button", { name: /06 月/ })).toBeVisible();
    expect(sessions).toHaveTextContent("Refactor config UI");
    expect(sessions).toHaveTextContent("3 user / 8 messages");
    expect(sessions).toHaveTextContent("codex 1.2.3");
    expect(sessions).toHaveTextContent("openai");
    expect(sessions).toHaveTextContent("Unexpected JSON token at line 2");
    expect(within(cardByText(sessions, "Refactor config UI")).getByRole("button", { name: "删除" })).toBeVisible();
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

    await user.click(await screen.findByRole("button", { name: "Sessions" }));

    const sessions = await findSectionByHeading("Codex sessions");
    const sessionCard = cardByText(sessions, "Refactor config UI");

    await user.click(within(sessionCard).getByRole("button", { name: "删除" }));
    expect(screen.getByText("再次点击删除会删除这个 Codex 会话 .jsonl 文件。")).toBeVisible();
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await user.click(within(sessionCard).getByRole("button", { name: "确认删除" }));

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

    await user.click(await screen.findByRole("button", { name: "Sessions" }));

    const sessions = await findSectionByHeading("Codex sessions");
    expect(sessions).toHaveTextContent("当前 Codex Home 下没有 session 记录。");
    expect(sessions).toHaveTextContent("会话数量");
    expect(sessions).toHaveTextContent("0");
  });

  it("lazily loads sessions only after the Sessions tab is opened", async () => {
    const user = userEvent.setup();
    const baseState = appState();
    const sessionState = baseState.codexSessions;
    const { codexSessions: _omitted, ...stateWithoutSessions } = baseState;
    invokeMock
      .mockResolvedValueOnce(stateWithoutSessions as AppState)
      .mockResolvedValueOnce(sessionState);

    render(<App />);

    // Initial paint must not request sessions — that is the white-screen fix.
    expect(await screen.findByRole("heading", { name: "全局配置" })).toBeVisible();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "load_state");

    await user.click(screen.getByRole("button", { name: "Sessions" }));

    expect(await screen.findByText("Refactor config UI")).toBeVisible();
    expect(invokeMock).toHaveBeenCalledWith("load_sessions");
  });
});
