import { turnOffNotifications } from "./notifications";
import { supabase } from "./supabase";

// Log out of this browser. First stop this device getting the account's notifications, while we're still
// logged in to do it, so the next person to use it doesn't see them. Gives up on that after 3 seconds.
export async function logOut(): Promise<void> {
  const giveUp = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  await Promise.race([turnOffNotifications().catch(console.error), giveUp]);
  // "local" logs out this browser even if the network request fails
  await supabase.auth.signOut({ scope: "local" });
}
