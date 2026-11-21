import { useEffect, useState } from "react";
import { unreadCount } from "./studyBuddy";
import { supabase, supabaseConfigured } from "./supabase";

// Unread study buddy chats (#67): active chats with a new match or a message you haven't opened yet.
// App.tsx calls this once and hands the number to both navs (top tabs on desktop, bottom tabs on phones).
export function useUnreadCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let active = true;
    const update = () => {
      unreadCount()
        .then((n) => {
          if (active) setCount(n);
        })
        .catch(console.error);
    };
    update();
    // New or ended matches, chats being opened (read), and new messages. Supabase only sends my own rows.
    const channel = supabase
      .channel("study-buddy-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "study_matches" }, update)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "study_messages" }, update)
      .subscribe();
    // In case a live update was missed while the tab was in the background
    window.addEventListener("focus", update);
    return () => {
      active = false;
      supabase.removeChannel(channel);
      window.removeEventListener("focus", update);
    };
  }, []);

  return count;
}
