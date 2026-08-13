"use client";

import { MapPinned, MapPin, Rows3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "./institution-coordinate-map.module.css";

export type CoordinateMapInstitution = {
  id: string;
  name: string;
  type: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

const hasCoordinates = (item: CoordinateMapInstitution) => (
  typeof item.latitude === "number" && Number.isFinite(item.latitude)
  && typeof item.longitude === "number" && Number.isFinite(item.longitude)
  && item.latitude >= -90 && item.latitude <= 90 && item.longitude >= -180 && item.longitude <= 180
);

export function InstitutionCoordinateMap({ items, children }: { items: CoordinateMapInstitution[]; children: ReactNode }) {
  const [view, setView] = useState<"LIST" | "MAP">("LIST");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const plotted = useMemo(() => items.filter(hasCoordinates) as Array<CoordinateMapInstitution & { latitude: number; longitude: number }>, [items]);
  const missingCount = items.length - plotted.length;
  const markers = useMemo(() => {
    if (!plotted.length) return [];
    const latitudes = plotted.map((item) => item.latitude);
    const longitudes = plotted.map((item) => item.longitude);
    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);
    const latitudeRange = maxLatitude - minLatitude || 1;
    const longitudeRange = maxLongitude - minLongitude || 1;
    return plotted.map((item) => ({
      ...item,
      left: 10 + ((item.longitude - minLongitude) / longitudeRange) * 80,
      top: 10 + ((maxLatitude - item.latitude) / latitudeRange) * 80,
    }));
  }, [plotted]);

  useEffect(() => {
    panelRef.current?.querySelectorAll<HTMLElement>("[data-coordinate-list-item]").forEach((item) => {
      item.dataset.selected = String(item.dataset.coordinateListItem === selectedId);
    });
  }, [selectedId]);

  const selectMarker = (id: string) => {
    setSelectedId(id);
    setView("LIST");
    window.setTimeout(() => document.getElementById(`coordinate-list-${id}`)?.focus(), 0);
  };

  return <section ref={panelRef} className={styles.panel} aria-label="기관 목록과 위치 도식" onClick={(event) => {
    const item = (event.target as Element).closest<HTMLElement>("[data-coordinate-list-item]");
    if (item?.dataset.coordinateListItem) setSelectedId(item.dataset.coordinateListItem);
  }}>
    <div className={styles.controls} role="group" aria-label="검색 결과 보기 방식">
      <button type="button" data-active={view === "LIST"} onClick={() => setView("LIST")} aria-pressed={view === "LIST"}><Rows3 aria-hidden="true" />목록</button>
      <button type="button" data-active={view === "MAP"} onClick={() => setView("MAP")} aria-pressed={view === "MAP"}><MapPinned aria-hidden="true" />위치 도식</button>
    </div>
    <p className={styles.notice}><MapPin aria-hidden="true" />공개 좌표 기반 위치 도식입니다. 도로 지도·통학 시간·이동 경로는 표시하지 않습니다.</p>
    <p className={styles.summary} aria-live="polite">좌표 표시 {plotted.length}곳 · 좌표 미등록 {missingCount}곳은 목록에서 확인해 주세요.</p>
    {view === "MAP" ? plotted.length ? <div className={styles.map} aria-label="기관 공개 좌표 위치 도식">
      {markers.map((item) => <button type="button" key={item.id} className={styles.marker} data-selected={selectedId === item.id} style={{ left: `${item.left}%`, top: `${item.top}%` }} onClick={() => selectMarker(item.id)} aria-label={`${item.name}, ${item.type}, ${item.address} 목록에서 보기`}>
        <MapPin aria-hidden="true" /><span>{item.name}</span>
      </button>)}
    </div> : <p className={styles.empty}>현재 조건의 기관에는 공개 좌표가 없어 위치 도식을 만들 수 없어요. 목록에서 기관 정보를 확인해 주세요.</p> : <div className={styles.list}>{children}</div>}
  </section>;
}
