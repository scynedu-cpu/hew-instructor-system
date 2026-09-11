# vendor-stubs

`kordoc`(hwp/hwpx 파서, [src/lib/hwp.ts](../src/lib/hwp.ts))는 OCR·수식인식(우리는
쓰지 않음) 기능을 위해 무거운 optional dependency(`sharp`, `onnxruntime-node`,
`@huggingface/transformers`, `@hyzyla/pdfium`, `pdfjs-dist` — 합쳐서 수백MB)를
동적/정적으로 import 한다.

Turbopack은 이런 import를 **빌드 타임에 정적으로 리졸브**하려고 시도해서, 이
패키지들이 `node_modules`에 없으면(Vercel 빌드 머신은 postinstall 네이티브
스크립트 정책 때문에 설치되지 않음) 빌드 자체가 "Module not found"로 실패한다.
kordoc 코드는 이 모듈들이 없어도 알아서 해당 기능만 건너뛰도록 만들어져
있으므로(`tryImport`), 실제 무거운 패키지 대신 **이름만 같고 내용은 빈 최소
스텁**을 `package.json`의 `overrides`로 연결해 "설치는 됐지만 아무 기능도
없는" 상태로 만든다 — 빌드는 통과하고, 런타임에 OCR 경로가 실제로 호출되는
일은 우리 사용 범위(hwp/hwpx 텍스트·표 추출)에서 없다.

각 스텁은 수 바이트짜리 빈 모듈이며, `package.json`의 `overrides.kordoc` 에서만
참조된다. 실제 sharp/onnxruntime-node/등을 쓸 일이 생기면(예: 이미지 OCR을
실제로 켜기로 결정) 이 스텁들과 `overrides` 항목, `next.config.ts` 의
`outputFileTracingExcludes`/`serverExternalPackages` 를 함께 제거하면 된다.
