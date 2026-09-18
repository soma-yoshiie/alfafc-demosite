# デモデータの移行・グループ編集の自由化・カレンダーの場所の履歴 仕様

作成：2026-09-18／設計：fable5／実装：sonnet5／レビュー：opus5
前提：`specs/groups-everywhere.md`（Phase 1）、`specs/groups-phase2.md`（Phase 2）。ブランチ feature/groups-everywhere。

## 0. ユーザー指示（原文の要点）

1. 当面は中学生年代で考えるので、1〜6年生のカテゴリー（小学生の学年グループ）は無くす。
2. 今は 1〜6年生のカテゴリーが消せない。すべてのカテゴリー（グループ）を消せる・直せるようにする。
3. カレンダーの一番上でもカテゴリーを編集できるようにする。
4. デモ名簿を中学1〜3年の計70人に変えたはずが変わっていない。確認して直す。
5. カレンダーで場所を入力するとき、過去に入れた場所の履歴が出るようにする。履歴から選んだら住所もそのとき設定したものにする。

## 1. 原因（4 と 1・2 について）

- 新しいデモ名簿（70人・中学）は **初回起動時にしか入らない**（`loadState() ?? makeInitial()`、`loadTeam() ?? sampleTeam()`）。以前から使っているブラウザには旧デモ（`p01`〜`p16` の16人・小5/小6・チーム名「アルファラスFC U-12」）が `localStorage` に残り、そのまま表示されている。
- 旧データは `schoolStage` を持たないため `lib/storage.ts` の正規化で「小学生」とみなされ、`ensureGradeGroups` が毎回の起動で小1〜小6の学年グループを作り直す。学年グループは `removeGroup` で削除を拒否している（`kind !== "custom"` なら何もしない）。

## 2. デモデータの移行（`lib/storage.ts`）

新しい関数 `migrateOldDemo()` を `lib/storage.ts` に置き、`loadState()` と `loadTeam()` の先頭で呼ぶ（どちらが先に呼ばれても 1 回だけ動くように、完了マーカー `soccer_tactics_demo_seed_v1` に `"2"` を書いて以後はスキップ）。

判定（**旧デモの署名**。すべて満たすときだけ移行する）：
- `soccer_tactics_state_v1` の `players` が存在し、全員の `id` が `p01`〜`p16` の範囲（人数 ≤ 16）。
- `teamName` が `"アルファラスFC U-12"` または現在の `SAMPLE_TEAM_NAME`（未設定も可）。
- `soccer_tactics_team_v1` が無い、または `schoolStage` が未設定か `"elementary"`。

移行の内容：
- `players`：現在の `SAMPLE_PLAYERS`（70人）に置き換える。ただし `p01`〜`p16` については保存されている選手の項目（名前・背番号・ポジション・身長体重・体力測定・怪我など）を残し、`grade` と `groupIds` だけを `SAMPLE_PLAYERS` の値に上書きする。`p17`〜`p70` はサンプルをそのまま追加。`slots` の `pid` はそのまま（`p01`〜`p16` は存続する）。
- `teamName` が旧名なら `SAMPLE_TEAM_NAME` に。
- team：`schoolStage: "junior"`。`groups` は、旧サンプルのカスタムグループ（id `grp_low`「低学年」・`grp_high`「高学年」）を削除し、`grp_a`／`grp_b`／`grp_gk` が無ければ `SAMPLE_CUSTOM_GROUPS` から追加、学年グループは `kind:"grade"` のものを全部消してから `gradeGroupsFor("junior", [])` の 3 つを先頭に入れる。ユーザーが自分で作ったカスタムグループ（上記以外の id）は残す。
- 削除したグループ id（小1〜小6の `grp_grade_4`〜`grp_grade_6`、`grp_low`、`grp_high`）を予定・連絡・試合記録の `groupIds` と配信の `targetGroupIds` から外す（`removeGroup` と同じ後始末）。
  宛先グループが全部消えて `targetGroupIds` が空（`undefined`）になった配信は、`targetPlayerIds` も無ければ「全員宛」として扱われる（`lib/groups.ts` の `deliverableTargetsPlayer`／`BoardProvider.tsx` の `removeDeliverableTargetGroup` の既存挙動どおりで、画面から `removeGroup` した場合と同じ。移行専用の別ルールは設けない。レビュー第2回で指摘、意図的な仕様として明記）。
- ノート・試合記録・出欠が参照する `p01`〜`p16` は残るので壊れない。
- 移行したら `console.info("[alfa] 旧デモデータを中学年代の名簿に更新しました")` を 1 行出す。

署名に合わなければ何もしない（ユーザーが自分で選手を足したチームは触らない）。

## 3. 学校区分の既定と学年グループの扱い

- `loadTeam()` の正規化：`schoolStage` 未設定は **`"junior"`** とみなす（旧「elementary」から変更）。そのとき一度だけ `ensureGradeGroups("junior", groups)` で学年グループを補う（保存後は `schoolStage` があるので二度と走らない）。
- `TeamProvider` の初期化では **`ensureGradeGroups` を呼ばない**（`groups: t.groups ?? []` のまま）。学年グループが作られるのは、初回シード・§2 の移行・§3 の一度きりの補完・設定の「学校区分」変更（`setSchoolStage`）・§4 の「学年グループを追加」だけ。
- `setSchoolStage` は現状どおり（新しい区分の学年グループを補い、範囲外を削除）。

## 4. すべてのグループを削除・編集できる（`TeamProvider.removeGroup`・`TeamHub` のグループ管理シート）

- `removeGroup` の `kind !== "custom"` ガードを外す。後始末は同じ（予定・連絡・試合記録・配信・`Player.groupIds`）。学年グループを消しても選手の `grade` は変えない。Phase 2 のチャットのグループスレッド（`to: "grp:<id>"` のメッセージ）は後始末の対象外とし、残す（学年グループは id が固定 `grp_grade_n` なので、同じ学年グループを「学年グループを追加」で戻すと過去のスレッドがそのまま再表示される。レビュー第1回で指摘、意図的な仕様として明記）。
- グループ管理シート：
  - 学年グループの行にも「削除」ボタンを出す。確認文は「「中1」を削除しますか？（予定・連絡・試合記録からもこのグループが外れます。選手の学年は変わりません）」。
  - 学年グループの行のサブテキストを「学年グループ（改名のみ）」から「学年で自動 ・ メンバー n人 ›」に変え、タップでメンバー一覧を開く。学年グループのメンバー一覧は **閲覧のみ**（チェックは出さない）で、先頭に「学年グループのメンバーは選手の学年で自動的に決まります。学年は名簿の選手フォームで変更できます。」の 1 行（12px `--mut`）。
  - 一覧の下、「新しいグループを追加」の上に **「学年グループを追加」** の行：現在の学校区分の学年のうち、学年グループが無いものだけをチップで並べる（例「中1」）。タップで `kind:"grade"` のグループを作る（id は `grp_grade_<n>`、ラベルは `gradeLabel(stage, n)`）。全部そろっていれば行ごと出さない。`TeamProvider` に `addGradeGroup(grade: number)` を足す。
  - 削除・追加後にグループの並びは「学年（学年順）→ カスタム（追加順）」のまま（`addGradeGroup` は学年グループの末尾に学年順で挿入）。

## 5. カレンダーの一番上でグループを編集（`TeamHub.tsx` の `CalendarTab`）

- コーチ表示の絞り込み行（`.calfilter`）の末尾に **「＋ 管理」** を足す（`MobileSegments` の item。`on` は常に false。タップで `setSheet({ type: "groups" })`）。見た目は予定フォームの「＋ 管理」チップ（`.grouppick-item.manage`）と同じ文法（`--accent` 文字）。`MobileSegments` の item に `kind?: "action"` を足し、`aria-pressed` を出さず `.mseg-item.action` クラスを付ける（既存の `.mseg-item` の見た目は変えない）。
- グループが 0 件のときも行を出す：「すべて」は出さず「＋ グループを管理」の 1 チップだけ。
- 管理シートを閉じる（戻る）と、カレンダーに戻る（`paneBack` の既存分岐＝`from`／`date`／`returnToPlayerForm` が無ければ閉じる、で満たす）。スマホ・PC 両方。
- 削除したグループが絞り込みに選ばれていたら「すべて」に戻る（既存の `calGroupEff` の作法どおり）。

## 6. 場所の履歴（`TeamHub.tsx` の予定フォーム）

- 履歴の元：`team.team.events` の `place`（trim 後、空を除く）を **同じ場所名でまとめ**、日付の新しい順に最大 8 件。各項目の住所は「その場所名を持つ予定のうち、日付が最も新しく `address` があるもの」の `address`（無ければ空）。編集中の予定自身は除かない（同じ場所ならそれで良い）。ヘルパー `placeHistory(events): { place: string; address?: string }[]` を `lib/calendarUtils.ts` に。
- 「場所」入力の直下にチップの行 `.placehist`（`.grouppick` と同じ文法・36px・折り返し。先頭に 12px `--mut` の「最近の場所」）。履歴が 0 件なら行ごと出さない。
- 入力中の文字があり、かつ現在の入力と完全一致するチップが無いときは、部分一致（大文字小文字を無視）で絞る。0 件なら行を出さない。完全一致するチップは選択状態（`.on`）にする。
- チップをタップ：`place` をその場所名に、**`address` をその履歴の住所に上書き**する（履歴の住所が空なら住所欄は空にせず現状維持）。
- 保存の形式は変えない（`place`／`address` のまま）。PC のペインとスマホのシートは同じフォームなので両方に効く。

## 7. CSS（`app/globals.css`）

- 新規は基底に：`.placehist`（行）、`.placehist-l`（見出し 12px `--mut`）、`.mseg-item.action`（`--accent` 文字・太字。選択面の塗りは付けない）。`@media` は 9 本のまま。PC で崩れる箇所だけ PC reset セクションに追記。新規 hex・グラデーション・絵文字は禁止。文字 12px 以上、スマホのタップ領域 44px 以上。

## 8. 変えないもの

- 保存キー。ノート・試合記録・出欠の既存サンプル。設定の「学校区分」の選択肢（小学／中学／高校。小学は選べるが既定が中学になるだけ）。
- Phase 1・2 のグループの挙動（絞り込み・対象・チャットのスレッド）。

## 9. 受け入れ基準

1. 旧デモの `localStorage`（`p01`〜`p16`・小5/小6・「アルファラスFC U-12」・`schoolStage` 無しまたは elementary・グループ「Aチーム／Bチーム／低学年／高学年」＋小1〜小6）を入れて起動すると、名簿が 70 人（中1 23・中2 24・中3 23）、チーム名が「アルファラスFC ジュニアユース」、グループが「中1／中2／中3／Aチーム／Bチーム／GK」になる。`p01`〜`p16` に付いていたノート・試合記録・出欠は残る。もう一度読み込んでも二重に走らない。
2. ユーザーが自分で足した選手（id が `p01`〜`p16` 以外）があるデータは移行されない。
3. グループ管理で中1〜中3 も削除できる。削除すると絞り込み・予定の対象から外れ、選手の学年は残る。「学年グループを追加」で中1 を戻せる。学年グループのメンバー一覧が開く（閲覧のみ）。
4. カレンダーの絞り込み行の末尾に「＋ 管理」があり、グループ管理シートが開き、戻るとカレンダーに戻る。グループ 0 件でも入口がある。スマホ・PC 両方。
5. 予定フォームの「場所」の下に最近の場所が出て、タップすると場所と住所が入る。入力で絞れる。履歴が無い（予定に場所が無い）チームでは行が出ない。
6. `npx tsc --noEmit` 成功、`@media` 9 本、スマホ全画面ではみ出しゼロ、PC の変更対象外の画面は変更前と一致（動的差分を除く）。

## 10. 検証手段

- 開発サーバー http://localhost:3000（落ちていたら `(nohup npm run dev > /tmp/alfa_dev.log 2>&1 &)`）。`next build` 禁止。
- 旧デモの `localStorage` は `git show 200cdca:lib/sampleTeam.ts` の 16 人と `git show 6715420:components/TeamProvider.tsx` のサンプル（グループ `grp_a`／`grp_b`／`grp_low`／`grp_high`）から puppeteer で組み立てて `soccer_tactics_state_v1`／`soccer_tactics_team_v1` に入れる（`schoolStage` 無し版と `"elementary"`＋小1〜小6の学年グループ入り版の 2 通り）。
- ツール：`scratchpad/tools/`（`mobile_audit.js`、`pc_baseline.js`、`compare.py`）。直前の基準は `p2_final/pc`（PC）と `p2_final/m`（スマホ）。
