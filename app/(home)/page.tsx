import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center text-center flex-1">
      <h1 className="text-2xl font-bold mb-4">Swifty Homepage</h1>
      <p>
        You can open{" "}
        <Link href="/base/network" className="font-medium underline">
          /base/network
        </Link>{" "}
        and see the documentation.
      </p>
    </div>
  );
}
