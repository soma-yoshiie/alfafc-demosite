"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBoard } from "./BoardProvider";
import { MobileHeader, MobileHeaderAction } from "./MobileHeader";
import SettingsTop from "./settings/SettingsTop";
import PlayerSettingsTop from "./settings/PlayerSettingsTop";
import AccountForm from "./settings/AccountForm";
import PlayerAccountView from "./settings/PlayerAccountView";
import StaffList from "./settings/StaffList";
import TeamBasicsForm from "./settings/TeamBasicsForm";
import StageList from "./settings/StageList";
import InviteForm from "./settings/InviteForm";
import NotifPrefsForm from "./settings/NotifPrefsForm";
import PlanScreen from "./settings/PlanScreen";
import DataSection from "./settings/DataSection";
import type { SettingsCat, SettingsFormProps, SettingsView, TeamSheetKey } from "./settings/settingsTypes";

/**
 * 設定画面（specs/settings-plan-a.md §2〜§4）。旧 ConsoleScreens の SettingsScreen と SheetManager の
 * SettingsBody／SettingsSheet の置き換え。スマホ＝グループ化リスト＋下層画面、PC＝左にカテゴリ列・右に内容。
 * 行の部品は settings/SettingsRows、下層のフォームは settings/ 配下。
 */

const PC_MQ = "(min-width: 1024px)";

/** PC幅かどうかを追跡するフック（TeamHub.tsx usePc() と同じ手法） */
function usePc(): boolean {
  const [pc, setPc] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(PC_MQ).matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(PC_MQ);
    const onChange = () => setPc(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return pc;
}

/** スマホの下層ヘッダーの見出し */
const VIEW_TITLE: Record<SettingsView["mode"], string> = {
  top: "設定",
  account: "アカウント",
  teamBasics: "チーム名とエンブレム",
  stage: "学校区分",
  invite: "選手・保護者の招待",
  staff: "スタッフ",
  notif: "通知",
  plan: "プラン",
  data: "データ",
};

/** 右上に「保存」を出す下層 */
const HAS_SAVE: ReadonlySet<SettingsView["mode"]> = new Set(["account", "teamBasics", "invite"]);

/** PC の左のカテゴリ列（§4） */
const NAV: { title?: string; items: { cat: SettingsCat; label: string }[] }[] = [
  { items: [{ cat: "account", label: "アカウント" }] },
  {
    title: "チーム",
    items: [
      { cat: "basics", label: "チームの基本" },
      { cat: "groups", label: "学年・グループ" },
      { cat: "categories", label: "予定の種類" },
      { cat: "competitions", label: "大会" },
      { cat: "league", label: "順位表" },
      { cat: "fitnessTests", label: "体力テストの種目" },
    ],
  },
  {
    title: "メンバー",
    items: [
      { cat: "staff", label: "スタッフ" },
      { cat: "invite", label: "選手・保護者の招待" },
      { cat: "public", label: "公開範囲" },
    ],
  },
  {
    title: "その他",
    items: [
      { cat: "notif", label: "通知" },
      { cat: "plan", label: "プラン" },
      { cat: "data", label: "データ" },
    ],
  },
];

/** PC の左のカテゴリ列（選手・保護者。§5）。チームの区画は無い */
const PLAYER_NAV: typeof NAV = [
  {
    items: [
      { cat: "account", label: "アカウント" },
      { cat: "notif", label: "通知" },
      { cat: "about", label: "バージョン" },
    ],
  },
];

/** シートを開く行ごとの、チーム運営で先に開くタブ（§6） */
const SHEET_TAB: Record<TeamSheetKey, "ros" | "cal" | "rec"> = {
  groups: "ros",
  categories: "cal",
  competitions: "rec",
  league: "rec",
  fitnessTests: "ros",
};

const SHEET_CATS: ReadonlySet<SettingsCat> = new Set(["groups", "categories", "competitions", "league", "fitnessTests"]);

/** PC で、行が 1 つしか無いカテゴリは左の列を押した時点で下層を出す（行を 1 回余計に押させない。戻りも出さない） */
const DIRECT_VIEW: Partial<Record<SettingsCat, SettingsView["mode"]>> = {
  staff: "staff",
  invite: "invite",
  notif: "notif",
  plan: "plan",
  data: "data",
};

/** 下層が属するカテゴリ（スマホで開いたまま PC 幅になっても、左の列と戻りが食い違わないようにする） */
const VIEW_CAT: Partial<Record<SettingsView["mode"], SettingsCat>> = {
  account: "account",
  teamBasics: "basics",
  stage: "basics",
  invite: "invite",
  staff: "staff",
  notif: "notif",
  plan: "plan",
  data: "data",
};

export default function SettingsScreen() {
  const board = useBoard();
  // board-squad-and-pc-polish §1: PCは左レールで戻れるため「‹ ホーム」は出さない。
  // モバイルはnavFromに従いhome/otherへ（ホームの行/その他ハブの行のどちらから開いたかで戻り先が変わる。mobile-redesign-v2 §2）
  const pc = usePc();
  const coach = board.auth.role === "coach";
  const [view, setView] = useState<SettingsView>({ mode: "top" });
  const [cat, setCat] = useState<SettingsCat>("account");
  const dirtyRef = useRef(false);
  const saveRef = useRef<(() => void) | null>(null);
  const onDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);

  /** 未保存の変更があれば確認する（p15 の未保存の確認と同じ作法）。続けてよいなら true */
  function confirmLeave(): boolean {
    if (dirtyRef.current && !window.confirm("変更を保存せずに戻りますか？")) return false;
    dirtyRef.current = false;
    return true;
  }
  function go(v: SettingsView) {
    if (!confirmLeave()) return;
    const c = VIEW_CAT[v.mode];
    if (c) setCat(c);
    setView(v);
  }
  const done = useCallback(() => {
    dirtyRef.current = false;
    // PC の 1 行だけのカテゴリは下層をそのまま出し続ける（戻ると 1 行の一覧になるだけなので）
    const direct = pc ? DIRECT_VIEW[cat] : undefined;
    setView(direct ? { mode: direct } : { mode: "top" });
  }, [pc, cat]);

  /** チーム運営のシートを開く行（グループ・種類・大会・順位表・体力テストの種目）。閉じたあとはチーム運営に留まる（§6） */
  function openTeamSheet(key: TeamSheetKey) {
    if (!confirmLeave()) return;
    board.setTeamIntent({ tab: SHEET_TAB[key], openSheet: key });
    board.setScreen("team");
  }

  function selectCat(c: SettingsCat) {
    if (SHEET_CATS.has(c)) {
      openTeamSheet(c as TeamSheetKey);
      return;
    }
    if (!confirmLeave()) return;
    setCat(c);
    const direct = DIRECT_VIEW[c];
    setView(direct ? { mode: direct } : { mode: "top" });
  }

  const formProps: SettingsFormProps = { pc, onDirty, saveRef, onDone: done };
  function renderSub(): React.ReactNode {
    switch (view.mode) {
      case "account":
        return coach ? <AccountForm key="account" {...formProps} /> : <PlayerAccountView key="account" />;
      case "staff":
        return <StaffList key="staff" />;
      case "teamBasics":
        return <TeamBasicsForm key="teamBasics" {...formProps} />;
      case "stage":
        return <StageList key="stage" />;
      case "invite":
        return <InviteForm key="invite" {...formProps} />;
      case "notif":
        return <NotifPrefsForm key="notif" />;
      case "plan":
        return <PlanScreen key="plan" />;
      case "data":
        return <DataSection key="data" />;
      default:
        return null;
    }
  }

  const logout = () => window.dispatchEvent(new Event("alfa-logout"));
  const nav = coach ? NAV : PLAYER_NAV;
  const catLabel = nav.flatMap((g) => g.items).find((i) => i.cat === cat)?.label ?? "設定";

  return (
    <div className="app setapp">
      {pc ? (
        // board-squad-and-pc-polish §1: 左にレール(.conrail)があるため「‹ ホーム」は不要
        <header>
          <div className="brand">
            <div className="logo">設定</div>
            <div className="tag team" style={{ marginTop: 4 }}>
              {board.state.teamName ?? "マイチーム"}
            </div>
          </div>
        </header>
      ) : (
        // mobile-redesign §1-6: 戻るは出す（ホームの行／その他ハブの行のどちらからも遷移する）。
        // 下層は一覧へ戻る。保存のある画面は右上に「保存」
        <MobileHeader
          title={VIEW_TITLE[view.mode]}
          onBack={
            view.mode === "top"
              ? () => board.setScreen(board.navFrom === "home" ? "home" : "other")
              : () => go({ mode: "top" })
          }
          actions={
            HAS_SAVE.has(view.mode) && !(view.mode === "account" && !coach) && (
              <MobileHeaderAction primary label="保存" onClick={() => saveRef.current?.()}>
                <span className="st-headsave">保存</span>
              </MobileHeaderAction>
            )
          }
        />
      )}
      <div className="scroll screenbody">
        <div className="setwrap">
          {pc ? (
            <div className="st-pc">
              <nav className="st-nav" aria-label="設定の項目">
                {nav.map((g, gi) => (
                  <div key={gi} className="st-navgroup">
                    {g.title && <div className="st-navh">{g.title}</div>}
                    {g.items.map((it) => (
                      <button
                        key={it.cat}
                        type="button"
                        className={`st-navitem${!SHEET_CATS.has(it.cat) && cat === it.cat ? " on" : ""}`}
                        aria-current={!SHEET_CATS.has(it.cat) && cat === it.cat ? "page" : undefined}
                        onClick={() => selectCat(it.cat)}
                      >
                        {it.label}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="st-navgroup">
                  <button type="button" className="st-navitem danger" onClick={logout}>
                    ログアウト
                  </button>
                </div>
              </nav>
              <div className="st-main">
                {view.mode === "top" ? (
                  coach ? (
                    <SettingsTop cat={cat} go={go} openTeamSheet={openTeamSheet} />
                  ) : (
                    <PlayerSettingsTop cat={cat} go={go} />
                  )
                ) : (
                  <>
                    {!DIRECT_VIEW[cat] && (
                      <button type="button" className="st-back" onClick={() => go({ mode: "top" })}>
                        ‹ {catLabel}
                      </button>
                    )}
                    {renderSub()}
                  </>
                )}
              </div>
            </div>
          ) : view.mode === "top" ? (
            coach ? <SettingsTop go={go} openTeamSheet={openTeamSheet} /> : <PlayerSettingsTop go={go} />
          ) : (
            renderSub()
          )}
        </div>
      </div>
    </div>
  );
}
