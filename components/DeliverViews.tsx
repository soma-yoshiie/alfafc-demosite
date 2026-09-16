"use client";

import { useMemo, useState } from "react";
import type {
  AssignmentDeliver,
  AssignmentStatus,
  BoardState,
  CoachDeliverable,
  DeliverKind,
  MeetingDeliver,
  PracticeMenuDeliver,
  SavedSetPiece,
  SetPieceDeliver,
} from "@/lib/types";
import {
  ASSIGNMENT_STATUS_LABEL,
  DELIVER_KIND_LABEL,
} from "@/lib/types";
import { deliverableTargetsPlayer, deliverableVisibleToPlayer } from "@/lib/groups";
import { renderTacticPng } from "@/lib/exportImage";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { E } from "./Emoji";
import { GroupChips } from "./GroupChips";

/* ====== 一覧ブロック（ホーム・配信タブに埋め込む） ====== */
export function DeliverBlock({
  kinds,
  heading = "コーチから",
  onOpen,
  onCreate,
  selectedId,
}: {
  kinds: DeliverKind[];
  /** ブロック見出し。null で非表示 */
  heading?: string | null;
  onOpen: (id: string) => void;
  onCreate: (kind: DeliverKind) => void;
  /** PCマスター・ディテールで選択中の配信ID。未指定なら選択表示なし（選手ホーム等の既存呼び出しに影響しない） */
  selectedId?: string | null;
}) {
  const board = useBoard();
  const team = useTeam();
  const isCoach = board.auth.role === "coach";
  const me = board.auth.playerId ?? "";
  const meP = board.state.players.find((p) => p.id === me);

  const items = useMemo(() => {
    let list = board.deliverables.filter((d) => kinds.includes(d.kind));
    // groups-everywhere §4: グループ宛の配信も対象なら表示する。Phase D-1(C1-minor):
    // 選手が名簿に見つからない場合のフォールバックはdeliverableVisibleToPlayer()に集約
    // （宛先指定の無い配信だけ通す。旧`: true`は他人宛・他グループ宛まで見えてしまっていた）
    if (!isCoach) list = list.filter((d) => deliverableVisibleToPlayer(d, meP, team.groups));
    // 選手は未回答を上に（要対応が埋もれないように）
    const undone = (d: CoachDeliverable) => (!isCoach && !d.responses[me] ? 0 : 1);
    return [...list].sort((a, b) => undone(a) - undone(b) || b.ts - a.ts);
  }, [board.deliverables, kinds, isCoach, me, meP, team.groups]);

  return (
    <div className="dlvblock">
      {heading != null && (
        <div className="dlvblock-h">
          <span><E n="megaphone" /> {heading}</span>
        </div>
      )}
      {isCoach && (
        <div className="dlvcreate">
          {kinds.map((k) => (
            <button key={k} className="dynadd" onClick={() => onCreate(k)}>
              ＋ {DELIVER_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <div className="empty-msg" style={{ padding: "10px 0" }}>
          {isCoach ? "まだ配信はありません。" : "コーチからの配信はまだありません。"}
        </div>
      ) : (
        items.map((d) => (
          <DeliverCard
            key={d.id}
            d={d}
            isCoach={isCoach}
            me={me}
            selected={selectedId != null && d.id === selectedId}
            onClick={() => onOpen(d.id)}
          />
        ))
      )}
    </div>
  );
}

function DeliverCard({
  d,
  isCoach,
  me,
  selected,
  onClick,
}: {
  d: CoachDeliverable;
  isCoach: boolean;
  me: string;
  selected?: boolean;
  onClick: () => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const respondedCount = Object.keys(d.responses).length;
  const targets = board.state.players.filter((p) => deliverableTargetsPlayer(d, p, team.groups)).length;
  const mineDone = !!d.responses[me];
  return (
    <button className={`dlvcard${selected ? " sel" : ""}`} onClick={onClick}>
      <span className={`dlvtag ${d.kind}`}>{DELIVER_KIND_LABEL[d.kind]}</span>
      <div className="dlvmain">
        <div className="dlvtitle">{d.title}</div>
        <div className="dlvsub">
          {isCoach ? `回答 ${respondedCount}/${targets}` : mineDone ? "回答済み" : "未回答"}
        </div>
      </div>
      {!isCoach && <span className={`dlvdot${mineDone ? " done" : ""}`} />}
      <span className="convchev">›</span>
    </button>
  );
}

/* ====== 作成（コーチ） ====== */
const empty = (): string[] => [""];

export function DeliverComposer({
  kind,
  edit,
  onDone,
  onSaved,
}: {
  kind: DeliverKind;
  edit?: CoachDeliverable;
  onDone: () => void;
  /** 保存できたIDが判明する場合（＝編集時）にのみ呼ばれる。新規作成はaddDeliverable内でID採番されるため呼ばれない */
  onSaved?: (id: string) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const [title, setTitle] = useState(edit?.title ?? "");
  // target（groups-everywhere §4: 全員／グループ（複数選択）／個人）
  const [targetMode, setTargetMode] = useState<"team" | "group" | "one">(
    edit?.targetPlayerIds && edit.targetPlayerIds.length
      ? "one"
      : edit?.targetGroupIds && edit.targetGroupIds.length
        ? "group"
        : "team"
  );
  const [targetId, setTargetId] = useState(edit?.targetPlayerIds?.[0] ?? board.state.players[0]?.id ?? "");
  const [targetGroupIds, setTargetGroupIds] = useState<string[]>(edit?.targetGroupIds ?? []);

  // menu
  const [category, setCategory] = useState((edit as PracticeMenuDeliver)?.category ?? "");
  const [desc, setDesc] = useState((edit as PracticeMenuDeliver)?.desc ?? "");
  // assignment
  const [detail, setDetail] = useState((edit as AssignmentDeliver)?.detail ?? "");
  // meeting
  const [matchLabel, setMatchLabel] = useState((edit as MeetingDeliver)?.matchLabel ?? "");
  const [attack, setAttack] = useState<string[]>((edit as MeetingDeliver)?.attack ?? empty());
  const [defense, setDefense] = useState<string[]>((edit as MeetingDeliver)?.defense ?? empty());
  // setpiece
  const [spItem, setSpItem] = useState<SavedSetPiece | undefined>(
    (edit as SetPieceDeliver)?.setpiece
  );
  const [spMemo, setSpMemo] = useState((edit as SetPieceDeliver)?.memo ?? "");

  const targetPlayerIds = targetMode === "one" && targetId ? [targetId] : undefined;
  const targetGroupIdsOut = targetMode === "group" && targetGroupIds.length > 0 ? [...targetGroupIds] : undefined;

  const submit = () => {
    if (!title.trim()) {
      board.toast("タイトルを入力してください");
      return;
    }
    if (kind === "setpiece" && !spItem) {
      board.toast("セットプレーを選んでください");
      return;
    }
    if (targetMode === "group" && targetGroupIds.length === 0) {
      board.toast("グループを選んでください");
      return;
    }
    const base = {
      title: title.trim(),
      targetPlayerIds,
      targetGroupIds: targetGroupIdsOut,
      responses: edit?.responses ?? {},
    };
    let data: Omit<CoachDeliverable, "id" | "ts">;
    if (kind === "menu") {
      data = { kind, ...base, category: category.trim() || undefined, desc: desc.trim() || undefined } as Omit<PracticeMenuDeliver, "id" | "ts">;
    } else if (kind === "assignment") {
      data = { kind, ...base, detail: detail.trim() || undefined } as Omit<AssignmentDeliver, "id" | "ts">;
    } else if (kind === "setpiece") {
      data = {
        kind,
        ...base,
        setpiece: spItem,
        memo: spMemo.trim() || undefined,
      } as Omit<SetPieceDeliver, "id" | "ts">;
    } else {
      data = {
        kind,
        ...base,
        matchLabel: matchLabel.trim() || undefined,
        attack: attack.map((s) => s.trim()).filter(Boolean),
        defense: defense.map((s) => s.trim()).filter(Boolean),
      } as Omit<MeetingDeliver, "id" | "ts">;
    }
    if (edit) {
      board.updateDeliverable({ ...data, id: edit.id, ts: edit.ts } as CoachDeliverable);
      onSaved?.(edit.id);
    } else {
      board.addDeliverable(data);
    }
    onDone();
  };

  return (
    <div className="noteform">
      <h2>{DELIVER_KIND_LABEL[kind]}を{edit ? "編集" : "作成"}</h2>
      <div className="formfield">
        <label>タイトル</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例）3対2のポゼッション" />
      </div>

      <div className="formfield">
        <label>配信先</label>
        <div className="sendtgt">
          <label className={targetMode === "team" ? "on" : ""}>
            <input type="radio" checked={targetMode === "team"} onChange={() => setTargetMode("team")} />
            チーム全員
          </label>
          {team.groups.length > 0 && (
            <label className={targetMode === "group" ? "on" : ""}>
              <input type="radio" checked={targetMode === "group"} onChange={() => setTargetMode("group")} />
              グループ
            </label>
          )}
          <label className={targetMode === "one" ? "on" : ""}>
            <input type="radio" checked={targetMode === "one"} onChange={() => setTargetMode("one")} />
            個人
          </label>
        </div>
        {targetMode === "group" && (
          <GroupChips groups={team.groups} value={targetGroupIds} onChange={setTargetGroupIds} multi />
        )}
        {targetMode === "one" && (
          <select style={{ marginTop: 8 }} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {board.state.players.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {kind === "menu" && (
        <>
          <div className="formfield">
            <label>区分（任意）</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="例）3対2 / ポゼッション / ビルドアップ" />
          </div>
          <div className="formfield">
            <label>内容</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="メニューの狙い・やり方" />
          </div>
        </>
      )}

      {kind === "assignment" && (
        <div className="formfield">
          <label>課題の内容</label>
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} placeholder="例）1試合で前向きの縦パスを5本以上" />
        </div>
      )}

      {kind === "meeting" && (
        <>
          <div className="formfield">
            <label>対戦相手など（任意）</label>
            <input value={matchLabel} onChange={(e) => setMatchLabel(e.target.value)} placeholder="例）vs 青空FC" />
          </div>
          <DynList label="攻撃のポイント" items={attack} setItems={setAttack} placeholder="例）SB裏を狙う" />
          <DynList label="守備のポイント" items={defense} setItems={setDefense} placeholder="例）相手10番を自由にさせない" />
        </>
      )}

      {kind === "setpiece" && (
        <>
          <div className="formfield">
            <label>セットプレー</label>
            <select
              value={spItem?.id ?? ""}
              onChange={(e) => setSpItem(board.library.setPieces?.find((p) => p.id === e.target.value))}
            >
              <option value="">選択してください</option>
              {[...(board.library.setPieces ?? [])]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
            </select>
            {(board.library.setPieces ?? []).length === 0 && (
              <div className="planseote" style={{ margin: "6px 0 0" }}>
                保存されたセットプレーがありません。セットプレーデザイン画面で保存してから配信してください。
              </div>
            )}
          </div>
          <div className="formfield">
            <label>一言メモ（任意）</label>
            <textarea value={spMemo} onChange={(e) => setSpMemo(e.target.value)} rows={3} placeholder="例）ニアで潰れて、逆サイドに合わせる" />
          </div>
        </>
      )}

      <button className="bigbtn" onClick={submit}>
        {edit ? "更新する" : "配信する"}
      </button>
    </div>
  );
}

function DynList({
  label,
  items,
  setItems,
  placeholder,
}: {
  label: string;
  items: string[];
  setItems: (v: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="formfield">
      <label>{label}</label>
      {items.map((v, i) => (
        <div key={i} className="dynrow">
          <input value={v} onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} placeholder={placeholder} />
          <button className="dynx" onClick={() => setItems(items.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button className="dynadd" onClick={() => setItems([...items, ""])}>＋ 追加</button>
    </div>
  );
}

/* ====== 詳細（選手＝回答 / コーチ＝結果） ====== */
export function DeliverDetail({
  id,
  onBack,
  onWritePractice,
}: {
  id: string;
  onBack: () => void;
  /** 練習メニュー配信から「このメニューで練習ノートを書く」を選んだときに呼ばれる */
  onWritePractice?: (menuId: string) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const d = board.deliverables.find((x) => x.id === id);
  const isCoach = board.auth.role === "coach";
  if (!d) return <div className="empty-msg">配信が見つかりません。</div>;
  // groups-everywhere §4: 宛先の表示にグループ宛（targetGroupIds）も含める
  const targetGroupLabels = (d.targetGroupIds ?? [])
    .map((gid) => team.groups.find((g) => g.id === gid)?.label)
    .filter((l): l is string => !!l);
  return (
    <div className="notedetail">
      <div className="notedhead">
        <span className={`dlvtag ${d.kind}`}>{DELIVER_KIND_LABEL[d.kind]}</span>
        <div>
          <div className="notewho">{d.title}</div>
          {d.targetPlayerIds?.length ? (
            <div className="notedate">
              宛: {d.targetPlayerIds.map((pid) => board.state.players.find((p) => p.id === pid)?.name ?? "選手").join("、")}
            </div>
          ) : targetGroupLabels.length > 0 ? (
            <div className="notedate">宛: {targetGroupLabels.join("・")}</div>
          ) : (
            <div className="notedate">チーム全員</div>
          )}
        </div>
      </div>

      {d.kind === "menu" && <MenuBody d={d} isCoach={isCoach} />}
      {d.kind === "assignment" && <AssignmentBody d={d} isCoach={isCoach} />}
      {d.kind === "meeting" && <MeetingBody d={d} isCoach={isCoach} />}
      {d.kind === "setpiece" && <SetPieceDeliverBody d={d} isCoach={isCoach} />}

      {d.kind === "menu" && !isCoach && (
        <button className="bigbtn ghost" style={{ marginTop: 12 }} onClick={() => onWritePractice?.(d.id)}>
          このメニューで練習ノートを書く
        </button>
      )}

      {isCoach && (
        <button className="linkdanger" style={{ marginTop: 16 }} onClick={() => { board.removeDeliverable(d.id); onBack(); }}>
          配信を削除する
        </button>
      )}
    </div>
  );
}

function Stars({ value, onChange, max = 5 }: { value: number; onChange?: (n: number) => void; max?: number }) {
  return (
    <div className="stars">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={`star${value >= n ? " on" : ""}`}
          onClick={onChange ? () => onChange(n) : undefined}
          disabled={!onChange}
        >
          ●
        </button>
      ))}
    </div>
  );
}

/* --- ③ 練習メニュー --- */
function MenuBody({ d, isCoach }: { d: PracticeMenuDeliver; isCoach: boolean }) {
  const board = useBoard();
  const me = board.auth.playerId ?? "";
  const mine = d.responses[me];
  const [understanding, setU] = useState(mine?.understanding ?? 3);
  const [difficulty, setDiff] = useState(mine?.difficulty ?? 3);
  const [comment, setComment] = useState(mine?.comment ?? "");

  return (
    <>
      {d.category && <div className="notesec"><div className="notesec-h">区分</div><div className="notesec-b">{d.category}</div></div>}
      {d.desc && <div className="notesec"><div className="notesec-h">内容</div><div className="notesec-b">{d.desc}</div></div>}

      {isCoach ? (
        <ResultsList d={d} render={(r) => `理解度 ${r.understanding}/5 ・ 難易度 ${r.difficulty}/5${r.comment ? ` ・「${r.comment}」` : ""}`} />
      ) : (
        <div className="notesec">
          <div className="notesec-h">理解度</div>
          <Stars value={understanding} onChange={setU} />
          <div className="notesec-h" style={{ marginTop: 10 }}>難易度</div>
          <Stars value={difficulty} onChange={setDiff} />
          <textarea style={{ marginTop: 10 }} value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="感想（任意）" />
          <button className="bigbtn" style={{ marginTop: 8 }} onClick={() => board.respondDeliverable(d.id, me, { understanding, difficulty, comment: comment.trim() || undefined, ts: Date.now() })}>
            {mine ? "回答を更新" : "回答する"}
          </button>
        </div>
      )}
    </>
  );
}

/* --- ⑤ 個人課題 --- */
function AssignmentBody({ d, isCoach }: { d: AssignmentDeliver; isCoach: boolean }) {
  const board = useBoard();
  const me = board.auth.playerId ?? "";
  const mine = d.responses[me];
  const [status, setStatus] = useState<AssignmentStatus>(mine?.status ?? "partial");
  const [comment, setComment] = useState(mine?.comment ?? "");
  const STATUSES: AssignmentStatus[] = ["done", "partial", "none"];

  return (
    <>
      {d.detail && <div className="notesec"><div className="notesec-h">課題</div><div className="notesec-b">{d.detail}</div></div>}
      {isCoach ? (
        <ResultsList d={d} render={(r) => `${ASSIGNMENT_STATUS_LABEL[r.status]}${r.comment ? ` ・「${r.comment}」` : ""}`} />
      ) : (
        <div className="notesec">
          <div className="notesec-h">取り組み</div>
          <div className="condrow">
            {STATUSES.map((s) => (
              <button key={s} type="button" className={`condbtn${status === s ? " on" : ""}`} onClick={() => setStatus(s)}>
                {ASSIGNMENT_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <textarea style={{ marginTop: 10 }} value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="コメント（任意）" />
          <button className="bigbtn" style={{ marginTop: 8 }} onClick={() => board.respondDeliverable(d.id, me, { status, comment: comment.trim() || undefined, ts: Date.now() })}>
            {mine ? "回答を更新" : "回答する"}
          </button>
        </div>
      )}
    </>
  );
}

/* --- ⑦ 試合前ミーティング --- */
function MeetingBody({ d, isCoach }: { d: MeetingDeliver; isCoach: boolean }) {
  const board = useBoard();
  const me = board.auth.playerId ?? "";
  const mine = d.responses[me];
  const [execution, setExecution] = useState(mine?.execution ?? "");

  return (
    <>
      {d.matchLabel && <div className="notesec"><div className="notesec-h"><E n="vs" /> {d.matchLabel}</div></div>}
      {d.attack.length > 0 && (
        <div className="notesec"><div className="notesec-h"><E n="attack" /> 攻撃</div>{d.attack.map((a, i) => <div key={i} className="notesec-b">・{a}</div>)}</div>
      )}
      {d.defense.length > 0 && (
        <div className="notesec"><div className="notesec-h"><E n="shield" /> 守備</div>{d.defense.map((a, i) => <div key={i} className="notesec-b">・{a}</div>)}</div>
      )}
      {isCoach ? (
        <ResultsList d={d} render={(r) => `${r.ack ? "確認済み" : "未確認"}${r.execution ? ` ・ 実行:「${r.execution}」` : ""}`} />
      ) : (
        <div className="notesec">
          {!mine?.ack ? (
            <button className="bigbtn" onClick={() => board.respondDeliverable(d.id, me, { ack: true, ts: Date.now() })}>
              ✓ 確認しました
            </button>
          ) : (
            <>
              <div className="notesec-h"><E n="check" /> 確認済み — 試合後：実行できた？</div>
              <textarea value={execution} onChange={(e) => setExecution(e.target.value)} rows={2} placeholder="実行できたこと・できなかったこと" />
              <button className="bigbtn" style={{ marginTop: 8 }} onClick={() => board.respondDeliverable(d.id, me, { ack: true, execution: execution.trim() || undefined, ts: Date.now() })}>
                実行を記録
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

/* --- ④(応用) セットプレー配信: 静的PNG+メモ+既読/理解度回答（MenuBodyの回答UIを流用） --- */
function SetPieceDeliverBody({ d, isCoach }: { d: SetPieceDeliver; isCoach: boolean }) {
  const board = useBoard();
  const me = board.auth.playerId ?? "";
  const mine = d.responses[me];
  const [understanding, setU] = useState(mine?.understanding ?? 3);
  const [difficulty] = useState(mine?.difficulty ?? 3);
  const [comment, setComment] = useState(mine?.comment ?? "");

  // ライブラリのSetPiecePreview/チャット添付と同じ「SavedPlay(構造的に共通)からBoardState再構成」
  // レシピ。名簿・チーム名・キャプテンは埋め込みに含まれないため現在のボード状態から補う
  const pngUrl = useMemo(() => {
    if (!d.setpiece) return null;
    try {
      const sp = d.setpiece;
      const state: BoardState = {
        ...board.state,
        formation: sp.formation,
        slots: sp.slots,
        ball: sp.ball,
        moves: sp.moves,
        holder: sp.holder ?? null,
        opponents: sp.opponents ?? [],
        drawings: sp.drawings ?? [],
        shapes: sp.shapes ?? [],
        stepCount: sp.stepCount ?? 1,
        guides: sp.guides ?? {},
        pitchView: sp.pitchView ?? "full",
        setPiece: sp.setPiece,
      };
      return renderTacticPng(state);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.setpiece, board.state]);

  return (
    <>
      {pngUrl ? (
        <div className="shareprev">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pngUrl} alt={d.setpiece?.title ?? d.title} />
        </div>
      ) : (
        <div className="notesec">
          <div className="notesec-b">セットプレーの図を表示できません</div>
        </div>
      )}
      {d.memo && (
        <div className="notesec">
          <div className="notesec-h">メモ</div>
          <div className="notesec-b">{d.memo}</div>
        </div>
      )}

      {isCoach ? (
        <ResultsList
          d={d}
          render={(r) => `理解度 ${r.understanding}/5${r.comment ? ` ・「${r.comment}」` : ""}`}
        />
      ) : (
        <div className="notesec">
          <div className="notesec-h">理解度</div>
          <Stars value={understanding} onChange={setU} />
          <textarea style={{ marginTop: 10 }} value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="感想（任意）" />
          <button
            className="bigbtn"
            style={{ marginTop: 8 }}
            onClick={() =>
              board.respondDeliverable(d.id, me, {
                understanding,
                difficulty,
                comment: comment.trim() || undefined,
                ts: Date.now(),
              })
            }
          >
            {mine ? "回答を更新" : "回答する"}
          </button>
        </div>
      )}
    </>
  );
}

/* コーチ向け：回答者一覧の汎用表示 */
function ResultsList<T>({
  d,
  render,
}: {
  d: { responses: Record<string, T> };
  render: (r: T) => string;
}) {
  const board = useBoard();
  const entries = Object.entries(d.responses);
  if (entries.length === 0) return <div className="empty-msg" style={{ padding: "8px 0" }}>まだ回答がありません。</div>;
  return (
    <div className="notesec">
      <div className="notesec-h">回答一覧</div>
      {entries.map(([pid, r]) => (
        <div key={pid} className="resrow">
          <span className="resnm">{board.state.players.find((p) => p.id === pid)?.name ?? "選手"}</span>
          <span className="resval">{render(r)}</span>
        </div>
      ))}
    </div>
  );
}
