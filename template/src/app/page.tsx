import { sections } from "@/content";

export default function Home() {
  if (sections.length === 0) {
    return (
      <main>
        <p className="p-16 text-center text-neutral-400">
          No sections yet — add one component per section in src/components and list
          them in src/content.ts.
        </p>
      </main>
    );
  }
  return (
    <main>
      {sections.map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </main>
  );
}
