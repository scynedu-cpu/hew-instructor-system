import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "";

// kordoc(hwp/hwpx 파서)의 OCR·수식인식 기능은 선택 기능이라 무거운 optional
// 의존성(@huggingface/transformers, onnxruntime-node, sharp, pdfjs-dist,
// @hyzyla/pdfium — 수백MB)이 딸려온다. 이 프로젝트는 OCR 을 쓰지 않으므로
// (이미지 업로드는 Claude Vision 으로 별도 처리) 서버리스 함수 번들에서 제외해
// Vercel 함수 용량 한도를 넘기지 않도록 한다. kordoc 은 이 패키지들이 없어도
// 해당 기능만 건너뛰고 정상 동작한다(자체 문서화된 동작).
const KORDOC_OCR_EXCLUDES = [
  "./node_modules/@huggingface/transformers/**",
  "./node_modules/onnxruntime-node/**",
  "./node_modules/sharp/**",
  "./node_modules/@hyzyla/pdfium/**",
  "./node_modules/pdfjs-dist/**",
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  outputFileTracingExcludes: {
    "/api/ai/autofill/route": KORDOC_OCR_EXCLUDES,
  },
};

export default nextConfig;
