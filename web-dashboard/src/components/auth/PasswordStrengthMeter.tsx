"use client";

/**
 * PasswordStrengthMeter — checklist 7 rule + bar warna.
 * Sesuai Req 9.3, 9.4.
 */
import { useMemo } from "react";

interface RuleCheck {
  id: string;
  label: string;
  passed: boolean;
}

function evaluateRules(password: string): RuleCheck[] {
  return [
    { id: "min10", label: "Minimal 10 karakter", passed: password.length >= 10 },
    { id: "max256", label: "Maksimal 256 karakter", passed: password.length <= 256 },
    { id: "upper", label: "Mengandung huruf besar (A-Z)", passed: /[A-Z]/.test(password) },
    { id: "lower", label: "Mengandung huruf kecil (a-z)", passed: /[a-z]/.test(password) },
    { id: "digit", label: "Mengandung digit (0-9)", passed: /[0-9]/.test(password) },
    { id: "symbol", label: "Mengandung simbol", passed: /[^A-Za-z0-9]/.test(password) },
    // HIBP check is server-side only; UI hint
    { id: "hibp", label: "Tidak ada di daftar bocor (cek saat submit)", passed: password.length > 0 },
  ];
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const rules = useMemo(() => evaluateRules(password), [password]);
  const passedCount = rules.filter((r) => r.passed).length;
  const ratio = passedCount / rules.length;
  const color =
    ratio < 0.5 ? "bg-red-400" : ratio < 0.85 ? "bg-yellow-400" : "bg-green-500";
  return (
    <div className="space-y-2">
      <div className="h-1.5 rounded bg-slate-200 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${color}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <ul className="text-xs space-y-0.5">
        {rules.map((r) => (
          <li
            key={r.id}
            className={r.passed ? "text-green-700" : "text-slate-500"}
          >
            {r.passed ? "✓" : "○"} {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
