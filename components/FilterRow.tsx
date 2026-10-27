"use client";

/**
 * 絞り込みパネルの共通の行と見出し（ux-fix R3-2「絞り込みの選択部品」）。
 * 1 つだけ選ぶ所は丸のラジオ（shape="rd"）、いくつでも選ぶ所は四角のチェック（shape="sq"）。
 * 色を持つ行（学年・グループ）は、チェックではなくラベルの前の小さな点（dot）で示す。
 * 四角のチェックの所は「どれも選んでいない＝すべて」なので「すべて」の行は置かず、見出しの右に「すべて解除」を出す。
 */
export function FilterRow({
  rowCls,
  nameCls,
  on,
  label,
  onClick,
  dot,
  shape = "sq",
}: {
  /** 行のクラス（.nbfrow／.rosfrow） */
  rowCls: string;
  /** ラベルのクラス（.nbfname／.rosfname） */
  nameCls: string;
  on: boolean;
  label: string;
  onClick: () => void;
  /** ラベルの前の色の点（学年・グループ）。無ければ点なし */
  dot?: string;
  shape?: "sq" | "rd";
}) {
  return (
    <button
      type="button"
      className={`${rowCls}${on ? " on" : ""}`}
      role={shape === "rd" ? "radio" : "checkbox"}
      aria-checked={on}
      onClick={onClick}
    >
      <span className={`calchk ${shape}${on ? " on" : ""}`} aria-hidden="true" />
      {dot !== undefined && <i className="fdot" style={{ background: dot }} aria-hidden="true" />}
      <span className={nameCls}>{label}</span>
    </button>
  );
}

/**
 * 見出し（左に題、右に「すべて解除」）。選んでいないときは見えなくするだけで場所は残す（押した瞬間に行が動かない）。
 * 題の要素（headCls）の中身は題だけにして、ボタンは外に置く。
 */
export function FilterSecHead({
  headCls,
  title,
  active,
  onClear,
}: {
  headCls: string;
  title: string;
  /** 何か選んでいるか（false のとき「すべて解除」は見えず押せない） */
  active: boolean;
  onClear: () => void;
}) {
  return (
    <div className="fsech">
      <div className={headCls}>{title}</div>
      <button
        type="button"
        className="fclear"
        style={active ? undefined : { visibility: "hidden" }}
        tabIndex={active ? 0 : -1}
        aria-hidden={active ? undefined : true}
        aria-label={`${title}の選択をすべて解除`}
        onClick={onClear}
      >
        すべて解除
      </button>
    </div>
  );
}
