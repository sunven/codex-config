import { describe, expect, it } from "vitest";
import {
  compactMcpServerDraft,
  compactModelProviderDraft,
  draftFromMcpServer,
  draftFromModelProvider,
  emptyMcpServerDraft,
  emptyModelProviderDraft,
  isMcpServerDraftDirty,
  isModelProviderDraftDirty,
  mcpServerDraftId,
  modelProviderDraftId,
} from "./configTableEntries";

describe("Codex config table entries", () => {
  it("builds stable model provider drafts and ids from table entries", () => {
    const draft = draftFromModelProvider({
      id: "local",
      name: "Local",
      wireApi: undefined,
      queryParams: { organization: "alpha" },
      httpHeaders: {},
      envHttpHeaders: {},
    });

    expect(draft).toMatchObject({
      id: "local",
      originalId: "local",
      wireApi: "responses",
      queryParams: { organization: "alpha" },
    });
    expect(modelProviderDraftId(draft)).toBe("local");
    expect(modelProviderDraftId(emptyModelProviderDraft())).toBe("new");
  });

  it("uses canonical model provider drafts for dirty checks", () => {
    const providers = [
      {
        id: "local",
        name: "Local",
        baseUrl: "https://models.example.test/v1",
        envKey: "LOCAL_KEY",
        wireApi: "responses",
        queryParams: {},
        httpHeaders: {},
        envHttpHeaders: {},
      },
    ];

    expect(isModelProviderDraftDirty(emptyModelProviderDraft(), providers)).toBe(false);
    expect(isModelProviderDraftDirty(draftFromModelProvider(providers[0]!), providers)).toBe(false);
    expect(
      isModelProviderDraftDirty(
        {
          ...draftFromModelProvider(providers[0]!),
          baseUrl: " https://models.example.test/v2 ",
        },
        providers,
      ),
    ).toBe(true);
    expect(
      isModelProviderDraftDirty(
        {
          ...emptyModelProviderDraft(),
          id: " local ",
          wireApi: " responses ",
        },
        providers,
      ),
    ).toBe(true);
  });

  it("compacts provider and MCP drafts at the table entry seam", () => {
    expect(
      compactModelProviderDraft({
        id: " local ",
        originalId: " local ",
        name: " Local ",
        baseUrl: " ",
        envKey: "LOCAL_KEY",
        envKeyInstructions: "",
        wireApi: " responses ",
        queryParams: { " organization ": " alpha ", empty: " " },
        httpHeaders: { " X-Test ": " yes " },
        envHttpHeaders: {},
      }),
    ).toMatchObject({
      id: "local",
      originalId: "local",
      name: "Local",
      baseUrl: undefined,
      envKey: "LOCAL_KEY",
      envKeyInstructions: undefined,
      wireApi: "responses",
      queryParams: { organization: "alpha" },
      httpHeaders: { "X-Test": "yes" },
    });

    expect(
      compactMcpServerDraft({
        id: " filesystem ",
        originalId: " filesystem ",
        command: " npx ",
        args: [" -y ", " ", "server"],
        env: { " NODE_ENV ": " production ", empty: " " },
      }),
    ).toMatchObject({
      id: "filesystem",
      originalId: "filesystem",
      command: "npx",
      args: ["-y", "server"],
      env: { NODE_ENV: "production" },
    });
  });

  it("uses canonical MCP server drafts for dirty checks", () => {
    const servers = [
      {
        id: "filesystem",
        command: "npx",
        args: ["-y", "server"],
        env: { ROOT: "/tmp" },
        enabled: true,
      },
    ];

    expect(isMcpServerDraftDirty(emptyMcpServerDraft(), servers)).toBe(false);
    expect(isMcpServerDraftDirty(draftFromMcpServer(servers[0]!), servers)).toBe(false);
    expect(
      isMcpServerDraftDirty(
        {
          ...draftFromMcpServer(servers[0]!),
          args: [" -y ", "server", " "],
        },
        servers,
      ),
    ).toBe(false);
    expect(
      isMcpServerDraftDirty(
        {
          ...draftFromMcpServer(servers[0]!),
          enabled: false,
        },
        servers,
      ),
    ).toBe(true);
    expect(mcpServerDraftId(draftFromMcpServer(servers[0]!))).toBe("filesystem");
    expect(mcpServerDraftId(emptyMcpServerDraft())).toBe("new");
  });
});
