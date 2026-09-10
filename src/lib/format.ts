export function won(n: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(n))}원`;
}
