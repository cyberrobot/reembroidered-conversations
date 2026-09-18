import React from "react";

interface EmbroideredThreadProps {
  className?: string;
  variant?: "horizontal" | "curved" | "divider" | "knot";
}

export const EmbroideredThread: React.FC<EmbroideredThreadProps> = ({
  className = "",
  variant = "horizontal",
}) => {
  if (variant === "knot") {
    return (
      <div
        className={`inline-flex items-center justify-center gap-1.5 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#A35048]" />
        <span className="w-12 h-[1px] bg-[#A35048]/40" />
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className="text-[#A35048]"
        >
          <circle
            cx="6"
            cy="6"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <line
            x1="2"
            y1="2"
            x2="10"
            y2="10"
            stroke="currentColor"
            strokeWidth="1"
          />
          <line
            x1="10"
            y1="2"
            x2="2"
            y2="10"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
        <span className="w-12 h-[1px] bg-[#A35048]/40" />
        <span className="w-1.5 h-1.5 rounded-full bg-[#A35048]" />
      </div>
    );
  }

  if (variant === "curved") {
    return (
      <div
        className={`w-full overflow-hidden flex justify-center py-4 ${className}`}
      >
        <svg
          viewBox="0 0 1200 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full max-w-4xl text-[#A35048]/50 h-6"
        >
          <path
            d="M0 24C150 24 200 8 350 8C500 8 550 40 700 40C850 40 900 16 1050 16C1120 16 1160 24 1200 24"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            strokeLinecap="round"
          />
          <circle cx="350" cy="8" r="2.5" fill="#A35048" />
          <circle cx="700" cy="40" r="2.5" fill="#A35048" />
          <circle cx="1050" cy="16" r="2.5" fill="#A35048" />
        </svg>
      </div>
    );
  }

  if (variant === "divider") {
    return (
      <div
        className={`w-full flex items-center justify-center gap-4 py-6 ${className}`}
      >
        <div className="h-[1px] flex-1 max-w-xs border-t border-dashed border-[#A35048]/35" />
        <span className="font-serif italic text-xs tracking-widest text-[#A35048] uppercase">
          Re-Embroidered Conversations
        </span>
        <div className="h-[1px] flex-1 max-w-xs border-t border-dashed border-[#A35048]/35" />
      </div>
    );
  }

  return (
    <div
      className={`w-full h-px border-t border-dashed border-[#A35048]/40 my-4 ${className}`}
    />
  );
};
