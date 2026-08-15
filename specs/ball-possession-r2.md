# 実装指示書: ボール所有モデル R2（受け手タップでパス／ゴールタップでシュート）

作成: PM（2026-07-09）／前提: R1（holder / Move.to / MoveKind "shot" / holderAt / 追従再生）実装済み

## 概要
アニメモードで「その場面の保持者」を選択中に、別の味方をタップするとパスを、敵陣ゴールをタップするとシュートを自動生成する。生成物は通常の Move（ボールのルート）なので、タイムライン・選択編集・削除は既存機構がそのまま使える。

## 1. 保持者の判定ヘルパー
- BoardProvider に `holderAtStep(step: number): Actor | null` を実装（`holderAt(stepStartTime(moves, step), moves, state.holder)`）。context に公開

## 2. パス生成（components/BoardProvider.tsx に `passTo(receiver: Actor)` を実装し context 公開）
- 前提条件（呼び出し側でガード）: mode==="anim"、`selActor === holderAtStep(activeStep)`、receiver は pid のある slot（味方のみ。相手・ボールは対象外）、receiver !== selActor
- 生成内容:
  - 出し手の場面内ルート終了オフセット `endOff` = 出し手のこの場面 move があれば `start + dur`、なければ 0
  - 出し手位置 = `actorPos(出し手, stepStartTime + endOff, ...)`（＝ルート終点 or 現在位置）
  - 受け手ターゲット = 受け手のこの場面 move があれば**その path 終点**（走り込みの先）、なければ `actorPos(受け手, stepStartTime, ...)`
  - ball move を追加: `{ actor:"ball", path:[出し手位置, ターゲット], start: endOff, dur: max(0.4, durFromPath(path) * 0.5), kind:"pass", step: activeStep, to: receiver }`
  - 既存 ADD_MOVE は同actor同stepを置換する仕様なのでボールも1場面1本（置換）。`to`/`kind`/`start` を渡せるよう ADD_MOVE を拡張するか、専用アクション `ADD_BALL_MOVE` を追加（実装しやすい方。reducer の重複は避ける）
  - 実行後: `setSelActor(receiver)`・`setSelMove(null)`（受け手を選択して連鎖しやすく）、`playStep(activeStep)` で即プレビュー、toast「◯◯へパス」
- 受け手が同場面で走るルートを後から描いた/変えた場合の再同期は**しない**（生成時点の座標で確定。作り直しは削除→再タップ）

## 3. シュート生成（`shoot()` を実装し context 公開）
- 前提: mode==="anim"、`selActor === holderAtStep(activeStep)`
- 生成: ターゲット `{ x: 50, y: 97 }`。ball move `{ path:[出し手位置, ターゲット], start: endOff, dur: max(0.3, durFromPath * 0.35), kind:"shot", step: activeStep, to: "goal" }`（パスと同じ置換規則）
- 実行後: `setSelActor(null)`、`playStep(activeStep)`、toast「シュート！」
- **ゴールタップ検知**: `components/Pitch.tsx` の `.pitch` に onPointerDown/Up のタップ判定（移動 6px 未満）を追加し、mode==="anim" かつ selActor が保持者 かつ penMode でない かつ タップ位置がゴールゾーン（データ座標で y > 90 かつ 35 < x < 65。half 表示でも `topToY` で判定）のとき `board.shoot()`。それ以外のタップは従来どおり（何もしない／既存の図形選択解除リスナーとは独立に共存）

## 4. タップの割り込み（components/usePointerDrag.ts）
- anim モードのタップ分岐（選択トグルの直前）に追加: `!st.moved && board.pendingShapeRef.current == null && board.selActor != null && board.selActor === board.holderAtStep(board.activeStep) && actor が pid のある slot && actor !== board.selActor` → `board.passTo(actor)` して return
- 優先順位: 図形の選手タップ待ち ＞ パス ＞ 通常の選択トグル

## 5. shot 線種の描画（二重線）
shot の path は常に2点直線。線の法線方向に ±0.55 オフセットした平行2本の実線＋既存の三角矢頭で「二重線」を描く:
- `components/PathLayer.tsx`（画面）: kind==="shot" の分岐を追加
- `lib/renderFrame.ts` / `lib/exportImage.ts`（出力）: 同様に2本線＋矢頭
- 色は actorColor（ボール=白）のまま
- 凡例（`components/GuideLayer.tsx` の legendbox と renderFrame / exportImage の凡例）に4行目「シュート＝二重線」を追加

## 6. UI 補助
- `components/AnimationStudio.tsx`: selrow の線種チップは、選択 move が ball のとき run/pass/dribble に加えて「シュート」チップを表示（ball 以外には出さない。KIND_LABEL の型を調整）
- アニメモードで**保持者を選択した瞬間**に1セッション1回だけ toast「別の選手をタップでパス／ゴールをタップでシュート」（ref フラグで抑制）
- `components/PlayerToken.tsx` / `OppToken.tsx` の hasball マーク: アニメモードでは `holderAtStep(activeStep) === actor`、編集モードでは従来どおり `state.holder === actor` で表示（場面ごとの保持者が分かる）

## 7. 受け入れ条件
- [ ] 保持者選択→味方タップで破線パスが生成され、再生でボールが受け手（走り込みがあればその先）へ渡り、以降は受け手に追従（連鎖）
- [ ] 保持者選択→ゴールゾーンタップでシュート（二重線・高速）が生成され再生される
- [ ] パス/シュートの move はタイムラインに載り、選択・削除・タイミング調整が従来どおり効く。削除すれば保持連鎖も元に戻る
- [ ] 保持者以外を選択中のタップ・保持なし状態のタップは従来の選択トグルのまま
- [ ] shot 線種が画面・PNG・GIF・凡例に反映
- [ ] 旧データ完全互換・`npx tsc --noEmit` クリーン

## 8. やらないこと
- 受け手ルート変更時のパス自動再同期、相手へのパス（インターセプト表現）、ワンツー等の高次アクション、上記以外の変更
