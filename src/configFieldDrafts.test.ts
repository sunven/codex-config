import { describe, expect, it } from "vitest";
import {
  draftValuesFromFields,
  settingsChanges,
  type FieldState,
} from "./configFieldDrafts";

const fields: FieldState[] = [
  {
    path: "features.fast_mode",
    label: "Fast mode",
    group: "Features",
    kind: "boolean",
    value: undefined,
    editable: true,
    risk: "normal",
  },
  {
    path: "model",
    label: "Model",
    group: "Model",
    kind: "text",
    value: "gpt-5",
    editable: true,
    risk: "caution",
  },
  {
    path: "approval_policy",
    label: "Approval policy",
    group: "Safety",
    kind: "select",
    value: undefined,
    editable: true,
    risk: "dangerous",
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
];

describe("Codex config field drafts", () => {
  it("creates editable draft values from schema fields", () => {
    expect(draftValuesFromFields(fields)).toEqual({
      "features.fast_mode": "inherited",
      model: "gpt-5",
      approval_policy: "",
      shell_environment_policy: "read-only object",
    });
  });

  it("maps boolean inheritance to set and unset changes", () => {
    expect(
      settingsChanges(
        fields,
        {
          ...draftValuesFromFields(fields),
          "features.fast_mode": "true",
        },
      ),
    ).toEqual([
      {
        path: "features.fast_mode",
        action: "set",
        value: true,
      },
    ]);

    expect(
      settingsChanges(
        [
          {
            ...fields[0]!,
            value: "true",
          },
        ],
        {
          "features.fast_mode": "inherited",
        },
      ),
    ).toEqual([
      {
        path: "features.fast_mode",
        action: "unset",
      },
    ]);
  });

  it("trims text/select values and unsets empty values", () => {
    expect(
      settingsChanges(
        fields,
        {
          ...draftValuesFromFields(fields),
          model: " gpt-5.1 ",
          approval_policy: " on-request ",
        },
      ),
    ).toEqual([
      {
        path: "model",
        action: "set",
        value: "gpt-5.1",
      },
      {
        path: "approval_policy",
        action: "set",
        value: "on-request",
      },
    ]);

    expect(
      settingsChanges(
        fields,
        {
          ...draftValuesFromFields(fields),
          model: " ",
        },
      ),
    ).toEqual([
      {
        path: "model",
        action: "unset",
      },
    ]);
  });

  it("skips unchanged, status, and read-only fields", () => {
    expect(settingsChanges(fields, draftValuesFromFields(fields))).toEqual([]);
    expect(
      settingsChanges(
        [
          {
            ...fields[1]!,
            editable: false,
          },
        ],
        {
          model: "gpt-5.1",
        },
      ),
    ).toEqual([]);
  });
});
