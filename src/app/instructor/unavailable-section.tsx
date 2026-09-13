"use client";

import type { InstructorUnavailablePeriod } from "@/lib/types";
import { EditableList } from "./editable-list";
import { addUnavailable, updateUnavailable, deleteUnavailable } from "./actions";

export function UnavailableSection({
  items,
  readOnly,
}: {
  items: InstructorUnavailablePeriod[];
  readOnly?: boolean;
}) {
  return (
    <EditableList
      readOnly={readOnly}
      title="강의 불가기간"
      fields={[
        { key: "start_date", label: "시작일", type: "date", required: true },
        { key: "end_date", label: "종료일", type: "date", required: true },
        { key: "reason", label: "사유", placeholder: "예: 해외 출장" },
      ]}
      items={items.map((r) => ({
        id: r.id,
        start_date: r.start_date,
        end_date: r.end_date,
        reason: r.reason ?? "",
      }))}
      onAdd={(v) =>
        addUnavailable({
          start_date: v.start_date,
          end_date: v.end_date,
          reason: v.reason,
        })
      }
      onUpdate={(id, v) =>
        updateUnavailable(id, {
          start_date: v.start_date,
          end_date: v.end_date,
          reason: v.reason,
        })
      }
      onDelete={deleteUnavailable}
    />
  );
}
