"use client";

import { useRef } from "react";
import type React from "react";
import { COLOR_CHOICES } from "@/lib/groups";

/**
 * 色を選ぶ縦リスト（calendar-plan-a §11-3。iPhoneカレンダーの「カレンダーのカラー」と同じ形）。
 * グループ管理シート（色の丸の下）とカテゴリ管理シート（編集行・新規追加）の両方から使う。
 * 7色（COLOR_CHOICES）を並べ、最後に「カスタム…」＋隠した<input type="color">を置く。
 * ルート要素は"colorchoice"、各行は"colorchoice-row"固定（検証スクリプトがこの名前を見る）。
 */
export function ColorChoiceList({
  value,
  onChange,
}: {
  value: string;
  /**
   * レビュー指摘対応（calendar-plan-a §11-3）: プリセット行のタップとカスタムピッカーの
   * 入力を呼び出し側が区別できるよう、第2引数で通知元を渡す。カスタムの<input type="color">は
   * ドラッグ中も逐次onChangeが飛ぶため、呼び出し側はこれを見て「custom」のときだけ
   * リストを開いたままにする（グループ管理シート参照。閉じるとinputがDOMから外れ、
   * ブラウザ側の色ピッカーごと閉じてしまうため） */
  onChange: (hex: string, source: "preset" | "custom") => void;
}) {
  const customInputRef = useRef<HTMLInputElement>(null);
  const isPreset = COLOR_CHOICES.some((c) => c.color === value);
  const openCustomPicker = () => customInputRef.current?.click();
  const rowKeyDown = (e: React.KeyboardEvent, run: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      run();
    }
  };
  return (
    <div className="colorchoice">
      {COLOR_CHOICES.map((c) => (
        <div
          key={c.color}
          className="colorchoice-row"
          role="button"
          tabIndex={0}
          onClick={() => onChange(c.color, "preset")}
          onKeyDown={(e) => rowKeyDown(e, () => onChange(c.color, "preset"))}
        >
          <span className="colorchoice-dot" style={{ background: c.color }} />
          <span className="colorchoice-name">{c.name}</span>
          {value === c.color && <span className="colorchoice-check" />}
        </div>
      ))}
      {/* 「カスタム…」：7色のどれとも一致しないvalueはカスタム色とみなし、その色でチェックを付ける。
          タップで隠しfile input(type=color)をclick()し、OSの色ピッカーを開く */}
      <div
        className="colorchoice-row"
        role="button"
        tabIndex={0}
        onClick={openCustomPicker}
        onKeyDown={(e) => rowKeyDown(e, openCustomPicker)}
      >
        <span
          className={`colorchoice-dot${isPreset ? " colorchoice-dot-empty" : ""}`}
          style={isPreset ? undefined : { background: value }}
        />
        <span className="colorchoice-name">カスタム…</span>
        {!isPreset && <span className="colorchoice-check" />}
        <input
          ref={customInputRef}
          type="color"
          className="colorchoice-input"
          /* レビュー指摘対応（calendar-plan-a §11-3）: プリセット中も常に現在値を渡す。
             以前は"#000000"固定にしていたため、プリセット選択中にカスタムを開くと
             常に黒から始まり、黒そのものも選べなかった */
          value={value}
          onChange={(e) => onChange(e.target.value, "custom")}
          aria-label="カスタムの色を選ぶ"
          tabIndex={-1}
        />
      </div>
    </div>
  );
}
