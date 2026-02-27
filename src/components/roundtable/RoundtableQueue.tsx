import type { RoundtableSessionSnapshot } from "@/lib/roundtable/types";

type RoundtableQueueProps = {
  queue: RoundtableSessionSnapshot["queue"];
};

export default function RoundtableQueue({ queue }: RoundtableQueueProps) {
  return (
    <section className="roundtable-panel" aria-label="Speaker queue">
      <h4>Queue</h4>
      {!queue.length ? <p className="roundtable-muted">No one in queue yet.</p> : null}
      <ol className="roundtable-queue-list">
        {queue.map((turn, index) => (
          <li key={turn.id}>
            <span>#{index + 1}</span>
            <strong>{turn.member_display_name}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}
