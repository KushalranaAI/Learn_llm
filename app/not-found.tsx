import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page narrow"><div className="card empty" style={{ padding: 64 }}>
      <h1>Not found</h1>
      <p className="lead" style={{ margin: "12px auto 24px" }}>That page does not exist (yet). The course is still growing.</p>
      <Link href="/" className="btn">Go home</Link>
    </div></div>
  );
}
