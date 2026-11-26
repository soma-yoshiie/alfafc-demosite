"use client";

import { useRef, useState } from "react";
import type React from "react";
import type { PlayLine, PlayLineKind, PlayPoint, Point } from "@/lib/types";
import { PLAY_KIND_LABEL } from "@/lib/types";
import { buildSlots } from "@/lib/formations";
import { simplify } from "@/lib/animation";
import { shotTarget } from "@/lib/plays";
import { wavy } from "@/lib/drillDraw";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 編集中の選択ツール（点 or 軌道） */
export type PlayTool =
  | { mode: "point"; kind: PlayPoint["kind"] }
  | { mode: "line"; kind: PlayLineKind };

/* ===== note-pitch-v2 §1-1: 幾何（単位は m。ピッチ 68×105、まわりの余白 3） ===== */
export type PitchView = "full" | "half";
const PW = 68;
const PH = 105;
const VW = 74;
const VH_OF: Record<PitchView, number> = { full: 111, half: 57 };
const viewBoxOf = (v: PitchView) => `-3 -3 ${VW} ${VH_OF[v]}`;

/** 保存の座標（x 0〜100 左→右、y 0 自陣〜100 敵陣）→ 入れ物の中の % */
export function fieldPct(x: number, y: number, view: PitchView = "full"): { left: number; top: number } {
  return {
    left: ((3 + 0.68 * x) / VW) * 100,
    top: ((3 + 1.05 * (100 - y)) / VH_OF[view]) * 100,
  };
}

/** 指の位置 → 保存の座標（2〜98 に丸める） */
export function pointerToField(
  e: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
  view: PitchView = "full",
): Point {
  const xm = ((e.clientX - rect.left) / rect.width) * VW - 3;
  const ym = ((e.clientY - rect.top) / rect.height) * VH_OF[view] - 3;
  return { x: clamp(xm / 0.68, 2, 98), y: clamp(100 - ym / 1.05, 2, 98) };
}

/** 保存の座標 → m */
const toM = (p: Point): Point => ({ x: p.x * 0.68, y: (100 - p.y) * 1.05 });

/* ===== §1-2: 線（マーキング） ===== */
const GX = PW / 2;
/** note-reflection-figure §3-1: 紙の色（白地）で描くときの線の色と太さ。渡さなければ緑のピッチ用（クラスで色が付く） */
export type MarkPaint = { stroke: string; width: number };
/** ピッチの線の絵（全面。原点は余白込みで −3,−3）。FigureView が紙の色で使う */
export function PitchMarkings({ paint }: { paint?: MarkPaint }) {
  return <Markings paint={paint} />;
}
function Markings({ paint }: { paint?: MarkPaint } = {}) {
  // 敵陣側（y=0 のゴールライン）を基準に書き、自陣側は上下反転して同じ式で作る
  const spotStyle = paint ? { fill: paint.stroke, stroke: "none" } : undefined;
  const side = (flip: boolean) => {
    const fy = (y: number) => (flip ? PH - y : y);
    const rectD = (x: number, y: number, w: number, h: number) => {
      const y0 = fy(y);
      const y1 = fy(y + h);
      return `M${x} ${y0}H${x + w}V${y1}H${x}Z`;
    };
    const dx = Math.sqrt(9.15 * 9.15 - 5.5 * 5.5);
    return (
      <g key={flip ? "bot" : "top"}>
        <path d={rectD(GX - 20.16, 0, 40.32, 16.5)} />
        <path d={rectD(GX - 9.16, 0, 18.32, 5.5)} />
        <path d={rectD(GX - 3.66, -2, 7.32, 2)} />
        <path d={`M${GX - dx} ${fy(16.5)}A9.15 9.15 0 0 ${flip ? 1 : 0} ${GX + dx} ${fy(16.5)}`} />
        <circle className="spot" cx={GX} cy={fy(11)} r={0.35} style={spotStyle} />
      </g>
    );
  };
  return (
    <g className="npmk" style={paint ? { fill: "none", stroke: paint.stroke, strokeWidth: paint.width } : undefined}>
      <rect x={0} y={0} width={PW} height={PH} />
      <path d={`M0 ${PH / 2}H${PW}`} />
      <circle cx={GX} cy={PH / 2} r={9.15} />
      <circle className="spot" cx={GX} cy={PH / 2} r={0.35} style={spotStyle} />
      {side(false)}
      {side(true)}
      <path d="M1 0A1 1 0 0 1 0 1" />
      <path d={`M${PW - 1} 0A1 1 0 0 0 ${PW} 1`} />
      <path d={`M0 ${PH - 1}A1 1 0 0 1 1 ${PH}`} />
      <path d={`M${PW} ${PH - 1}A1 1 0 0 0 ${PW - 1} ${PH}`} />
    </g>
  );
}

/* ===== §1-3: 軌道（線） ===== */
export const ptsD = (pts: Point[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join("");

type LineLike = { kind: PlayLineKind; path: Point[]; success?: boolean };

export function arrowPoints(mPath: Point[]): string | null {
  if (mPath.length < 2) return null;
  const end = mPath[mPath.length - 1];
  let from = mPath[mPath.length - 2];
  for (let i = mPath.length - 2; i >= 0; i--) {
    from = mPath[i];
    if (Math.hypot(end.x - from.x, end.y - from.y) > 0.01) break;
  }
  const dx = end.x - from.x;
  const dy = end.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const bx = end.x - ux * 2.3;
  const by = end.y - uy * 2.3;
  const hx = -uy * 1.15;
  const hy = ux * 1.15;
  return `${end.x.toFixed(2)},${end.y.toFixed(2)} ${(bx + hx).toFixed(2)},${(by + hy).toFixed(2)} ${(bx - hx).toFixed(2)},${(by - hy).toFixed(2)}`;
}

export const WAVE_K = 4;

function OneLine({ l, staff, dim }: { l: LineLike; staff: boolean; dim?: boolean }) {
  const mPath = l.path.map(toM);
  // wavy は約 1.2 単位ごとに点を取るので、波長 3.3m では 1 周期に 3 点弱しか無くぎざぎざになる。
  // WAVE_K 倍に拡大して掛け（振れ幅・波長も同じ倍率）、元の大きさに戻して点の密度だけ上げる（値は仕様のまま）
  const drawn =
    l.kind === "dribble"
      ? wavy(mPath.map((p) => ({ x: p.x * WAVE_K, y: p.y * WAVE_K })), 0.85 * WAVE_K, 3.3 * WAVE_K).map((p) => ({
          x: p.x / WAVE_K,
          y: p.y / WAVE_K,
        }))
      : mPath;
  const d = ptsD(drawn);
  const arrow = arrowPoints(mPath);
  const missed = l.success === false;
  const end = mPath[mPath.length - 1];
  return (
    <g opacity={dim ? 0.3 : undefined}>
      <g className={`npline ${l.kind}${missed ? " missed" : ""}`} opacity={missed ? 0.6 : undefined}>
        {staff && <path className="npl under" d={d} />}
        {staff && arrow && <polygon className="nparrow under" points={arrow} />}
        <path className="npl" d={d} />
        {arrow && <polygon className="nparrow" points={arrow} />}
      </g>
      {/* 失敗の赤い輪は薄くするグループの外に描く（緑の上で沈まないように） */}
      {missed && end && <circle className="npmiss" cx={end.x} cy={end.y} r={1.45} />}
    </g>
  );
}

function PlayLinesSvg({
  lines,
  temp,
  staff,
  dimLines,
  shotLines = [],
}: {
  lines: PlayLine[];
  temp: LineLike | null;
  staff: boolean;
  /** note-play-chain §3: 薄くする軌道の番号（null＝全部濃い） */
  dimLines?: Set<number> | null;
  /** コースのあるシュートから出る線（保存しない。点とコースから毎回描く） */
  shotLines?: { path: Point[]; dim: boolean; missed: boolean }[];
}) {
  return (
    <g className="nplines">
      {lines.map((l, i) => (
        <OneLine key={i} l={l} staff={staff} dim={!!dimLines && dimLines.has(i)} />
      ))}
      {shotLines.map((s, i) => (
        <g key={"s" + i} opacity={s.dim ? 0.3 : s.missed ? 0.6 : undefined}>
          <OneLine l={{ kind: "shot", path: s.path }} staff={staff} />
        </g>
      ))}
      {temp && temp.path.length > 1 && <OneLine l={temp} staff={staff} />}
    </g>
  );
}

/* ===== §1-5: 陣形 ===== */
/**
 * ① フォーメーション記録用ピッチ。
 * 既定は自分のチームだけを全面に。showOpp のときは両チームを縮めて置く。自分のポジションはタップで選択。
 * BoardProvider に依存しない表示専用コンポーネント。
 */
export function FormationPitch({
  ownFormation,
  ownPositionIndex,
  onPickPosition,
  oppFormation,
  showOpp = false,
}: {
  ownFormation: string;
  ownPositionIndex: number | null;
  onPickPosition?: (index: number) => void;
  oppFormation?: string;
  showOpp?: boolean;
}) {
  const own = buildSlots(ownFormation);
  const opp = showOpp && oppFormation ? buildSlots(oppFormation) : [];
  return (
    <div className="npitch">
      <svg className="npsvg" viewBox={viewBoxOf("full")} preserveAspectRatio="none" aria-hidden="true">
        <Markings />
      </svg>
      <div className="nphint">敵陣 ↑</div>
      {opp.map((s, i) => {
        const { left, top } = fieldPct(100 - s.x, 100 - s.y * 0.46);
        return (
          <div key={"o" + i} className="nptok opp" style={{ left: left + "%", top: top + "%" }}>
            {s.role}
          </div>
        );
      })}
      {own.map((s, i) => {
        const sel = i === ownPositionIndex;
        const { left, top } = fieldPct(s.x, showOpp ? s.y * 0.5 : s.y);
        const style = { left: left + "%", top: top + "%" };
        if (!onPickPosition) {
          return (
            <div key={"m" + i} className={`nptok own${sel ? " sel" : ""}`} style={style}>
              {s.role}
            </div>
          );
        }
        return (
          <button
            key={"m" + i}
            type="button"
            className={`nptok own${sel ? " sel" : ""}`}
            style={style}
            aria-pressed={sel}
            onClick={() => onPickPosition(i)}
          >
            {s.role}
          </button>
        );
      })}
    </div>
  );
}

/* ===== §1-6: プレーのピッチ ===== */
/**
 * ② プレーエリア記録用ピッチ。
 * 点ツール（受けた/シュート/トラップミス）＝タップで点を追加、軌道ツール（ドリブル/パス）＝なぞって線を追加。
 * y:0自陣→100敵陣（上が敵陣）。
 * notebook-staff-redesign §4: 閲覧モード（tool 無し）で onPointClick があるとき、シュートの点だけを
 * button にして押せるようにする（他の種類の点は今のまま何もしない）。selectedIndex の点は .sel の輪で強調する
 */
export function PlayAreaPitch({
  points,
  lines = [],
  tool,
  onAddPoint,
  onAddLine,
  onPointClick,
  selectedIndex,
  view = "full",
  tone = "player",
  strong = null,
  badges,
  snapAt = null,
  staffLayer = null,
}: {
  points: PlayPoint[];
  lines?: PlayLine[];
  tool?: PlayTool;
  onAddPoint?: (x: number, y: number) => void;
  onAddLine?: (path: Point[]) => void;
  onPointClick?: (index: number, p: PlayPoint) => void;
  selectedIndex?: number | null;
  view?: PitchView;
  tone?: "player" | "staff";
  /** note-play-chain §3: 渡した番号の印だけ濃く、ほかは薄く（null・省略は全部濃い） */
  strong?: { points: number[]; lines: number[] } | null;
  /** 点の左上に出す番号の丸 */
  badges?: { point: number; n: number }[];
  /** その位置に白い輪（作図中のプレーの終わり） */
  snapAt?: Point | null;
  /** スタッフの図を上に重ねる（押せない） */
  staffLayer?: { points: PlayPoint[]; lines: PlayLine[] } | null;
}) {
  const strongPts = strong ? new Set(strong.points) : null;
  const strongLines = strong ? new Set(strong.lines) : null;
  const dimLines = strongLines ? new Set(lines.map((_, i) => i).filter((i) => !strongLines.has(i))) : null;
  const shotLines = points.flatMap((p, i) =>
    p.kind === "shot" && p.course
      ? [{ path: [{ x: p.x, y: p.y }, shotTarget(p.course)], dim: !!strongPts && !strongPts.has(i), missed: p.scored === false }]
      : []
  );
  const ref = useRef<HTMLDivElement | null>(null);
  const draw = useRef<{ active: boolean; pts: Point[]; moved: boolean }>({ active: false, pts: [], moved: false });
  const [temp, setTemp] = useState<Point[] | null>(null);
  const editable = !!tool && (!!onAddPoint || !!onAddLine);
  const staff = tone === "staff";

  const toPct = (e: React.PointerEvent<HTMLDivElement>): Point | null => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return null;
    return pointerToField(e, r, view);
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const p = toPct(e);
    if (!p) return;
    draw.current = { active: true, pts: [p], moved: false };
    if (tool!.mode === "line") {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      setTemp([p]);
    }
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = draw.current;
    if (!st.active || tool!.mode !== "line") return;
    const p = toPct(e);
    if (!p) return;
    const last = st.pts[st.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 2) {
      st.pts.push(p);
      st.moved = true;
      setTemp(st.pts.slice());
    }
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = draw.current;
    if (!st.active) return;
    st.active = false;
    if (tool!.mode === "line") {
      setTemp(null);
      if (st.pts.length >= 2 && onAddLine) onAddLine(simplify(st.pts));
    } else {
      const p = toPct(e) ?? st.pts[0];
      if (onAddPoint) onAddPoint(p.x, p.y);
    }
  };
  const onCancel = () => {
    draw.current = { active: false, pts: [], moved: false };
    setTemp(null);
  };

  return (
    <div
      className={`npitch play${view === "half" ? " half" : ""}${staff ? " staff" : ""}${
        editable ? ` editable ${tool!.mode === "line" ? "tline" : "tpoint"}` : ""
      }`}
      ref={ref}
      onPointerDown={editable ? onDown : undefined}
      onPointerMove={editable ? onMove : undefined}
      onPointerUp={editable ? onUp : undefined}
      onPointerCancel={editable ? onCancel : undefined}
    >
      <svg className="npsvg" viewBox={viewBoxOf(view)} preserveAspectRatio="none" aria-hidden="true">
        <Markings />
        <PlayLinesSvg
          lines={lines}
          staff={staff}
          dimLines={dimLines}
          shotLines={shotLines}
          temp={temp && tool?.mode === "line" ? { kind: tool.kind, path: temp } : null}
        />
        {staffLayer && (
          <g className="npstafflayer">
            <PlayLinesSvg lines={staffLayer.lines} staff temp={null} />
          </g>
        )}
      </svg>
      <div className="nphint">敵陣 ↑</div>
      {points.map((p, i) => {
        const sel = (selectedIndex === i ? " sel" : "") + (strongPts && !strongPts.has(i) ? " dim" : "");
        const { left, top } = fieldPct(p.x, p.y, view);
        const pos = { left: left + "%", top: top + "%" };
        if (!editable && onPointClick && p.kind === "shot") {
          return (
            <button
              key={i}
              type="button"
              className={`npdot shot tappable${sel}`}
              style={pos}
              title={PLAY_KIND_LABEL[p.kind]}
              aria-label="シュート"
              onClick={() => onPointClick(i, p)}
            />
          );
        }
        return <span key={i} className={`npdot ${p.kind}${sel}`} style={pos} title={PLAY_KIND_LABEL[p.kind]} />;
      })}
      {staffLayer?.points.map((p, i) => {
        const { left, top } = fieldPct(p.x, p.y, view);
        return <span key={"st" + i} className={`npdot stf ${p.kind}`} style={{ left: left + "%", top: top + "%" }} />;
      })}
      {(badges ?? []).map((b) => {
        const p = points[b.point];
        if (!p) return null;
        const { left, top } = fieldPct(p.x, p.y, view);
        return (
          <span key={"b" + b.point} className="npbadge" style={{ left: left + "%", top: top + "%" }}>
            {b.n}
          </span>
        );
      })}
      {snapAt && (() => {
        const { left, top } = fieldPct(snapAt.x, snapAt.y, view);
        return <span className="npsnap" style={{ left: left + "%", top: top + "%" }} />;
      })()}
    </div>
  );
}

/* ===== ゴール正面図（シュートコース） ===== */
/** ゴール枠の座標（viewBox "0 0 100 50" 基準）。GoalCourseView と isInGoalFrame で共有 */
const GOAL_LEFT = 14;
const GOAL_RIGHT = 86;
const GOAL_TOP = 10;
const GOAL_BOTTOM = 46;

/** course座標(x:0-100 / y:0-100)がゴール枠内かどうか（yはviewBoxのy10〜46を0-100に正規化した範囲で判定） */
export function isInGoalFrame(x: number, y: number): boolean {
  return x >= GOAL_LEFT && x <= GOAL_RIGHT && y >= GOAL_TOP * 2 && y <= GOAL_BOTTOM * 2;
}

/** ゴール正面図。シュートコースの打点表示・記録（高さも表現できる） */
export function GoalCourseView({
  shots,
  onPick,
}: {
  shots: { course: Point; scored?: boolean; label?: number }[];
  onPick?: (x: number, y: number) => void;
}) {
  const editable = !!onPick;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
    const yHalf = clamp(((e.clientY - r.top) / r.height) * 50, 0, 50);
    onPick(x, yHalf * 2);
  };

  return (
    <div className={`goalview${editable ? " editable" : ""}`}>
      <svg viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet" onClick={editable ? handleClick : undefined}>
        {/* 枠内グリッド */}
        {[26, 38, 50, 62, 74].map((gx) => (
          <line key={`v${gx}`} x1={gx} y1={GOAL_TOP} x2={gx} y2={GOAL_BOTTOM} stroke="rgba(21,35,60,0.14)" strokeWidth={0.5} />
        ))}
        {[19, 28, 37].map((gy) => (
          <line key={`h${gy}`} x1={GOAL_LEFT} y1={gy} x2={GOAL_RIGHT} y2={gy} stroke="rgba(21,35,60,0.14)" strokeWidth={0.5} />
        ))}
        {/* グラウンドライン */}
        <line x1={2} y1={GOAL_BOTTOM} x2={98} y2={GOAL_BOTTOM} stroke="var(--ink)" strokeWidth={1.5} />
        {/* ゴール枠（クロスバー＋両ポスト） */}
        <polyline
          points={`${GOAL_LEFT},${GOAL_BOTTOM} ${GOAL_LEFT},${GOAL_TOP} ${GOAL_RIGHT},${GOAL_TOP} ${GOAL_RIGHT},${GOAL_BOTTOM}`}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={2.5}
        />
        {/* シュート打点（ゴール=緑◯ / ノーゴール=赤◯） */}
        {shots.map((s, i) => {
          const color = s.scored === true ? "#2eb872" : "#ff5b6e";
          const cy = s.course.y / 2;
          return (
            <g key={i}>
              <circle cx={s.course.x} cy={cy} r={3.2} fill="none" stroke={color} strokeWidth={1.8} />
              {s.label != null && (
                <text x={s.course.x} y={cy} fontSize={3.5} fill={color} textAnchor="middle" dominantBaseline="central">
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
