"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { groupOf } from "@/lib/formations";
import { playerInGroup, resolveFilterGroup } from "@/lib/groups";
import { benchOf, benchSizeOf, outsideOf } from "@/lib/squad";
import type { Player } from "@/lib/types";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { GroupChips, useGroupFilter } from "./GroupChips";

/** メンバー外セクションの開閉状態を記憶するsessionStorageキー（タブを閉じるまでの簡易な永続化） */
const OUTSIDE_OPEN_KEY = "alfa_bench_outside_open";
/** メンバー外が既定で折りたたまれる人数のしきい値（board-squad-and-pc-polish §2-3） */
const OUTSIDE_COLLAPSE_THRESHOLD = 12;

/** sessionStorageに記録済みの開閉状態（未記録＝null＝人数で決める既定値を使う） */
function readStoredOutsideOpen(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(OUTSIDE_OPEN_KEY);
    return v == null ? null : v === "1";
  } catch {
    return null;
  }
}
function writeStoredOutsideOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(OUTSIDE_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* 無視（保存できなくても開閉自体は機能する） */
  }
}

export default function Bench() {
  const board = useBoard();
  const team = useTeam();
  const { players } = board.state;
  // groups-phase2 §2-3: 配置シート・名簿シートと共有する絞り込み(key "board")。
  // チップの絞り込みはベンチ・メンバー外の両方に効く
  const [filterIds, setFilterIds] = useGroupFilter("board");
  const filterGroup = resolveFilterGroup(filterIds, team.groups);

  const benchAll = benchOf(board.state);
  const outsideAll = outsideOf(board.state);
  const bench = filterGroup ? benchAll.filter((p) => playerInGroup(p, filterGroup)) : benchAll;
  const outside = filterGroup ? outsideAll.filter((p) => playerInGroup(p, filterGroup)) : outsideAll;
  const benchSize = benchSizeOf(board.state);

  // メンバー外の開閉。未操作時は人数がしきい値を超えるかどうかで既定値を決める
  const [outsideOpenStored, setOutsideOpenStored] = useState<boolean | null>(() =>
    readStoredOutsideOpen()
  );
  const outsideOpen = outsideOpenStored ?? outside.length <= OUTSIDE_COLLAPSE_THRESHOLD;
  const toggleOutsideOpen = () => {
    const next = !outsideOpen;
    setOutsideOpenStored(next);
    writeStoredOutsideOpen(next);
  };

  // ---- ベンチ/メンバー外→ピッチ ドラッグ交代 ----
  const [ghost, setGhost] = useState<{ pid: string; x: number; y: number } | null>(null);
  const drag = useRef<{
    pid: string;
    pointerId: number;
    moved: boolean;
    sx: number;
    sy: number;
    target: number | null;
  } | null>(null);

  // window / document に登録した各リスナーの参照を保持する。
  // add 時と同じ関数参照でしか remove できないため、必ずここ経由で登録・解除する。
  const listenersRef = useRef<{
    move: (ev: PointerEvent) => void;
    up: (ev: PointerEvent) => void;
    cancel: (ev: PointerEvent) => void;
    blur: () => void;
    visibility: () => void;
    pagehide: () => void;
  } | null>(null);

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

  // 登録済みの window / document リスナーがあれば必ず解除する（多重登録・解除漏れ防止）
  const removeWindowListeners = () => {
    const listeners = listenersRef.current;
    if (!listeners) return;
    window.removeEventListener("pointermove", listeners.move, { capture: true });
    window.removeEventListener("pointerup", listeners.up, { capture: true });
    window.removeEventListener("pointercancel", listeners.cancel, { capture: true });
    window.removeEventListener("blur", listeners.blur);
    document.removeEventListener("visibilitychange", listeners.visibility);
    window.removeEventListener("pagehide", listeners.pagehide);
    listenersRef.current = null;
  };

  // ドラッグライフサイクルの後片付けを一元化する（冪等: 何度呼んでも安全）。
  // pointerup / pointercancel / blur / visibilitychange / pagehide /
  // lostpointercapture / アンマウント、どの経路でも必ずここを通す。
  const endDrag = () => {
    drag.current = null;
    setGhost(null);
    setTarget(null);
    removeWindowListeners();
  };

  // アンマウント時の保険: ドラッグ中に Bench が消えてもリスナー・分身を残さない
  useEffect(() => {
    return () => {
      drag.current = null;
      removeWindowListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, pid: string) => {
    // ネイティブドラッグ/テキスト選択に横取りされて pointercancel が
    // 発生するのを防ぐため、先頭で明示的に preventDefault する
    e.preventDefault();

    // 前のドラッグ状態・リスナーが万一残っていても、必ず一度片付けてから開始する
    endDrag();

    drag.current = { pid, pointerId: e.pointerId, moved: false, sx: e.clientX, sy: e.clientY, target: null };

    // 保険としてポインタキャプチャも取得する（window リスナーと二重の保険）。
    // 窓外リリースやノード除去時は lostpointercapture 経由で endDrag が呼ばれる。
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const onWinMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      if (!d.moved && (Math.abs(ev.clientX - d.sx) > 6 || Math.abs(ev.clientY - d.sy) > 6)) {
        d.moved = true;
        setGhost({ pid: d.pid, x: ev.clientX, y: ev.clientY });
      }
      if (d.moved) {
        setGhost({ pid: d.pid, x: ev.clientX, y: ev.clientY });
        setTarget(slotElAt(ev.clientX, ev.clientY));
      }
    };

    const onWinUp = (ev: PointerEvent) => {
      const d = drag.current;
      // ドロップ・タップ処理は pointerId 一致時のみ行うが、
      // 掃除（endDrag）は不一致でも必ず行う（残留より誤中断の方がマシという方針）
      if (d && ev.pointerId === d.pointerId) {
        if (d.moved) {
          const idx = slotElAt(ev.clientX, ev.clientY);
          if (idx != null) {
            // クロージャの board.state ではなく常に最新の状態を参照する
            const st = board.stateRef.current;
            const slot = st.slots[idx];
            const out = slot.pid ? st.players.find((p) => p.id === slot.pid) : null;
            const inP = st.players.find((p) => p.id === d.pid);
            board.assignPlayer(idx, d.pid);
            board.toast(out ? `${out.name} → ${inP?.name ?? ""} に交代` : `${inP?.name ?? ""} を投入`);
          }
        } else {
          // タップ＝プロフィールを開く（PCはチーム運営の名簿タブへ画面遷移）
          if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
            board.setTeamIntent({ tab: "ros", playerId: d.pid });
            board.setScreen("team");
          } else {
            board.openSheet({ type: "playerDetail", playerId: d.pid });
          }
        }
      }
      endDrag();
    };

    const onWinCancel = (ev: PointerEvent) => {
      // ブラウザにドラッグを横取りされた場合など、pointercancel 時に
      // 分身（ghost）とドロップ先ハイライトが残留しないよう必ず後片付けする。
      // 他ポインタの cancel で正当なドラッグを誤中断しないよう pointerId を照合する
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      endDrag();
    };

    const onWinBlur = () => {
      // ウィンドウ切替・OSダイアログ表示などで pointerup/cancel を
      // 取りこぼした場合の保険
      endDrag();
    };

    const onVisibility = () => {
      // タブ切替・最小化などでページが隠れたら後片付けする（blur と同様の保険）
      if (document.visibilityState === "hidden") endDrag();
    };

    const onPageHide = () => {
      // ページ遷移・bfcache 退避時の保険
      endDrag();
    };

    listenersRef.current = {
      move: onWinMove,
      up: onWinUp,
      cancel: onWinCancel,
      blur: onWinBlur,
      visibility: onVisibility,
      pagehide: onPageHide,
    };
    window.addEventListener("pointermove", onWinMove, { capture: true });
    window.addEventListener("pointerup", onWinUp, { capture: true });
    window.addEventListener("pointercancel", onWinCancel, { capture: true });
    window.addEventListener("blur", onWinBlur);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
  };

  const ghostPlayer = ghost ? players.find((p) => p.id === ghost.pid) : null;

  /** ベンチ／メンバー外共通の選手カード。右上の操作ボタンはpointerdown/clickをstopPropagationし、
   * カード本体のドラッグ・タップ（既存の onPointerDown）を横取りしないようにする */
  const renderCard = (
    p: Player,
    opts: { outside: boolean; actionLabel: string; onAction: () => void; actionGlyph: string }
  ) => (
    <div
      key={p.id}
      className={`bcard${opts.outside ? " outside" : ""}${ghost?.pid === p.id ? " dragging" : ""}`}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => onPointerDown(e, p.id)}
      onLostPointerCapture={endDrag}
    >
      <button
        type="button"
        className="bcardact"
        aria-label={opts.actionLabel}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          opts.onAction();
        }}
      >
        {opts.actionGlyph}
      </button>
      <div className={`bav ${groupOf(p.position)}`}>{p.number ?? "–"}</div>
      <div className="bn">{p.name}</div>
      <div className="bp">{p.position}</div>
    </div>
  );

  return (
    <div className="bench">
      <div className="bh">
        <b>ベンチ</b>
        {/* レビュー指摘(1回目): 絞り込み中は分子だけそのグループの人数になり「5/7」と出て、
            枠(benchSize)が絞り込みと無関係に満員でも空きがあるように読めた。絞り込み中は
            右カラムのタイル（§2-2）と同じ「n人」にする */}
        <span>{filterGroup ? `${bench.length}人` : `${bench.length}/${benchSize}`}</span>
        <div className="benchstepper" role="group" aria-label="ベンチの枠数">
          <button
            type="button"
            className="benchstepbtn"
            aria-label="ベンチの枠を減らす"
            disabled={benchSize <= 0}
            onClick={() => board.setBenchSize(benchSize - 1)}
          >
            −
          </button>
          <span className="benchstepval">{benchSize}</span>
          <button
            type="button"
            className="benchstepbtn"
            aria-label="ベンチの枠を増やす"
            disabled={benchSize >= 20}
            onClick={() => board.setBenchSize(benchSize + 1)}
          >
            ＋
          </button>
        </div>
        <i>タップで編集 ／ ピッチへドラッグで交代</i>
      </div>
      {/* board-squad-and-pc-polish §2-4: 戦術ボードの現在のメンバーを試合予定へ登録する（スタッフのみ）。
          スタメンが1人も居ないときはシートを開かずtoastで知らせる */}
      {board.auth.role === "coach" && (
        <button
          type="button"
          className="benchToEventBtn"
          onClick={() => {
            if (!board.state.slots.some((s) => s.pid)) {
              board.toast("スタメンが1人も配置されていません");
              return;
            }
            board.openSheet({ type: "squadToEvent" });
          }}
        >
          試合予定にメンバーを登録
        </button>
      )}
      {team.groups.length > 0 && (
        <div className="benchfilter">
          <GroupChips groups={team.groups} value={filterIds} onChange={setFilterIds} allowAll />
        </div>
      )}
      {bench.length === 0 ? (
        <div className="benchEmpty">
          {benchAll.length === 0
            ? "ベンチ入りの選手はいません。メンバー外の選手の＋で追加できます。"
            : "このグループのベンチ選手はいません。"}
        </div>
      ) : (
        <div className="bgrid">
          {bench.map((p) =>
            renderCard(p, {
              outside: false,
              actionLabel: "メンバー外にする",
              actionGlyph: "−",
              onAction: () => board.benchRemove(p.id),
            })
          )}
        </div>
      )}

      <div className="benchoutside">
        <button
          type="button"
          className="benchoutsidehead"
          aria-expanded={outsideOpen}
          onClick={toggleOutsideOpen}
        >
          メンバー外 {outside.length}人
          <span className="benchoutsidecar" aria-hidden="true">
            {outsideOpen ? "▾" : "▸"}
          </span>
        </button>
        {outsideOpen &&
          (outside.length === 0 ? (
            <div className="benchEmpty">
              {filterGroup
                ? "このグループのメンバー外の選手はいません。"
                : "メンバー外の選手はいません。"}
            </div>
          ) : (
            <div className="bgrid">
              {outside.map((p) =>
                renderCard(p, {
                  outside: true,
                  actionLabel: "ベンチに入れる",
                  actionGlyph: "＋",
                  onAction: () => board.benchAdd(p.id),
                })
              )}
            </div>
          ))}
      </div>

      {ghost && ghostPlayer && (
        <div className="bench-ghost" style={{ left: ghost.x, top: ghost.y }}>
          <div className="gdisc">{ghostPlayer.number ?? "–"}</div>
          <div className="gname">{ghostPlayer.name}</div>
        </div>
      )}
    </div>
  );
}
