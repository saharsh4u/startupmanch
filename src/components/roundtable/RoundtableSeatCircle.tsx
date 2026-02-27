import type { RoundtableMemberRow } from "@/lib/roundtable/types";

type RoundtableSeatCircleProps = {
  members: RoundtableMemberRow[];
  activeMemberId: string | null;
  queuedMemberIds: string[];
  currentMemberId: string | null;
};

export default function RoundtableSeatCircle({
  members,
  activeMemberId,
  queuedMemberIds,
  currentMemberId,
}: RoundtableSeatCircleProps) {
  const bySeat = new Map<number, RoundtableMemberRow>();
  for (const member of members) {
    if (member.state !== "joined") continue;
    bySeat.set(member.seat_no, member);
  }

  return (
    <section className="roundtable-seat-circle" aria-label="Roundtable seats">
      {Array.from({ length: 5 }, (_, index) => {
        const seatNo = index + 1;
        const member = bySeat.get(seatNo) ?? null;
        const isActive = Boolean(member && member.id === activeMemberId);
        const isQueued = Boolean(member && queuedMemberIds.includes(member.id));
        const isMe = Boolean(member && member.id === currentMemberId);

        const className = [
          "roundtable-seat",
          isActive ? "is-active" : "",
          isQueued ? "is-queued" : "",
          isMe ? "is-me" : "",
          !member ? "is-empty" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <article key={`seat-${seatNo}`} className={className}>
            <div className="roundtable-seat-index">Seat {seatNo}</div>
            <strong>{member ? member.display_name : "Open seat"}</strong>
            <p>
              {isActive
                ? "Speaking"
                : isQueued
                  ? "Hand raised"
                  : member
                    ? "Listening"
                    : "Available"}
            </p>
          </article>
        );
      })}
    </section>
  );
}
