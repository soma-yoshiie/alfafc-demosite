"use client";

import { useRef, useState } from "react";
import type React from "react";
import { groupOf } from "@/lib/formations";
import { useBoard } from "./BoardProvider";

export default function Bench() {
  const board = useBoard();
  const { slots, players } = board.state;
  const inXi = new Set(slots.map((s) => s.pid).filter(Boolean));
  const bench = players.filter((p) => !inXi.has(p.id));

  // ---- ベンチ→ピッチ ドラッグ交代 ----
  const [ghost, setGhost] = useState<{ pid: string; x: number; y: number } | null>(null);
  const drag = useRef<{ pid: string; moved: boolean; sx: number; sy: number; target: number | null } | null>(null);

  const slotElAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const tok = el?.closest("[data-slot]") as HTMLElement | null;
    if (!tok) return null;
    const v = tok.getAttribute("data-slot");
    return v == null ? null : Number(v);
  };
  const setTarget = (idx: number | null) => {
    if (drag.current?.target === idx) return;
    document
      .querySelectorAll(".tok.drop-target")
      .forEach((t) => t.classList.remove("drop-target"));
    if (idx != null) {
      const t = document.querySelector(`[data-slot="${idx}"]`);
      t?.classList.add("drop-target");
    }
    if (drag.current) drag.current.target = idx;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, pid: string) => {
    drag.current = { pid, moved: false, sx: e.clientX, sy: e.clientY, target: null };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && (Math.abs(e.clientX - d.sx) > 6 || Math.abs(e.clientY - d.sy) > 6)) {
      d.moved = true;
      setGhost({ pid: d.pid, x: e.clientX, y: e.clientY });
    }
    if (d.moved) {
      setGhost({ pid: d.pid, x: e.clientX, y: e.clientY });
      setTarget(slotElAt(e.clientX, e.clientY));
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>, pid: string) => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (d?.moved) {
      const idx = slotElAt(e.clientX, e.clientY);
      setTarget(null);
      if (idx != null) {
        const slot = board.state.slots[idx];
        const out = slot.pid ? board.state.players.find((p) => p.id === slot.pid) : null;
        const inP = board.state.players.find((p) => p.id === pid);
        board.assignPlayer(idx, pid);
        board.toast(out ? `${out.name} → ${inP?.name ?? ""} に交代` : `${inP?.name ?? ""} を投入`);
      }
    } else if (d) {
      // タップ＝プロフィールを開く
      board.openSheet({ type: "playerDetail", playerId: pid });
    }
  };

  const ghostPlayer = ghost ? players.find((p) => p.id === ghost.pid) : null;

  return (
    <div className="bench">
      <div className="bh">
        <b>ベンチ</b>
        <span>控え {bench.length}人</span>
        <i>タップで編集 ／ ピッチへドラッグで交代</i>
      </div>
      {bench.length === 0 ? (
        <div className="benchEmpty">
          控え選手がいません。右上の <b>名簿</b> から選手を追加すると、
          スタメン以外の選手がここに並びます。
        </div>
      ) : (
        <div className="bgrid">
          {bench.map((p) => (
            <div
              key={p.id}
              className={`bcard${ghost?.pid === p.id ? " dragging" : ""}`}
              style={{ touchAction: "none" }}
              onPointerDown={(e) => onPointerDown(e, p.id)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, p.id)}
            >
              <div className={`bav ${groupOf(p.position)}`}>{p.number ?? "–"}</div>
              <div className="bn">{p.name}</div>
              <div className="bp">{p.position}</div>
            </div>
          ))}
        </div>
      )}

      {ghost && ghostPlayer && (
        <div className="bench-ghost" style={{ left: ghost.x, top: ghost.y }}>
          <div className="gdisc">{ghostPlayer.number ?? "–"}</div>
          <div className="gname">{ghostPlayer.name}</div>
        </div>
      )}
    </div>
  );
}
