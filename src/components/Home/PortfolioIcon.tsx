type IconName = "graduation" | "certificate" | "book" | "community";

const colors: Record<IconName, string> = {
  graduation: "bg-[#EAE2F7] text-[#4A2B71]",
  certificate: "bg-[#E1EAF2] text-[#30546A]",
  book: "bg-[#F7F0E2] text-[#6B4E0E]",
  community: "bg-[#DFF2F0] text-[#0E5757]",
};

export default function PortfolioIcon({ name }: { name: IconName }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md ${colors[name]}`}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {name === "graduation" && (
          <>
            <path d="m2 8 10-5 10 5-10 5L2 8Z" />
            <path d="M6 10v5c3.5 2.7 8.5 2.7 12 0v-5" />
            <path d="M22 8v6" />
          </>
        )}
        {name === "certificate" && (
          <>
            <circle cx="12" cy="8" r="5" />
            <path d="m8.5 12.2-1 8 4.5-2.5 4.5 2.5-1-8" />
            <path d="m10 8 1.3 1.3L14 6.5" />
          </>
        )}
        {name === "book" && (
          <>
            <path d="M12 6a8 8 0 0 0-9-1v14a8 8 0 0 1 9 1c2.4-2 6-2 9-1V5a8 8 0 0 0-9 1Z" />
            <path d="M12 6v14" />
          </>
        )}
        {name === "community" && (
          <>
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20v-2a6 6 0 0 1 12 0v2" />
            <circle cx="17" cy="8" r="2" />
            <path d="M17 14a5 5 0 0 1 4 5v1" />
          </>
        )}
      </svg>
    </span>
  );
}
