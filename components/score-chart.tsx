"use client";

import { useId } from "react";
import styles from "./score-chart.module.css";

export interface ScoreChartPoint {
  id: string;
  label: string;
  value: number;
  helper?: string;
}

interface ScoreChartProps {
  title: string;
  description: string;
  points: ScoreChartPoint[];
  maxValue?: number;
  unit?: string;
  valueLabel?: string;
  emptyLabel?: string;
}

const chartWidth = 320;
const chartHeight = 176;
const chartPadding = {
  top: 20,
  right: 20,
  bottom: 34,
  left: 36,
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatValue = (value: number, unit: string) => {
  const normalized = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return normalized + unit;
};

export function ScoreChart({
  title,
  description,
  points,
  maxValue = 100,
  unit = "점",
  valueLabel = "값",
  emptyLabel = "표시할 점수 데이터가 아직 없어요.",
}: ScoreChartProps) {
  const titleId = useId();
  const descId = useId();
  const tableCaptionId = useId();
  const safeMaxValue = maxValue > 0 ? maxValue : 100;
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const coordinates = points.map((point, index) => {
    const x =
      points.length === 1
        ? chartPadding.left + plotWidth / 2
        : chartPadding.left + (plotWidth * index) / (points.length - 1);
    const y =
      chartPadding.top + plotHeight - (clamp(point.value, 0, safeMaxValue) / safeMaxValue) * plotHeight;

    return {
      ...point,
      x,
      y,
    };
  });
  const linePoints = coordinates.map((point) => point.x + "," + point.y).join(" ");

  return (
    <figure className={styles.card} aria-label={title + " 그래프와 표"}>
      <figcaption className={styles.header}>
        <strong>{title}</strong>
        <span>{description}</span>
      </figcaption>

      {points.length > 0 ? (
        <>
          <div className={styles.svgFrame}>
            <svg
              className={styles.chart}
              viewBox={"0 0 " + chartWidth + " " + chartHeight}
              role="img"
              aria-labelledby={titleId + " " + descId}
              focusable="false"
            >
              <title id={titleId}>{title}</title>
              <desc id={descId}>{description}</desc>
              <line
                className={styles.axis}
                x1={chartPadding.left}
                y1={chartPadding.top + plotHeight}
                x2={chartPadding.left + plotWidth}
                y2={chartPadding.top + plotHeight}
              />
              <line
                className={styles.axis}
                x1={chartPadding.left}
                y1={chartPadding.top}
                x2={chartPadding.left}
                y2={chartPadding.top + plotHeight}
              />
              <line
                className={styles.gridLine}
                x1={chartPadding.left}
                y1={chartPadding.top + plotHeight / 2}
                x2={chartPadding.left + plotWidth}
                y2={chartPadding.top + plotHeight / 2}
              />
              <text className={styles.axisLabel} x={chartPadding.left - 8} y={chartPadding.top + 4}>
                {formatValue(safeMaxValue, unit)}
              </text>
              <text
                className={styles.axisLabel}
                x={chartPadding.left - 8}
                y={chartPadding.top + plotHeight + 4}
              >
                0{unit}
              </text>
              {coordinates.length > 1 ? <polyline className={styles.line} points={linePoints} /> : null}
              {coordinates.map((point) => (
                <g key={point.id}>
                  <circle className={styles.pointHalo} cx={point.x} cy={point.y} r="8" />
                  <circle className={styles.point} cx={point.x} cy={point.y} r="4.5" />
                  <text className={styles.valueLabel} x={point.x} y={point.y - 12}>
                    {formatValue(point.value, unit)}
                  </text>
                  <text
                    className={styles.pointLabel}
                    x={point.x}
                    y={chartPadding.top + plotHeight + 22}
                  >
                    {point.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <table className={styles.dataTable} aria-describedby={tableCaptionId}>
            <caption id={tableCaptionId}>{title} 표 데이터</caption>
            <thead>
              <tr>
                <th scope="col">구분</th>
                <th scope="col">{valueLabel}</th>
                <th scope="col">기준</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.id}>
                  <th scope="row">{point.label}</th>
                  <td>{formatValue(point.value, unit)}</td>
                  <td>{point.helper ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className={styles.emptyState} role="status">
          {emptyLabel}
        </p>
      )}
    </figure>
  );
}
