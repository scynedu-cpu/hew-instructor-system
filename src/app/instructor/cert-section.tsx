"use client";

import type { CertRow } from "@/lib/types";
import { EditableList } from "./editable-list";
import { addCert, updateCert, deleteCert } from "./actions";

export function CertSection({
  items,
  readOnly,
}: {
  items: CertRow[];
  readOnly?: boolean;
}) {
  return (
    <EditableList
      readOnly={readOnly}
      title="자격증"
      fields={[
        { key: "cert_name", label: "자격증명", required: true },
        { key: "issued_date", label: "취득일", type: "date" },
        { key: "issuing_org", label: "발급기관" },
      ]}
      items={items.map((r) => ({
        id: r.id,
        cert_name: r.cert_name ?? "",
        issued_date: r.issued_date ?? "",
        issuing_org: r.issuing_org ?? "",
      }))}
      onAdd={(v) =>
        addCert({
          cert_name: v.cert_name,
          issued_date: v.issued_date,
          issuing_org: v.issuing_org,
        })
      }
      onUpdate={(id, v) =>
        updateCert(id, {
          cert_name: v.cert_name,
          issued_date: v.issued_date,
          issuing_org: v.issuing_org,
        })
      }
      onDelete={deleteCert}
    />
  );
}
