// A study buddy's first letter in a circle, next to their first name (#67: we only ever have a first name,
// never a photo or an email). Purely visual: the name is always written out next to it.
// large: in a chat's header, next to the name and course
function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  // Array.from so a name starting with an accented or non-Latin letter keeps the whole character
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span className={`avatar${large ? " avatar-lg" : ""}`} aria-hidden="true">
      {initial}
    </span>
  );
}

export default Avatar;
