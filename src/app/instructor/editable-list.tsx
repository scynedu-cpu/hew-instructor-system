"use client";

import { useState, useTransition } from "react";

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "date";
  required?: boolean;
  placeholder?: string;
}

type Values = Record<string, string>;
type Result = { error?: string };

export function EditableList({
  title,
  fields,
  items,
  onAdd,
  onUpdate,
  onDelete,
  readOnly = false,
}: {
  title: string;
  fields: FieldDef[];
  items: (Values & { id: string })[];
  onAdd: (values: Values) => Promise<Result>;
  onUpdate: (id: string, values: Values) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState<Values>(emptyValues(fields));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Values>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<Result>, after?: () => void) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.error) setMsg(r.error);
      else after?.();
    });
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              {fields.map((f) => (
                <th key={f.key} className="px-2 py-1 font-medium">
                  {f.label}
                  {f.required && <span className="text-red-600"> *</span>}
                </th>
              ))}
              {!readOnly && <th className="px-2 py-1" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={fields.length + 1}
                  className="px-2 py-3 text-center text-xs text-muted"
                >
                  등록된 항목이 없습니다.
                </td>
              </tr>
            )}
            {items.map((item) => {
              const isEditing = !readOnly && editingId === item.id;
              return (
                <tr key={item.id}>
                  {fields.map((f) => (
                    <td key={f.key} className="px-2 py-1.5 align-top">
                      {isEditing ? (
                        <input
                          type={f.type === "date" ? "date" : "text"}
                          value={editValues[f.key] ?? ""}
                          placeholder={f.placeholder}
                          onChange={(e) =>
                            setEditValues((v) => ({
                              ...v,
                              [f.key]: e.target.value,
                            }))
                          }
                          className="w-full rounded border border-border px-2 py-1 text-sm"
                        />
                      ) : (
                        <span>{item[f.key] || "-"}</span>
                      )}
                    </td>
                  ))}
                  {readOnly ? null : (
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    {isEditing ? (
                      <>
                        <button
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => onUpdate(item.id, editValues),
                              () => setEditingId(null),
                            )
                          }
                          className="text-xs font-medium text-brand hover:underline"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="ml-2 text-xs text-muted hover:underline"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(item.id);
                            setEditValues(
                              Object.fromEntries(
                                fields.map((f) => [f.key, item[f.key] ?? ""]),
                              ),
                            );
                            setMsg(null);
                          }}
                          className="text-xs text-muted hover:text-foreground hover:underline"
                        >
                          수정
                        </button>
                        <button
                          disabled={pending}
                          onClick={() => run(() => onDelete(item.id))}
                          className="ml-2 text-xs text-muted hover:text-red-600 hover:underline"
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 추가 폼 */}
      {!readOnly && (
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs text-muted">
            {f.label}
            {f.required && <span className="sr-only">필수</span>}
            <input
              type={f.type === "date" ? "date" : "text"}
              value={adding[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) =>
                setAdding((v) => ({ ...v, [f.key]: e.target.value }))
              }
              className="rounded border border-border px-2 py-1.5 text-sm text-foreground"
            />
          </label>
        ))}
        <button
          disabled={pending}
          onClick={() =>
            run(
              () => onAdd(adding),
              () => setAdding(emptyValues(fields)),
            )
          }
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-60"
        >
          추가
        </button>
      </div>
      )}

      {msg && (
        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
          {msg}
        </p>
      )}
    </section>
  );
}

function emptyValues(fields: FieldDef[]): Values {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}
