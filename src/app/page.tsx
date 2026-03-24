import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <p className="text-lg text-slate-700">生産管理デモ</p>
      <Link
        href="/orders/new"
        className="rounded border border-slate-400 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
      >
        受注登録へ
      </Link>
    </div>
  );
}
