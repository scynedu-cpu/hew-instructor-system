"use client";

import { useEffect, useRef, useState } from "react";

/**
 * .hwpx(ZIP+XML) 원본을 문단·표 구조 그대로 다시 그린다 — 브라우저 DOMParser 로
 * Contents/sectionN.xml 을 파싱해 <p>/<table> 로 재구성. 완전한 서식(글꼴·간격 등)
 * 재현은 아니지만, 평문 나열보다 원본 레이아웃(표 포함)에 훨씬 가깝다.
 * 파싱 실패 시 서버가 추출한 텍스트(fallbackText)로 자동 대체.
 */
export function HwpxPreview({
  file,
  fallbackText,
}: {
  file: File;
  fallbackText: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = ref.current;
    if (container) container.innerHTML = "";

    (async () => {
      let ok = false;
      try {
        const { unzipSync, strFromU8 } = await import("fflate");
        const buf = new Uint8Array(await file.arrayBuffer());
        const entries = unzipSync(buf);
        const sections = Object.entries(entries)
          .filter(([name]) => /section\d+\.xml$/i.test(name))
          .sort(([a], [b]) => a.localeCompare(b));
        if (sections.length === 0 || !container) throw new Error("섹션을 찾지 못했습니다.");

        const parser = new DOMParser();
        for (const [, data] of sections) {
          const xml = strFromU8(data);
          const doc = parser.parseFromString(xml, "application/xml");
          if (doc.getElementsByTagName("parsererror").length > 0) {
            throw new Error("XML 파싱 오류");
          }
          const page = document.createElement("div");
          page.className =
            "mb-4 rounded-md border border-border bg-white p-4 text-sm leading-relaxed shadow-sm";
          renderChildren(doc.documentElement, page);
          container.appendChild(page);
        }
        ok = true;
      } catch {
        ok = false;
      }
      if (!cancelled) setFailed(!ok);
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  if (failed) {
    return (
      <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
        {fallbackText || "원본을 표시할 수 없습니다."}
      </pre>
    );
  }
  return <div ref={ref} />;
}

function localName(el: Element): string {
  return el.localName || el.tagName.split(":").pop() || el.tagName;
}

function containsTable(el: Element): boolean {
  for (const c of Array.from(el.children)) {
    if (localName(c) === "tbl" || containsTable(c)) return true;
  }
  return false;
}

/** hp:p(문단)/hp:tbl·tr·tc(표)/hp:t(텍스트)를 그대로 대응하는 DOM 으로 재구성 */
function renderChildren(el: Element, target: HTMLElement) {
  for (const child of Array.from(el.children)) {
    const ln = localName(child);
    if (ln === "p") {
      if (containsTable(child)) {
        // 표를 담은 문단은 <p> 로 감싸지 않고 표를 그대로 노출
        renderChildren(child, target);
      } else {
        const p = document.createElement("p");
        p.className = "mb-2 min-h-[1.4em] whitespace-pre-wrap";
        renderChildren(child, p);
        target.appendChild(p);
      }
    } else if (ln === "t") {
      target.appendChild(document.createTextNode(child.textContent ?? ""));
    } else if (ln === "tbl") {
      const table = document.createElement("table");
      table.className = "mb-3 w-full border-collapse text-xs";
      renderChildren(child, table);
      target.appendChild(table);
    } else if (ln === "tr") {
      const tr = document.createElement("tr");
      renderChildren(child, tr);
      target.appendChild(tr);
    } else if (ln === "tc") {
      const td = document.createElement("td");
      td.className = "border border-border px-2 py-1 align-top";
      renderChildren(child, td);
      target.appendChild(td);
    } else {
      // run/subList/lineseg 등 컨테이너 및 그 외 태그는 하위를 그대로 이어 그림
      renderChildren(child, target);
    }
  }
}
