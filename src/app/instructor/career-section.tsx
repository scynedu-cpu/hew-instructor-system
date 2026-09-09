"use client";

import type { CareerRow } from "@/lib/types";
import { EditableList } from "./editable-list";
import { addCareer, updateCareer, deleteCareer } from "./actions";

export function CareerSection({ items }: { items: CareerRow[] }) {
  return (
    <EditableList
      title="학력 및 경력사항"
      fields={[
        { key: "year_month", label: "연월", placeholder: "2020/03" },
        { key: "description", label: "내용", required: true },
        { key: "issuing_org", label: "발령청/기타" },
      ]}
      items={items.map((r) => ({
        id: r.id,
        year_month: r.year_month ?? "",
        description: r.description ?? "",
        issuing_org: r.issuing_org ?? "",
      }))}
      onAdd={(v) =>
        addCareer({
          year_month: v.year_month,
          description: v.description,
          issuing_org: v.issuing_org,
        })
      }
      onUpdate={(id, v) =>
        updateCareer(id, {
          year_month: v.year_month,
          description: v.description,
          issuing_org: v.issuing_org,
        })
      }
      onDelete={deleteCareer}
    />
  );
}
