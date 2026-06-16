import type { DraftChange } from "./configEditWorkflow";

export type FieldState = {
  path: string;
  label: string;
  group: string;
  kind: "boolean" | "text" | "select" | "status" | "number" | "object";
  value?: string;
  editable: boolean;
  risk: "normal" | "caution" | "dangerous" | "secret" | "experimental";
  note?: string;
  options?: string[];
};

export function draftValuesFromFields(fields: FieldState[]) {
  return fields.reduce<Record<string, string>>((draft, field) => {
    draft[field.path] =
      field.kind === "boolean" ? (field.value ?? "inherited") : (field.value ?? "");
    return draft;
  }, {});
}

export function settingsChanges(
  fields: FieldState[],
  draftValues: Record<string, string>,
  scope: "root" | "profile",
) {
  return fields.flatMap<DraftChange>((field) => {
    if (!field.editable || field.kind === "status") {
      return [];
    }

    const current =
      field.kind === "boolean" ? (field.value ?? "inherited") : (field.value ?? "");
    const next = draftValues[field.path] ?? current;

    if (next === current) {
      return [];
    }

    if (field.kind === "boolean") {
      return [
        next === "inherited"
          ? { path: field.path, scope, action: "unset" }
          : { path: field.path, scope, action: "set", value: next === "true" },
      ];
    }

    const trimmed = next.trim();
    return [
      trimmed
        ? { path: field.path, action: "set", value: trimmed, scope }
        : { path: field.path, action: "unset", scope },
    ];
  });
}
