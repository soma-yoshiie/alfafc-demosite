"use client";

import { useMemo, useState } from "react";
import type {
  AssignmentDeliver,
  AssignmentStatus,
  CoachDeliverable,
  DeliverKind,
  MeetingDeliver,
  PracticeMenuDeliver,
  QuizDeliver,
  QuizQuestion,
} from "@/lib/types";
import {
  ASSIGNMENT_STATUS_LABEL,
  DELIVER_KIND_LABEL,
  deliverTargets,
} from "@/lib/types";
import { useBoard } from "./BoardProvider";
import { E } from "./Emoji";

/* ====== 一覧ブロック（練習タブ・試合タブに埋め込む） ====== */
export function DeliverBlock({
  kinds,
  onOpen,
  onCreate,
}: {
  kinds: DeliverKind[];
  onOpen: (id: string) => void;
  onCreate: (kind: DeliverKind) => void;
}) {
  const board = useBoard();
  const isCoach = board.auth.role === "coach";
  const me = board.auth.playerId ?? "";

  const items = useMemo(() => {
    let list = board.deliverables.filter((d) => kinds.includes(d.kind));
    if (!isCoach) list = list.filter((d) => deliverTargets(d, me));
    return [...list].sort((a, b) => b.ts - a.ts);
  }, [board.deliverables, kinds, isCoach, me]);

  return (
    <div className="dlvblock">
      <div className="dlvblock-h">
        <span><E n="megaphone" /> コーチから</span>
      </div>
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
          <DeliverCard key={d.id} d={d} isCoach={isCoach} me={me} onClick={() => onOpen(d.id)} />
        ))
      )}
    </div>
  );
}

function DeliverCard({
  d,
  isCoach,
  me,
  onClick,
}: {
  d: CoachDeliverable;
  isCoach: boolean;
  me: string;
  onClick: () => void;
}) {
  const board = useBoard();
  const respondedCount = Object.keys(d.responses).length;
  const targets = board.state.players.filter((p) => deliverTargets(d, p.id)).length;
  const mineDone = !!d.responses[me];
  return (
    <button className="dlvcard" onClick={onClick}>
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
}: {
  kind: DeliverKind;
  edit?: CoachDeliverable;
  onDone: () => void;
}) {
  const board = useBoard();
  const [title, setTitle] = useState(edit?.title ?? "");
  // target
  const [targetMode, setTargetMode] = useState<"team" | "one">(
    edit?.targetPlayerIds && edit.targetPlayerIds.length ? "one" : "team"
  );
  const [targetId, setTargetId] = useState(edit?.targetPlayerIds?.[0] ?? board.state.players[0]?.id ?? "");

  // menu
  const [category, setCategory] = useState((edit as PracticeMenuDeliver)?.category ?? "");
  const [desc, setDesc] = useState((edit as PracticeMenuDeliver)?.desc ?? "");
  // assignment
  const [detail, setDetail] = useState((edit as AssignmentDeliver)?.detail ?? "");
  // meeting
  const [matchLabel, setMatchLabel] = useState((edit as MeetingDeliver)?.matchLabel ?? "");
  const [attack, setAttack] = useState<string[]>((edit as MeetingDeliver)?.attack ?? empty());
  const [defense, setDefense] = useState<string[]>((edit as MeetingDeliver)?.defense ?? empty());
  // quiz
  const [questions, setQuestions] = useState<QuizQuestion[]>(
    (edit as QuizDeliver)?.questions ?? [{ q: "", options: ["", ""], correct: 0 }]
  );

  const targetPlayerIds = targetMode === "one" && targetId ? [targetId] : undefined;

  const submit = () => {
    if (!title.trim()) {
      board.toast("タイトルを入力してください");
      return;
    }
    const base = { title: title.trim(), targetPlayerIds, responses: edit?.responses ?? {} };
    let data: Omit<CoachDeliverable, "id" | "ts">;
    if (kind === "menu") {
      data = { kind, ...base, category: category.trim() || undefined, desc: desc.trim() || undefined } as Omit<PracticeMenuDeliver, "id" | "ts">;
    } else if (kind === "assignment") {
      data = { kind, ...base, detail: detail.trim() || undefined } as Omit<AssignmentDeliver, "id" | "ts">;
    } else if (kind === "meeting") {
      data = {
        kind,
        ...base,
        matchLabel: matchLabel.trim() || undefined,
        attack: attack.map((s) => s.trim()).filter(Boolean),
        defense: defense.map((s) => s.trim()).filter(Boolean),
      } as Omit<MeetingDeliver, "id" | "ts">;
    } else {
      const qs = questions
        .map((q) => ({ q: q.q.trim(), options: q.options.map((o) => o.trim()).filter(Boolean), correct: q.correct }))
        .filter((q) => q.q && q.options.length >= 2);
      if (qs.length === 0) {
        board.toast("設問と選択肢を入力してください");
        return;
      }
      data = { kind, ...base, questions: qs } as Omit<QuizDeliver, "id" | "ts">;
    }
    if (edit) board.updateDeliverable({ ...data, id: edit.id, ts: edit.ts } as CoachDeliverable);
    else board.addDeliverable(data);
    onDone();
  };

  return (
    <div className="noteform">
      <h2>{DELIVER_KIND_LABEL[kind]}を{edit ? "編集" : "作成"}</h2>
      <div className="formfield">
        <label>タイトル</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "quiz" ? "例）ポジション理解度テスト" : "例）3対2のポゼッション"} />
      </div>

      <div className="formfield">
        <label>配信先</label>
        <div className="sendtgt">
          <label className={targetMode === "team" ? "on" : ""}>
            <input type="radio" checked={targetMode === "team"} onChange={() => setTargetMode("team")} />
            チーム全員
          </label>
          <label className={targetMode === "one" ? "on" : ""}>
            <input type="radio" checked={targetMode === "one"} onChange={() => setTargetMode("one")} />
            個人
          </label>
        </div>
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

      {kind === "quiz" && (
        <QuizEditor questions={questions} setQuestions={setQuestions} />
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

function QuizEditor({
  questions,
  setQuestions,
}: {
  questions: QuizQuestion[];
  setQuestions: (q: QuizQuestion[]) => void;
}) {
  const setQ = (i: number, patch: Partial<QuizQuestion>) =>
    setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  return (
    <div className="formfield">
      <label>設問</label>
      {questions.map((q, i) => (
        <div key={i} className="phasecard">
          <div className="phasehd">
            <span>Q{i + 1}</span>
            {questions.length > 1 && (
              <button className="dynx" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>×</button>
            )}
          </div>
          <input value={q.q} onChange={(e) => setQ(i, { q: e.target.value })} placeholder="例）右SB保持時、左WGはどこに立つ？" />
          <div className="quizopts">
            {q.options.map((o, oi) => (
              <div key={oi} className="dynrow">
                <button
                  type="button"
                  className={`quizcorrect${q.correct === oi ? " on" : ""}`}
                  onClick={() => setQ(i, { correct: oi })}
                  title="正解に設定"
                >
                  {q.correct === oi ? "正解" : "○"}
                </button>
                <input
                  value={o}
                  onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === oi ? e.target.value : x)) })}
                  placeholder={`選択肢${oi + 1}`}
                />
                {q.options.length > 2 && (
                  <button className="dynx" onClick={() => setQ(i, { options: q.options.filter((_, j) => j !== oi) })}>×</button>
                )}
              </div>
            ))}
            <button className="dynadd" onClick={() => setQ(i, { options: [...q.options, ""] })}>＋ 選択肢</button>
          </div>
        </div>
      ))}
      <button className="dynadd" onClick={() => setQuestions([...questions, { q: "", options: ["", ""], correct: 0 }])}>
        ＋ 設問を追加
      </button>
    </div>
  );
}

/* ====== 詳細（選手＝回答 / コーチ＝結果） ====== */
export function DeliverDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const board = useBoard();
  const d = board.deliverables.find((x) => x.id === id);
  const isCoach = board.auth.role === "coach";
  if (!d) return <div className="empty-msg">配信が見つかりません。</div>;
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
          ) : (
            <div className="notedate">チーム全員</div>
          )}
        </div>
      </div>

      {d.kind === "menu" && <MenuBody d={d} isCoach={isCoach} />}
      {d.kind === "assignment" && <AssignmentBody d={d} isCoach={isCoach} />}
      {d.kind === "meeting" && <MeetingBody d={d} isCoach={isCoach} />}
      {d.kind === "quiz" && <QuizBody d={d} isCoach={isCoach} />}

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

/* --- ⑨ 理解度テスト --- */
function QuizBody({ d, isCoach }: { d: QuizDeliver; isCoach: boolean }) {
  const board = useBoard();
  const me = board.auth.playerId ?? "";
  const mine = d.responses[me];
  const [answers, setAnswers] = useState<number[]>(mine?.answers ?? d.questions.map(() => -1));

  if (isCoach) {
    // チーム可視化：設問ごとの正答率
    const responders = Object.entries(d.responses);
    return (
      <>
        <div className="notesec">
          <div className="notesec-h">チーム理解度（回答 {responders.length}人）</div>
          {d.questions.map((q, qi) => {
            const answered = responders.filter(([, r]) => r.answers[qi] != null && r.answers[qi] >= 0);
            const correct = answered.filter(([, r]) => r.answers[qi] === q.correct).length;
            const rate = answered.length ? Math.round((correct / answered.length) * 100) : 0;
            return (
              <div key={qi} className="notesec-b">
                Q{qi + 1}. {q.q}
                <div className="achbar" style={{ marginTop: 4 }}>
                  <span style={{ width: rate + "%" }} />
                </div>
                <div className="dlvsub">正答率 {rate}%（正解：{q.options[q.correct]}）</div>
              </div>
            );
          })}
        </div>
        <ResultsList
          d={d}
          render={(r) => {
            const sc = d.questions.reduce((n, q, qi) => n + (r.answers[qi] === q.correct ? 1 : 0), 0);
            return `${sc}/${d.questions.length} 正解`;
          }}
        />
      </>
    );
  }

  const submitted = !!mine;
  const score = submitted ? d.questions.reduce((n, q, qi) => n + (mine!.answers[qi] === q.correct ? 1 : 0), 0) : 0;
  return (
    <div className="notesec">
      {d.questions.map((q, qi) => (
        <div key={qi} className="quizq">
          <div className="quizqh">Q{qi + 1}. {q.q}</div>
          {q.options.map((o, oi) => {
            const chosen = (submitted ? mine!.answers : answers)[qi] === oi;
            const showCorrect = submitted && oi === q.correct;
            const wrongChosen = submitted && chosen && oi !== q.correct;
            return (
              <button
                key={oi}
                type="button"
                className={`quizopt${chosen ? " chosen" : ""}${showCorrect ? " correct" : ""}${wrongChosen ? " wrong" : ""}`}
                disabled={submitted}
                onClick={() => setAnswers(answers.map((a, j) => (j === qi ? oi : a)))}
              >
                {o}
                {showCorrect ? " ✓" : wrongChosen ? " ✗" : ""}
              </button>
            );
          })}
        </div>
      ))}
      {submitted ? (
        <div className="aibox">スコア：{score} / {d.questions.length} 正解</div>
      ) : (
        <button
          className="bigbtn"
          onClick={() => {
            if (answers.some((a) => a < 0)) {
              board.toast("すべての設問に回答してください");
              return;
            }
            board.respondDeliverable(d.id, me, { answers, ts: Date.now() });
          }}
        >
          回答する
        </button>
      )}
    </div>
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
