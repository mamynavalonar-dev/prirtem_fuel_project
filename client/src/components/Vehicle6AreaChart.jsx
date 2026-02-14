import React, { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

function cssVar(name, fallback = "") {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v || "").trim() || fallback;
}

function withAlpha(color, a = 1) {
  if (!color) return `rgba(0,0,0,${a})`;
  const c = String(color).trim();

  if (c.startsWith("rgba(")) {
    return c.replace(/rgba\(([^)]+)\)/, (_, inside) => {
      const parts = inside.split(",").map((x) => x.trim());
      const r = parts[0] ?? "0";
      const g = parts[1] ?? "0";
      const b = parts[2] ?? "0";
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    });
  }

  if (c.startsWith("rgb(")) {
    const inside = c.slice(c.indexOf("(") + 1, c.lastIndexOf(")"));
    return `rgba(${inside}, ${a})`;
  }

  if (c.startsWith("#")) {
    let h = c.replace("#", "");
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    if (h.length !== 6) return `rgba(0,0,0,${a})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return c;
}

const DEFAULT_COLORS = [
  "#60a5fa", // blue
  "#34d399", // emerald
  "#f59e0b", // amber
  "#a78bfa", // violet
  "#22d3ee", // cyan
  "#ef4444", // red
];

/**
 * Props:
 * - labels: ["2024-01-01", ...]
 * - series: [{ label: "39111WVT", data: [..] }, ...] (jusqu'à 6)
 * - valueSuffix: ex " Ar"
 */
export default function Vehicle6AreaChart({ labels = [], series = [], valueSuffix = "" }) {
  // ✅ re-render auto quand data-theme change
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    const obs = new MutationObserver(() => setTick((x) => x + 1));
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const tokens = useMemo(() => {
    const themeName =
      (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme")) || "light";
    const isDark = themeName === "dark";

    const surface = cssVar("--surface", isDark ? "#0b1220" : "#ffffff");
    const text = cssVar("--text", isDark ? "#e5e7eb" : "#0f172a");
    const muted = cssVar("--muted", isDark ? "rgba(229,231,235,.62)" : "#64748b");
    const border = cssVar("--border", isDark ? "rgba(255,255,255,.10)" : "rgba(15,23,42,.12)");

    return {
      isDark,
      surface,
      text,
      muted,
      border,
      grid: withAlpha(border, isDark ? 0.12 : 0.10),
      tooltipBg: withAlpha(surface, 0.96),
      tooltipBorder: withAlpha(border, isDark ? 0.22 : 0.25),
    };
  }, [tick]);

  const data = useMemo(() => {
    const s = (series || []).slice(0, 6);

    return {
      labels,
      datasets: s.map((v, i) => {
        const color = DEFAULT_COLORS[i % DEFAULT_COLORS.length];

        return {
          label: v.label,
          data: Array.isArray(v.data) ? v.data : [],
          borderColor: color,
          borderWidth: 2,
          tension: 0.38,
          pointRadius: 0,
          pointHitRadius: 10,
          fill: true,
          backgroundColor: (ctx) => {
            const chart = ctx.chart;
            const area = chart.chartArea;

            const top = withAlpha(color, 0.22);
            const bottom = withAlpha(color, 0.0);

            if (!area) return top;
            const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, top);
            g.addColorStop(1, bottom);
            return g;
          },
        };
      }),
    };
  }, [labels, series, tokens.isDark]);

  const options = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: tokens.text,
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 10,
            boxHeight: 10,
            padding: 14,
            font: { weight: "700" },
          },
        },
        tooltip: {
          displayColors: false,
          backgroundColor: tokens.tooltipBg,
          borderColor: tokens.tooltipBorder,
          borderWidth: 1,
          titleColor: tokens.text,
          bodyColor: tokens.muted,
          padding: 10,
          cornerRadius: 12,
          callbacks: {
            label: (ctx) => {
              const v = ctx.raw ?? 0;
              const pretty = Number(v || 0).toLocaleString("fr-FR");
              return ` ${ctx.dataset.label}: ${pretty}${valueSuffix}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: tokens.muted,
            font: { weight: "700" },
            maxTicksLimit: 8,
            autoSkip: true,
          },
          grid: { color: "transparent", drawBorder: false },
        },
        y: {
          ticks: { color: tokens.muted, font: { weight: "700" } },
          grid: { color: tokens.grid, drawBorder: false },
        },
      },
    };
  }, [tokens, valueSuffix]);

  return <Line data={data} options={options} />;
}
