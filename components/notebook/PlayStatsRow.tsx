import { playStats } from "@/lib/plays";

/** シュート/パス/ドリブル等のライブスタッツ表示（記入フォーム・詳細画面で共用） */
export function PlayStatsRow({ stats }: { stats: ReturnType<typeof playStats> }) {
  return (
    <div className="aistats">
      <div className="aistat">
        <div className="aisv">{stats.shotPct != null ? `${stats.shotPct}%` : `${stats.shots}`}</div>
        <div className="aisl">シュート {stats.goals}G/{stats.shots}本</div>
      </div>
      <div className="aistat">
        <div className="aisv">{stats.passPct != null ? `${stats.passPct}%` : `${stats.pass}`}</div>
        <div className="aisl">パス {stats.pass}本</div>
      </div>
      <div className="aistat">
        <div className="aisv">{stats.dribblePct != null ? `${stats.dribblePct}%` : `${stats.dribble}`}</div>
        <div className="aisl">ドリブル {stats.dribble}本</div>
      </div>
      <div className="aistat">
        <div className="aisv">{stats.receive}</div>
        <div className="aisl">受けた</div>
      </div>
      <div className="aistat">
        <div className="aisv">{stats.trapMiss}</div>
        <div className="aisl">トラップミス</div>
      </div>
    </div>
  );
}
