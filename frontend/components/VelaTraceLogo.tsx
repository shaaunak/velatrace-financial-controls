import React from "react";

interface VelaTraceLogoProps {
  variant?: "dark" | "light";
  subtitle?: string;
  compact?: boolean;
}

export function VelaTraceLogo({
  variant = "dark",
  subtitle,
  compact = false,
}: VelaTraceLogoProps) {
  const isLight = variant === "light";

  return (
    <div className="flex items-center gap-2.5 select-none">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border ${
          isLight
            ? "border-[#19141E] bg-[#19141E]"
            : "border-[#372E40] bg-[#120B19]"
        }`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          {/* Crosshair reticles */}
          <line x1="12" y1="2" x2="12" y2="6" stroke="#EBDEF2" strokeWidth="2" />
          <line x1="12" y1="18" x2="12" y2="22" stroke="#EBDEF2" strokeWidth="2" />
          <line x1="2" y1="12" x2="6" y2="12" stroke="#EBDEF2" strokeWidth="2" />
          <line x1="18" y1="12" x2="22" y2="12" stroke="#EBDEF2" strokeWidth="2" />
          {/* Diagonal provenance trace */}
          <line
            x1="4"
            y1="20"
            x2="20"
            y2="4"
            stroke="#B7A9C7"
            strokeWidth="1.5"
            strokeDasharray="2.5 2.5"
          />
          {/* Outer ring & Citron focal node */}
          <circle cx="12" cy="12" r="5" stroke="#EBDEF2" strokeWidth="2" />
          <circle cx="12" cy="12" r="2.75" fill="#D9F66F" />
        </svg>
      </div>
      {!compact && (
        <div className="min-w-0 leading-none">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-display text-[15px] font-bold tracking-[-0.02em] ${
                isLight ? "text-[#19141E]" : "text-[#EBDEF2]"
              }`}
            >
              Vela<span className="font-normal">Trace</span>
            </span>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#DE785F]" />
          </div>
          {subtitle && (
            <div
              className={`mt-1 font-mono text-[9px] uppercase tracking-[0.08em] truncate ${
                isLight ? "text-[#5A5263]" : "text-[#B7A9C7]"
              }`}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
