// Upload page UI: issue #28
import { useState } from "react";
import ReviewPopup from "../components/ReviewPopup";
import { API } from "../lib/config";
import type { Deadline, ParseResponse } from "../types";

function Upload() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Deadline[] | null>(null);

  function pickFile(f: File | undefined){
    if (!f) return;
    if (f.type !== "application/pdf"){
      setError("That file isn't a PDF.");
      return;
    }
    setError("");
    setFile(f);
  }

  // Turns a failed backend response into a readable message.
  // FastAPI sends errors as { "detail": "..." }
  async function readError(res: Response) {
    try {
      const body = await res.json();
      if (typeof body.detail === "string") return body.detail;
    } catch {
      // the body wasn't JSON, so fall through to the generic message
    }
    return `Server error (${res.status})`;
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      let data: ParseResponse;

      if (file) {
        const form = new FormData();
        form.append("file", file);    // matches the /parse-pdf endpoint (#25)
        const res = await fetch(`${API}/parse-pdf`, { method: "POST", body: form });
        if (!res.ok) throw new Error(await readError(res));
        data = await res.json();
      } else {
        const res = await fetch(`${API}/parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(await readError(res));
        data = await res.json();
      }

      setPending(data.deadlines);
    } catch (e) {
      if (e instanceof TypeError) {
        setError("Couldn't reach the server. Is the backend running?");
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Upload</h1>
      <textarea
        value = {text}
        onChange={(e) => setText(e.target.value)}
        placeholder = "Paste your syllabus text here..."
        className = "h-48 w-full rounded border p-2"
      />
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {e.preventDefault(); pickFile(e.dataTransfer.files[0]);}}
        className = "flex h-32 cursor-pointer items-center justify-center rounded border-2 border-dashed text-gray-500"
      >
        {file ? file.name: "Drop a PDF here or click to browse"}
        <input
          type = "file"
          accept = "application/pdf"
          className = "hidden"
          onChange = {(e) => pickFile(e.target.files?.[0])}
          />
      </label>
      <button
        onClick={handleSubmit}
        disabled={loading || (!text.trim() && !file)}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Parsing..." : "Parse syllabus"}
      </button>

      {error && <p className="text-red-600">{error}</p>}

      {pending && (
        <ReviewPopup
          pending={pending}
          onDone={(confirmed) => {
            // TODO: save confirmed deadlines to the database (not part of #28)
            console.log("Confirmed:", confirmed);
            setPending(null);
          }}
        />
      )}
    </main>
  );
}

export default Upload;
