const pieces = {
  knight: "M7 20h11M8 17h9l-1-5V8l-4-5-1 3-4 3v4l4-1-3 5ZM12 8h.01",
  rook: "M6 3v5l2 2v7h8v-7l2-2V3h-3v3h-2V3h-2v3H9V3H6ZM6 20h12",
  bishop: "M7 20h10M8 17h8l-2-5c5-3 0-7-2-9-2 2-7 6-2 9l-2 5ZM12 6l2 2",
  king: "M12 2v5M10 4h4M8 17h8l2-7-4 1-2-4-2 4-4-1 2 7ZM7 20h10",
};

export default function ChessIcon({ piece = "knight", className = "" }) {
  return (
    <svg className={`chess-icon ${className}`.trim()} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      <path d={pieces[piece]} />
    </svg>
  );
}
