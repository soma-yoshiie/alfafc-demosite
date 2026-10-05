"use client";

/**
 * 設定画面の行の部品（specs/settings-plan-a.md §2-2）。アイコンは置かない。
 * 見た目は globals.css の st-* （基底＋PC reset＋coarse）。
 */

export function SettingsGroup({
  title,
  hint,
  children,
}: {
  title?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="st-group">
      {title && <h3 className="st-group-h">{title}</h3>}
      <div className="st-card">{children}</div>
      {hint && <p className="st-hint">{hint}</p>}
    </section>
  );
}

export function SettingsRow({
  label,
  value,
  desc,
  onClick,
  danger,
}: {
  label: string;
  value?: string;
  desc?: string;
  /** 無い行は押せない見た目（› なし） */
  onClick?: () => void;
  danger?: boolean;
}) {
  const body = (
    <>
      <span className="st-row-tx">
        <span className="st-row-label">{label}</span>
        {desc && <span className="st-row-desc">{desc}</span>}
      </span>
      {value && <span className="st-row-val">{value}</span>}
      {onClick && !danger && (
        <span className="st-row-chev" aria-hidden="true">
          ›
        </span>
      )}
    </>
  );
  if (!onClick) {
    return <div className="st-row static">{body}</div>;
  }
  return (
    <button type="button" className={`st-row${danger ? " danger" : ""}`} onClick={onClick}>
      {body}
    </button>
  );
}

export function SettingsToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="st-row st-toggle">
      <span className="st-row-tx">
        <span className="st-row-label">{label}</span>
        {desc && <span className="st-row-desc">{desc}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i className="st-switch" aria-hidden="true" />
    </label>
  );
}

export function SettingsAccountCard({
  name,
  sub,
  email,
  onClick,
}: {
  name: string;
  /** 役割など（「監督・管理者」） */
  sub: string;
  email: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="st-row st-acct" onClick={onClick}>
      <span className="st-acct-av" aria-hidden="true">
        {(name || "?").trim().charAt(0)}
      </span>
      <span className="st-row-tx">
        <span className="st-acct-name">{name}</span>
        <span className="st-row-desc">{sub}</span>
        {email && <span className="st-row-desc">{email}</span>}
      </span>
      <span className="st-row-chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
