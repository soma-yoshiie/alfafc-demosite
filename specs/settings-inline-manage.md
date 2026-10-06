# 設定の中で「学年・グループ／予定の種類／大会／順位表／体力テストの種目」を編集する・PC の設定の見出しを区別する

2026-10-06。正本はこのファイル。前提は specs/settings-plan-a.md（§9 が実装時の判断）。

## 0. 依頼（ユーザーの言葉）

- 「設定で現在チームの要素を押すとその項目に飛ぶようになっているがページが切り替わると使い勝手が悪いので、設定のページ内で編集できるようにして（今の飛んだ時と同じ編集ページで、編集内容はきちんと同期されて連携するようにね）」
- 「pc版の設定のチーム、メンバー、その他などの目次が他の押せる選択肢と被って見づらいからわかるようにして」

統括の読み：設定の「学年・グループ」「予定の種類」「大会」「順位表」「体力テストの種目」は、チーム運営へ移らずに設定の下層として同じ編集画面を出す。編集画面は TeamHub の管理シートの中身そのもの（別物を作らない）。保存先は今までどおり TeamProvider（`TeamData`）なので、チーム運営側とは自動で同期する。PC の左の列は、区画の見出しと押せる項目を見分けられる見た目にする。

## §1 管理シートの中身を部品に切り出す（components/team/manage/）

`components/TeamHub.tsx` の `SheetHost` の中にインラインで書かれている 5 つのシートの中身を、状態ごと独立した部品にする。**見た目・挙動・保存の仕方は変えない**（チーム運営側の受け入れ検証 p14／p15／p16 が通ること）。

| 部品 | 元の場所（TeamHub.tsx） | 持ち出す状態・補助 |
|---|---|---|
| `GroupsManage` | 5158-5354（`sheet?.type === "groups"` の `<Sheet>` の中身） | `groupMembersId`／`groupColorPickId`／`groupSwatchesRef`／`newGroupLabel`／`groupEditId`／`groupEditLabel` と、`GroupMembersEditor`（4076-4185 → `components/team/manage/GroupMembersEditor.tsx` に移して export） |
| `CategoriesManage` | 5012-5152 | `newCatLabel`／`newCatColor`／`catEditId`／`catEditLabel`／`catEditColor`／`catEditNote`／`newCatNote`／`catEditRowRef` と、`ColorChoiceList`（2190-2260 → `components/team/ColorChoiceList.tsx` に移して export。CalendarTab など TeamHub 内の他の利用箇所は import に替える） |
| `CompetitionsManage` | 6623-6750 付近 | `mgrComp`／`compEditId`／`compEditName`／`compEditNote` |
| `LeagueEdit` | 6380-6620 | `lgTitle`／`lgRows`／`lgMode`／`lgResults`／`lgImportComp`／`lgWarn` と `lgChangeMode` など。補助関数 `leagueDraftRows`／`leagueDraftResultsLoose`／`parseLeagueInt`（3119-3167）と型 `LeagueDraftRow`／`LeagueResultDraft` は `lib/leagueDraft.ts` に移して、TeamHub（RecSummaryPane など）と部品の両方から import |
| `FitnessTestsManage` | 5358-5500 付近 | `newTestName`／`testEditId`／`testEditName` と、種目の単位・向きなどの編集状態 |

部品の約束：

```ts
type ManageProps = {
  players: Player[];           // GroupsManage だけ必須（メンバー編集）。ほかは省略可
  /** 設定の中で出すとき true：中の <h2>（「グループ管理」など）を出さない（ヘッダーに画面名があるため） */
  hideTitle?: boolean;
  /** 保存して閉じる操作があるとき（順位表の「保存する」）：保存後に呼ぶ */
  onSaved?: () => void;
  /** 未保存の変更の有無を知らせる（順位表だけ。設定の未保存の確認に使う） */
  onDirty?: (dirty: boolean) => void;
  /** 「戻る」を部品の中で先に処理したいとき（グループのメンバー編集中 → 一覧へ）。親が back のときに呼び、true を返したら親は閉じない */
  backRef?: MutableRefObject<(() => boolean) | null>;
};
```

- データは部品の中で `useTeam()`／`useBoard()` から読む・書く（props で渡さない）。これが「同期」の担保。
- `SheetHost` は各 `<Sheet open onClose pane>` の中で部品を描画するだけにする。`paneBack` の「メンバー編集中なら一覧へ戻す」は `backRef` で部品に委ねる（`groupMembersId` は `SheetHost` から消える）。`sheetKey`（1214-1240。groups／categories の再マウント防止）は変えない。
- 予定フォームから「＋ 管理」で開いたときの戻り先（`from`／`date`／`returnToPlayerForm`）の扱いは `SheetHost`／`paneBack` に残す（部品は知らない）。
- 順位表の「保存する」の後の動き（チーム運営では閉じる）は `onSaved` で親が決める。順位表の未保存の確認は、今チーム運営に無ければ足さない（設定側は `onDirty` を使う。順位表の下書きが保存値と違うときに true）。

## §2 設定の下層として出す（components/SettingsScreen.tsx・components/settings/）

- `SettingsView` に `{ mode: "groups" }`／`"categories"`／`"competitions"`／`"league"`／`"fitnessTests"` を足す。`VIEW_TITLE`：学年・グループ／予定の種類／大会／順位表／体力テストの種目。`VIEW_CAT`：それぞれ同名のカテゴリ。
- `openTeamSheet` と `teamIntent.openSheet` への遷移は**やめる**（`SHEET_CATS`／`SHEET_TAB` を削除。`BoardProvider` の `openSheet` 型と `TeamHub` の消費コードは、サッカーノートの「絞り込みを編集…」が `openSheet: "groups"` を使い続けるので残す）。
- 一覧の行（`SettingsTop`）は `go({ mode: "groups" })` などに替える。PC の左の列はこれらを `DIRECT_VIEW` に入れる（押した時点で右に編集画面。戻りは出さない）。
- 下層の描画：`renderSub` で `<div className="st-manage"><GroupsManage players={board.state.players} hideTitle backRef={backRef} /></div>` のように出す。スマホの戻る（ヘッダー）と PC の `go({mode:"top"})` の前に `backRef.current?.()` を呼び、true なら画面を変えない。
- 順位表：スマホはヘッダー右上の「保存」ではなく、部品の中の「保存する」ボタンをそのまま使う（`HAS_SAVE` には入れない）。`onSaved` はスマホ＝一覧へ戻す、PC＝そのまま。`onDirty` は設定の `dirtyRef` につなぐ。
- 行の右の値（「中1・中2・中3・…」「練習・試合 ほか 2」「2 件」「リーグ順位表」「10 種目」）は、下層で編集して戻ると更新される（`useTeam()` の値から計算しているので自動）。

## §3 PC の左の列の見出し（app/globals.css）

- `.st-navh`（「チーム」「メンバー」「その他」）を押せる項目と見分けられる形にする：12px（`var(--fs-body-s)`。契約の下限）・`--mut`・700・字間 0.08em・上に 1px の `--outline` の線（最初の見出しは線なし）・余白 上 14px／下 4px・左 10px。項目 `.st-navitem` は左 14px の余白にして見出しより一段下げ、hover で `--surface-low` の地。選択中は今のまま（`--accent-tint`＋`--accent`）。
- 押せない見出しに `cursor: default`、`aria-hidden` は付けない（読み上げでは区画名として読ませる）。

## §4 CSS（app/globals.css）

- 設定の中で管理シートの中身が崩れないよう、必要な分だけ `.st-manage` の下に基底で足す（`.list`／`.catrow`／`.dynrow`／`.dynadd`／`.formfield`／`.bigbtn` は基底の全体ルールなので多くはそのまま効く）。`.st-manage .bigbtn` は設定の主ボタンと同じ見た目（青・14px・角丸 `--r-md`・スマホ 44px／PC 32px）に寄せる。
- 契約は今までどおり（@media 9 本、1 本目の PC ブロック無編集、基底→PC reset→coarse、トークンの色、12px 以上、スマホ 44px、PC 四角）。

## §5 受け入れ基準

1. `npx tsc --noEmit` が通る。`grep -c "^@media" app/globals.css` が 9。
2. 設定の「学年・グループ」「予定の種類」「大会」「順位表」「体力テストの種目」を押すと、画面が設定のまま（PC は右ペイン、スマホは下層）で、チーム運営の管理シートと同じ編集画面が出る。
3. 設定でグループ名を変える・種類を足す・大会を登録する・順位表を保存する・種目を足すと、チーム運営の該当画面（絞り込みのグループ名、予定フォームの種類、試合記録の大会、順位表、個人ページの種目）に反映される。逆（チーム運営で変える）も設定の行の値に反映される。
4. チーム運営側の管理シートは今までどおり動く（予定フォームの「＋ 管理」から戻ると編集中の予定に戻る、選手フォームの「＋ 管理」から戻ると選手フォームに戻る、グループのメンバー編集の「戻る」は一覧へ）。p14・p15・p16 の受け入れ検証が通る。
5. PC の設定の左の列で、見出し（チーム／メンバー／その他）が項目と見分けられる（小さい灰色・上の線・項目は一段下がる）。
6. サッカーノートの「絞り込みを編集…」は今までどおりチーム運営のグループ管理を開く。

---

## §6 実装時の判断（2026-10-06。以後はここが正）

実装は Sonnet 5.5（WP1 部品化／WP2 設定への組み込み）、レビューは Opus 5.5（挙動不変・設定への組み込み・CSS の 3 観点。指摘 10 件に反証し 9 件が残存、うち major 1 件）。統括が採否を決めて次のとおりにした。

- **部品の置き場**：`components/team/manage/{GroupsManage,CategoriesManage,CompetitionsManage,LeagueEdit,FitnessTestsManage,GroupMembersEditor}.tsx`、`components/team/ColorChoiceList.tsx`、`lib/leagueDraft.ts`（順位表の下書きの型と補助）。`ManageProps` は `components/team/manage/types.ts`。`GroupsManage` だけ `pane` を受ける（元の「追加する」ボタンが pane で色を変えていたため。設定では渡さない）。
- **スマホの設定の中の見た目**（major）：チーム運営の管理シートは `.teamapp:has(.mhead)` の調整（`.dynadd` の 44px・白地、`.sech` の太さ、`.notetoggle` の 44px）に頼っていた。設定は `.setapp` なので外れる。基底に `.setapp:has(.mhead) .st-manage …` の同じ調整を足した。
- **種目を管理の見出し**：切り出しで `<h2>種目を管理</h2>` が落ちていたので戻した（`hideTitle` で設定では出さない）。
- **同じ項目をもう一度押したとき**（PC）：部品は作り直されないので、未保存の確認を出さずに何もしない（メンバー編集中なら一覧へ戻すだけ）。
- **挙動の差（許容）**：予定フォームの「＋ 管理」で種類・グループを開いて予定フォームに戻り、もう一度開いたとき、入力途中の新しい種類・グループの名前は残らない（状態が部品の中に移り、シートを閉じると消えるため）。予定フォーム側の入力は今までどおり残る。
- **見出しの文字**：`.st-navh` は 12px（`var(--fs-body-s)`。契約の下限）。項目は左 14px で一段下げ、hover は `--surface-low`。
- **検証**：`~/.claude/alfa-verify-tools/p20_verify.js`（19 項目）。設定で大会を登録 → チーム運営の試合記録の絞り込みに出る／戻ると行の値が「2 件 → 3 件」／メンバー編集中の戻るは一覧へ／サッカーノートの「絞り込みを編集…」は今までどおりチーム運営へ。
