export default function Timer({ formatted, remaining }) {
  const low = remaining <= 60;
  return (
    <div className={`px-3 py-1 rounded font-mono text-lg font-semibold ${low ? "bg-red-100 text-red-700 animate-pulse" : "bg-blue-100 text-blue-700"}`}>
      {formatted}
    </div>
  );
}
