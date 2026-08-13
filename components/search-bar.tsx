"use client";

import { FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { InstitutionType, ServiceZone } from "@/lib/types";
import styles from "./search-bar.module.css";

interface SearchBarProps {
  initialValue?: string;
  targetPath?: string;
  placeholder?: string;
  submitLabel?: string;
  label?: string;
  type?: InstitutionType | "ALL";
  zone?: ServiceZone;
  sort?: string;
  pickup?: boolean;
  trial?: boolean;
}

export function SearchBar({
  initialValue = "",
  targetPath = "/discover",
  placeholder = "기관명, 동네, 과목으로 검색",
  submitLabel = "검색",
  label = "기관 검색",
  type,
  zone,
  sort,
  pickup = false,
  trial = false,
}: SearchBarProps) {
  const router = useRouter();
  const id = useId();
  const [query, setQuery] = useState(initialValue);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const params = new URLSearchParams();
    const normalizedQuery = query.trim();

    if (normalizedQuery) params.set("q", normalizedQuery);
    if (type && type !== "ALL") params.set("type", type);
    if (zone && zone !== "ALL") params.set("zone", zone);
    if (sort && sort !== "RECOMMENDED") params.set("sort", sort);
    if (pickup) params.set("pickup", "true");
    if (trial) params.set("trial", "true");

    const queryString = params.toString();
    router.push(queryString ? targetPath + "?" + queryString : targetPath);
  };

  return (
    <form className={styles.form} role="search" onSubmit={handleSubmit}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>

      <div className={styles.searchBox}>
        <Search size={20} aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={query}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}
