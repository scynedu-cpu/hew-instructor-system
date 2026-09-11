import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "";

// kordoc(hwp/hwpx 파서, src/lib/hwp.ts)은 OCR·수식인식(이 프로젝트는 쓰지 않음
// — 이미지 업로드는 Claude Vision 으로 별도 처리) 을 위해 무거운 optional
// dependency(@huggingface/transformers, onnxruntime-node, sharp, pdfjs-dist,
// @hyzyla/pdfium — 합쳐서 수백MB)를 정적/동적으로 import 한다.
// Turbopack 은 이런 import 도 빌드 타임에 정적으로 리졸브하려 시도해서, 이
// 패키지들이 없으면(Vercel 빌드 머신은 postinstall 네이티브 스크립트 정책 때문에
// 설치가 안 됨) "Module not found" 로 빌드 자체가 실패한다 — 그래서 package.json
// 의 overrides 로 이 5개를 vendor-stubs/ 의 빈 스텁으로 강제 치환해 두었다
// (kordoc 은 이 모듈이 비어 있어도 해당 기능만 건너뛰고 정상 동작하도록 만들어져
// 있음). 아래 두 설정은 그 위에 얹는 추가 안전장치:
// - serverExternalPackages: 번들에 인라인하지 않고 런타임 require 로 남겨둠
// - outputFileTracingExcludes: 혹시라도 실제 무거운 패키지가 설치되는 경우에도
//   서버리스 함수 산출물에는 포함되지 않도록 방어
const KORDOC_OPTIONAL_OCR_DEPS = [
  "@huggingface/transformers",
  "onnxruntime-node",
  "sharp",
  "@hyzyla/pdfium",
  "pdfjs-dist",
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  serverExternalPackages: KORDOC_OPTIONAL_OCR_DEPS,
  outputFileTracingExcludes: {
    "/api/ai/autofill/route": KORDOC_OPTIONAL_OCR_DEPS.map(
      (name) => `./node_modules/${name}/**`,
    ),
  },
};

export default nextConfig;
