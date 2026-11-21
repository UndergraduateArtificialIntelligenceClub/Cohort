// Red count next to "Study buddy" in the nav: issue #67
// The number comes from lib/useUnreadCount.ts, so you notice new chats while on other pages.
function StudyBuddyBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="count-badge">
      {count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

export default StudyBuddyBadge;
