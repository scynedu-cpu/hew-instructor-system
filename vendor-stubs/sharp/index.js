// kordoc 의 이미지 OCR(사용 안 함) 용 optional dependency 스텁. 자세한 내용은
// vendor-stubs/README.md 참고.
module.exports = function sharp() {
  throw new Error("sharp 스텁: 이 기능(이미지 OCR)은 이 프로젝트에서 사용하지 않습니다.");
};
