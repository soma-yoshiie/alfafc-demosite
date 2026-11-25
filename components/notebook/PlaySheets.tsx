import type { PlayLine, PlayPoint } from "@/lib/types";
import { MATCH_PHASE_LABEL, PLAY_LINE_LABEL } from "@/lib/types";
import { markPhase } from "@/lib/plays";
import { GoalCourseView } from "../MiniPitch";

/** シュートコース編集シート（ゴール正面図でコース・結果・状況メモを記録） */
export function ShotCourseSheet({
  shot,
  onPick,
  onSetScored,
  onSetNote,
  onClose,
  onDelete,
}: {
  shot: PlayPoint;
  onPick: (x: number, y: number) => void;
  onSetScored: (v: boolean) => void;
  onSetNote: (v: string) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="wsheetback" onClick={onClose}>
      <div className="wsheet" onClick={(e) => e.stopPropagation()}>
        <div className="wsheet-h">シュートコース ・ ゴールのどこに飛んだかをタップ</div>
        <div className="formpitch">
          <GoalCourseView shots={shot.course ? [{ course: shot.course, scored: shot.scored }] : []} onPick={onPick} />
        </div>
        <div className="goalres">
          <button
            type="button"
            className={`goalresbtn${shot.scored === true ? " on goal" : ""}`}
            onClick={() => onSetScored(true)}
          >
            ゴール
          </button>
          <button
            type="button"
            className={`goalresbtn${shot.scored === false ? " on nogoal" : ""}`}
            onClick={() => onSetScored(false)}
          >
            ノーゴール
          </button>
        </div>
        <div className="formfield" style={{ margin: 0 }}>
          <input
            value={shot.shotNote ?? ""}
            onChange={(e) => onSetNote(e.target.value)}
            placeholder="例）トラップして浮いた球をボレー / 右足でカーブシュート"
          />
        </div>
        <button className="bigbtn" style={{ marginTop: 12 }} onClick={onClose}>
          OK
        </button>
        <button type="button" className="linkdanger" onClick={onDelete}>
          このシュートを削除
        </button>
      </div>
    </div>
  );
}

/** シュート位置のモーダル（試合ノートの詳細・閲覧専用）。notebook-staff-redesign §4:
 *  ピッチのシュートの点／一覧の行を押すと、ゴール正面図にそのシュートだけを出して
 *  「ゴールのどこに打ったか」と結果・状況メモを見せる。文法は ShotCourseSheet(.wsheetback/.wsheet)と同じ */
export function ShotViewSheet({
  shot,
  onClose,
}: {
  shot: PlayPoint & { num: number };
  onClose: () => void;
}) {
  // コース未記録でも結果(scored)だけ入っていれば結果ラベルは出す。どちらも無ければ出さない
  const hasResult = shot.course != null || shot.scored != null;
  return (
    <div className="wsheetback" onClick={onClose}>
      <div className="wsheet shotsheet" onClick={(e) => e.stopPropagation()}>
        <div className="wsheet-h">
          #{shot.num} シュート ・ {MATCH_PHASE_LABEL[markPhase(shot.phase)]}
        </div>
        {shot.course ? (
          <div className="formpitch">
            <GoalCourseView shots={[{ course: shot.course, scored: shot.scored, label: shot.num }]} />
          </div>
        ) : (
          <div className="evnote">コースは記録されていません</div>
        )}
        {hasResult && (
          <div className={"shotresult" + (shot.scored ? "" : " nogoal")}>
            <span className={"shotmark" + (shot.scored ? "" : " nogoal")} />
            {shot.scored ? "ゴール" : "ノーゴール"}
          </div>
        )}
        {shot.shotNote && <div className="notesec-b">{shot.shotNote}</div>}
        <button type="button" className="wsheetcancel" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}

/** パス／ドリブルの結果編集シート（成否・状況メモを記録） */
export function LineResultSheet({
  line,
  onSetSuccess,
  onSetNote,
  onClose,
  onDelete,
}: {
  line: PlayLine;
  onSetSuccess: (v: boolean) => void;
  onSetNote: (v: string) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const label = PLAY_LINE_LABEL[line.kind];
  const success = line.success !== false;
  return (
    <div className="wsheetback" onClick={onClose}>
      <div className="wsheet" onClick={(e) => e.stopPropagation()}>
        <div className="wsheet-h">{label}の結果</div>
        <div className="goalres">
          <button
            type="button"
            className={`goalresbtn${success ? " on goal" : ""}`}
            onClick={() => onSetSuccess(true)}
          >
            成功
          </button>
          <button
            type="button"
            className={`goalresbtn${!success ? " on nogoal" : ""}`}
            onClick={() => onSetSuccess(false)}
          >
            ミス
          </button>
        </div>
        <div className="formfield" style={{ margin: 0 }}>
          <input
            value={line.note ?? ""}
            onChange={(e) => onSetNote(e.target.value)}
            placeholder="例）縦パスがカットされた / 切り返しで抜いた"
          />
        </div>
        <button className="bigbtn" style={{ marginTop: 12 }} onClick={onClose}>
          OK
        </button>
        <button type="button" className="linkdanger" onClick={onDelete}>
          この{label}を削除
        </button>
      </div>
    </div>
  );
}
