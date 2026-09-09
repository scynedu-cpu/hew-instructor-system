import type { RequestStatus } from "@/lib/types";
import { REQUEST_STATUS_LABEL } from "@/lib/types";

const STYLE: Record<RequestStatus, string> = {
  submitted: "bg-blue-50 text-blue-700",
  reviewing: "bg-amber-50 text-amber-800",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`badge ${STYLE[status]}`}>
      {REQUEST_STATUS_LABEL[status]}
    </span>
  );
}
