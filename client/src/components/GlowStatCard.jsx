import React from "react";
import "./GlowStatCard.css";

const toneMap = {
  emerald: {
    from: "#10b981",
    to: "#0ea5e9",
    value: "#34d399",
    badgeBg: "rgba(16,185,129,.12)",
    badgeText: "#34d399",
    dot: "#10b981",
  },
  sky: {
    from: "#0ea5e9",
    to: "#10b981",
    value: "#38bdf8",
    badgeBg: "rgba(14,165,233,.12)",
    badgeText: "#38bdf8",
    dot: "#0ea5e9",
  },
  violet: {
    from: "#8b5cf6",
    to: "#0ea5e9",
    value: "#a78bfa",
    badgeBg: "rgba(139,92,246,.12)",
    badgeText: "#a78bfa",
    dot: "#8b5cf6",
  },
};

export default function GlowStatCard({
  title,
  subtitle,
  badgeLabel = "Actif",
  tone = "emerald",
  stats = [], // [{ label, value, tone? }]
  className = "",
}) {
  const t = toneMap[tone] || toneMap.emerald;

  return (
    <div className={`gscWrap ${className}`}>
      <div
        className="gscGlow"
        style={{
          background: `linear-gradient(90deg, ${t.from}, ${t.to})`,
        }}
      />
      <div className="gscCard">
        <div className="gscHeader">
          <div className="gscTitleBlock">
            <div
              className="gscTitle"
              style={{
                backgroundImage: `linear-gradient(90deg, ${t.from}, ${t.to})`,
              }}
            >
              {title}
            </div>
            {subtitle ? <div className="gscSubtitle">{subtitle}</div> : null}
          </div>

          <div
            className="gscBadge"
            style={{
              background: t.badgeBg,
              color: t.badgeText,
            }}
          >
            <span
              className="gscDot"
              style={{ background: t.dot }}
              aria-hidden="true"
            />
            <span className="gscBadgeText">{badgeLabel}</span>
          </div>
        </div>

        <div
          className="gscGrid"
          style={{
            gridTemplateColumns: `repeat(${Math.min(
              Math.max(stats.length, 1),
              3
            )}, minmax(0, 1fr))`,
          }}
        >
          {stats.map((s, idx) => {
            const st = toneMap[s.tone] || t;
            return (
              <div
                key={`${s.label}-${idx}`}
                className="gscStat"
                style={{
                  ["--statValue"]: st.value,
                  ["--statFrom"]: st.from,
                  ["--statTo"]: st.to,
                }}
              >
                <div className="gscStatValue">{s.value}</div>
                <div className="gscStatLabel">{s.label}</div>
                <div className="gscStatBar" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
