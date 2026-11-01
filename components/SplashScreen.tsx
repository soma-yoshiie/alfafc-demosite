"use client";

import { useEffect, useRef, useState } from "react";
import BrandMark from "./BrandMark";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 自動とタップの両方から呼ばれても onDone は 1 回だけ
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // 描画が終わって（約 1.9s）全部そろい、1 秒見せてから消える
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 2900);
    const t2 = setTimeout(finish, 3350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (tapTimer.current) clearTimeout(tapTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone]);

  return (
    <div
      className={`splash${leaving ? " leave" : ""}`}
      onClick={() => {
        if (tapTimer.current) return;
        setLeaving(true);
        tapTimer.current = setTimeout(finish, 250);
      }}
    >
      <div className="splash-mark">
        <BrandMark uid="sp" />
      </div>
      <div className="splash-title">ALFA FOOTBALL</div>
      <div className="splash-sub">サッカー戦術ボード ／ チーム運営</div>
      <div className="splash-skip">タップでスキップ</div>
    </div>
  );
}
