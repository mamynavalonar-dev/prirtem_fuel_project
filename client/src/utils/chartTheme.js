// client/src/utils/chartTheme.js
function hexToRgba(hex, a = 1) {
  if (!hex) return `rgba(0,0,0,${a})`;
  const h = hex.trim();

  // Already rgba()/rgb()
  if (h.startsWith("rgb")) {
    // crude: wrap with alpha by converting "rgb(r,g,b)" -> "rgba(r,g,b,a)"
    if (h.startsWith("rgba")) return h;
    const inside = h.slice(h.indexOf("(") + 1, h.lastIndexOf(")"));
    return `rgba(${inside},${a})`;
  }

  // #RGB or #RRGGBB
  let c = h.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  if (c.length !== 6) return `rgba(0,0,0,${a})`;

  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function readChartTheme() {
  const cs = getComputedStyle(document.documentElement);

  const get = (v, fallback) => cs.getPropertyValue(v).trim() || fallback;

  const surface = get("--surface", "#ffffff");
  const bg = get("--bg", "#f7f7fb");
  const border = get("--border", "rgba(15,23,42,.12)");
  const text = get("--text", "#0f172a");
  const muted = get("--muted", "#64748b");
  const accent = get("--accent", "#2563eb");
  const ring = get("--ring", "rgba(37,99,235,.35)");

  // utiles pour doughnut / états
  const danger = get("--danger", "#ef4444");
  const warning = get("--warning", "#f59e0b");
  const success = get("--success", "#10b981");

  return {
    surface,
    bg,
    border,
    text,
    muted,
    accent,
    ring,
    danger,
    warning,
    success,
    // dérivés
    grid: hexToRgba(border, 0.55),
    gridSoft: hexToRgba(border, 0.28),
    accentSoft: hexToRgba(accent, 0.18),
    accentFill: hexToRgba(accent, 0.22),
    tooltipBg: hexToRgba(surface, 0.96),
    tooltipBorder: hexToRgba(border, 0.9),
  };
}

export function makeLineOptions(t) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    animation: { duration: 650 },

    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        enabled: true,
        displayColors: false,
        backgroundColor: t.tooltipBg,
        borderColor: t.tooltipBorder,
        borderWidth: 1,
        titleColor: t.text,
        bodyColor: t.muted,
        padding: 10,
        cornerRadius: 12,
      },
    },

    scales: {
      x: {
        grid: { color: t.gridSoft, drawBorder: false },
        ticks: { color: t.muted, font: { weight: "700" } },
      },
      y: {
        grid: { color: t.grid, drawBorder: false },
        ticks: { color: t.muted, font: { weight: "700" } },
      },
    },
  };
}

export function makeLineDataset({ label, labels, values }, t, canvas) {
  // Dégradé propre (accent -> transparent), sans casser le dark mode
  let fill = t.accentFill;
  if (canvas) {
    const ctx = canvas.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height || 260);
    g.addColorStop(0, t.accentFill);
    g.addColorStop(1, hexToRgba(t.accent, 0.0));
    fill = g;
  }

  return {
    labels,
    datasets: [
      {
        label: label || "",
        data: values,
        tension: 0.35,
        borderWidth: 2,
        borderColor: t.accent,
        backgroundColor: fill,
        fill: true,
        pointRadius: 0,
        pointHitRadius: 12,
      },
    ],
  };
}

export function makeDoughnutOptions(t) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "70%",
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: t.muted, boxWidth: 10, boxHeight: 10, usePointStyle: true },
      },
      tooltip: {
        backgroundColor: t.tooltipBg,
        borderColor: t.tooltipBorder,
        borderWidth: 1,
        titleColor: t.text,
        bodyColor: t.muted,
        padding: 10,
        cornerRadius: 12,
      },
    },
  };
}

export function makeDoughnutDataset({ labels, values }, t) {
  // palette sobre et cohérente avec ton design
  const colors = [
    t.accent,
    t.success,
    t.warning,
    t.danger,
    hexToRgba(t.muted, 0.65),
  ];

  return {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: values.map((_, i) => colors[i % colors.length]),
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  };
}
