import { useState } from "react";
import type { Category, Deadline } from "../types";


type Props = {
  deadline: Deadline;
  onClose: () => void;
  onDone: () => void;
  onDelete: () => void;
  onSave: (changes: Partial<Deadline>) => void;
};

function DeadlineModal({ deadline, onClose, onDone, onDelete, onSave }: Props) {
    const [showSource, setShowSource] = useState(false);
    const [edited, setEdited] = useState(deadline);
    return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-lg bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-xl font-bold">Deadline Details</h2>
        
<div className="space-y-2"> 
        <label className="flex flex-col gap-1"> 
            Course <input // edit course 
            className="rounded border p-2" 
            value={edited.course} 
            onChange={(e) => setEdited({ ...edited, course: e.target.value })}/>
        </label>

<div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
            Title <input // edit title
            className="rounded border p-2"
            value={edited.title}
            onChange={(e) => setEdited({ ...edited, title: e.target.value })}/>
        </label>

        <label className="flex flex-col gap-1">
            Date <input //edit date
            type="date"
            className="rounded border p-2"
            value={edited.date}
            onChange={(e) => setEdited({ ...edited, date: e.target.value })}/>
        </label>
</div> 

        <label className="flex flex-col gap-1">
            Category <div // choose a category
            className="flex flex-wrap gap-2"> {["assignment", "lab", "quiz", "midterm", "final", "other"].map(
            (category) => (
                <button
                    key={category}
                    type="button"
                    className={`rounded border px-2 py-2 text-sm ${edited.category === category ? "bg-black text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"}`}
                    onClick={() => setEdited({...edited, category: category as Category,})}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
                </button>
                )
            )}
            </div>
        </label>

        <label className="flex flex-col gap-1">
            Weight (%) <input //edit weight
            type="number"
            className="rounded border p-2"
            value={edited.weight ?? ""}
            onChange={(e) => setEdited({...edited, weight: e.target.value === "" ? null : Number(e.target.value)})}/>
        </label>

        <button //if the user wants to see the source text, they can click this and see
            className="text-sm text-gray-600 underline"
            onClick={() => setShowSource(!showSource)}>
        {showSource ? "Hide Extracted Text" : "Show Extracted Text"}
        </button>

        {showSource && (<div className="mt-2 rounded bg-gray-100 p-3 text-sm"> {deadline.source_text} </div>)}

</div>

<div className="mt-4 flex items-center gap-2">
        <button //mark done button
            className="rounded bg-green-600 px-2 py-2 text-white hover:bg-green-700"
            onClick={onDone}
        >
            {deadline.done ? "Mark Undone" : "Mark Done"}
        </button>

        <button //delete deadline button
            className="rounded bg-red-600 px-2 py-2 text-white hover:bg-red-700"
            onClick={onDelete}
        >
            Delete
        </button>

        <button //save changes button
            className="rounded bg-blue-600 px-2 py-2 text-white hover:bg-blue-700"
            onClick={() => onSave(edited)}
        >
            Save Changes
        </button>

<div className="flex-1" />
        <button // close popup button
          className="rounded border border-gray-300 px-2 py-2 text-gray-700 hover:bg-gray-100"
          onClick={onClose}
        >
          Close
        </button>
</div>

      </div>
    </div>
  );
}

export default DeadlineModal;