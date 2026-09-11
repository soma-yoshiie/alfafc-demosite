"use client";

import { useState } from "react";
import { useBoard } from "../BoardProvider";
import { useCoachLab } from "./CoachLabProvider";
import { AUTHOR_ROLES, LICENSES, REGIONS } from "@/lib/coachlab";
import type { CareerItem, License } from "@/lib/coachlab";

const BIO_MAX = 400;

/**
 * プロフィール編集画面（コーチのみ）。詳細は specs/coachlab.md §5-7。
 * 保存は upsertMyProfile()。id・hue・createdAt/updatedAt・seedはProvider側が管理する。
 */
export default function CoachLabProfileForm({ onSaved }: { onSaved?: () => void }) {
  const board = useBoard();
  const cl = useCoachLab();
  const existing = cl.myProfile;

  const [name, setName] = useState(existing?.name ?? board.auth.name ?? "");
  const [headline, setHeadline] = useState(existing?.headline ?? "");
  const [role, setRole] = useState<string>(existing?.role ?? "");
  const [team, setTeam] = useState(existing?.team ?? "");
  const [region, setRegion] = useState<string>(existing?.region ?? "");
  const [licenses, setLicenses] = useState<License[]>(existing?.licenses ?? []);
  const [bio, setBio] = useState(existing?.bio ?? "");
  const [career, setCareer] = useState<CareerItem[]>(existing?.career ?? []);
  const [nameErr, setNameErr] = useState<string | null>(null);

  const toggleLicense = (l: License) =>
    setLicenses((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));

  const updateCareer = (i: number, patch: Partial<CareerItem>) =>
    setCareer((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addCareer = () => setCareer((rows) => [...rows, { from: "", org: "", role: "" }]);
  const removeCareer = (i: number) => setCareer((rows) => rows.filter((_, idx) => idx !== i));

  const handleSave = () => {
    if (!name.trim()) {
      setNameErr("名前を入力してください");
      return;
    }
    setNameErr(null);
    cl.upsertMyProfile({
      name: name.trim(),
      headline: headline.trim(),
      bio: bio.slice(0, BIO_MAX),
      licenses,
      role: role || undefined,
      team: team.trim() || undefined,
      region: region || undefined,
      career: career.filter((c) => c.from.trim() || c.org.trim() || c.role.trim()),
    });
    board.toast("プロフィールを保存しました");
    onSaved?.();
  };

  return (
    <div className="cl-profileform">
      <div className="formfield">
        <label htmlFor="clpf-name">名前</label>
        <input
          id="clpf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：山田 太郎"
        />
        {nameErr && <div className="cl-fielderr">{nameErr}</div>}
      </div>

      <div className="formfield">
        <label htmlFor="clpf-headline">肩書</label>
        <input
          id="clpf-headline"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="例：中学クラブ監督・JFA A級"
        />
      </div>

      <div className="formrow">
        <div className="formfield">
          <label htmlFor="clpf-role">役割</label>
          <select id="clpf-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">未設定</option>
            {AUTHOR_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="formfield">
          <label htmlFor="clpf-region">地域</label>
          <select id="clpf-region" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">未設定</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="formfield">
        <label htmlFor="clpf-team">チーム名</label>
        <input
          id="clpf-team"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          placeholder="例：〇〇FC ジュニアユース"
        />
      </div>

      <div className="formfield">
        <label>資格（複数選択可）</label>
        <div className="catbar cl-wrapchips">
          {LICENSES.map((l) => (
            <button
              key={l}
              type="button"
              className={`catchip${licenses.includes(l) ? " on" : ""}`}
              onClick={() => toggleLicense(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="formfield">
        <label htmlFor="clpf-bio">自己紹介（{bio.length}/{BIO_MAX}）</label>
        <textarea
          id="clpf-bio"
          value={bio}
          maxLength={BIO_MAX}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
          placeholder="指導方針や得意分野などを書いてください"
          rows={5}
        />
      </div>

      <div className="formfield">
        <label>経歴</label>
        {career.map((c, i) => (
          <div key={i} className="cl-careerrow">
            <input
              className="cl-career-from"
              value={c.from}
              onChange={(e) => updateCareer(i, { from: e.target.value })}
              placeholder="開始（例：2019）"
            />
            <input
              className="cl-career-to"
              value={c.to ?? ""}
              onChange={(e) => updateCareer(i, { to: e.target.value })}
              placeholder="終了（空欄=現在）"
            />
            <input
              className="cl-career-org"
              value={c.org}
              onChange={(e) => updateCareer(i, { org: e.target.value })}
              placeholder="所属"
            />
            <input
              className="cl-career-role"
              value={c.role}
              onChange={(e) => updateCareer(i, { role: e.target.value })}
              placeholder="役割"
            />
            <button
              type="button"
              className="cl-career-del"
              aria-label="経歴を削除"
              onClick={() => removeCareer(i)}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="cl-addbtn" onClick={addCareer}>
          ＋ 経歴を追加
        </button>
      </div>

      <button type="button" className="bigbtn" onClick={handleSave}>
        保存する
      </button>
    </div>
  );
}
