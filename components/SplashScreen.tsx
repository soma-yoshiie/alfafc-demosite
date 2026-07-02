"use client";

import { useEffect, useState } from "react";
import LogoMark from "./Logo";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 2400);
    const t2 = setTimeout(onDone, 2850);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div
      className={`splash${leaving ? " leave" : ""}`}
      onClick={() => {
        setLeaving(true);
        setTimeout(onDone, 250);
      }}
    >
      <div className="splash-mark">
        <LogoMark pitch uid="sp" />
      </div>
      <div className="splash-title">
        ALFA<b> FOOTBALL</b>
      </div>
      <div className="splash-sub">サッカー戦術ボード ／ チーム運営</div>
      <div className="splash-skip">タップでスキップ</div>
    </div>
  );
}
