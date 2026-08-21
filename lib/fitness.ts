/** 体力測定の値を表示用に整形する。
 *  単位が「秒」で60秒以上なら「6分04秒」形式、それ以外は「7.7秒」「51回」のように値+単位。 */
export function fmtFitnessValue(value: number, unit: string): string {
  if (unit === "秒" && Number.isFinite(value) && value >= 60) {
    const total = Math.round(value);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}分${String(s).padStart(2, "0")}秒`;
  }
  return `${value}${unit}`;
}
