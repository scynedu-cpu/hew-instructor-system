// kordoc 이 "pdfjs-dist/legacy/build/pdf.mjs" 서브경로로 직접 import 하는 부분의
// 스텁. 자세한 내용은 vendor-stubs/README.md 참고 — 이 프로젝트는 PDF 업로드를
// 받지 않으므로(hwp/hwpx/이미지만) 이 경로는 실제로 호출되지 않는다.
export const OPS = {};
export const ImageKind = {};
export function getDocument() {
  throw new Error("pdfjs-dist 스텁: PDF 파싱은 이 프로젝트에서 사용하지 않습니다.");
}
export const GlobalWorkerOptions = {};
