//! Operations SSE broadcaster.
//!
//! A single `OperationsBroadcaster` instance per backend process fans out
//! `OperationTransitionEvent`s to N connected SSE subscribers. Workers and the
//! HTTP state-change handlers call `publish(operation)` AFTER the relevant
//! store transaction commits (Phase 9b §"Risks" row 4 invariant); the
//! broadcaster assigns a monotonic `seq`, pushes the event into a 200-entry
//! ring buffer for `Last-Event-ID` replay, and sends the event over a
//! `tokio::sync::broadcast` channel.
//!
//! Codex pre-consult refinement A: a SINGLE `Mutex<Inner>` owns `next_seq`,
//! the buffer, AND a clone of the broadcast `Sender`. Holding the mutex
//! across the synchronous `tx.send()` makes per-event publishing atomic —
//! a subscriber that calls `subscribe()` while another thread is mid-publish
//! either sees the new event in the buffer OR receives it on the live
//! channel, never neither and never both with inconsistent seqs.

use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
};

use distill_portal_ui_api_contracts::OperationTransitionEvent;
use tokio::sync::broadcast;

use crate::Operation;

/// Number of past events kept for `Last-Event-ID` replay. Sized at 200 per
/// Phase 9b spec §"SSE Channel Design" — covers minutes of typical activity.
const RING_BUFFER_CAPACITY: usize = 200;

/// `tokio::sync::broadcast` channel capacity. Each connected SSE client gets
/// a `Receiver` cloned from this channel; the capacity bounds how far behind
/// a slow client can fall before its `Receiver::recv()` returns
/// `RecvError::Lagged`. The SSE handler treats a lag as a hard reconnect
/// signal (emits one `event: resync` and closes the stream).
const BROADCAST_CHANNEL_CAPACITY: usize = 256;

struct Inner {
    next_seq: u64,
    buffer: VecDeque<OperationTransitionEvent>,
    /// Cloned per subscriber via `tx.subscribe()`. Kept inside the mutex so
    /// `publish` can lock-and-send atomically with the buffer push.
    tx: broadcast::Sender<OperationTransitionEvent>,
}

/// Process-singleton fan-out for [`OperationTransitionEvent`].
#[derive(Debug)]
pub struct OperationsBroadcaster {
    inner: Arc<Mutex<Inner>>,
}

impl std::fmt::Debug for Inner {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OperationsBroadcasterInner")
            .field("next_seq", &self.next_seq)
            .field("buffer_len", &self.buffer.len())
            .finish_non_exhaustive()
    }
}

/// Snapshot returned to a newly-subscribed SSE client.
pub struct Subscription {
    /// Replay events whose `seq` is greater than the client's
    /// `Last-Event-ID`. Empty when the client passed no `Last-Event-ID` or
    /// when the buffer has nothing newer than the client's last seen seq.
    pub backlog: Vec<OperationTransitionEvent>,
    /// `seq` of the last event in `backlog`, if any. The SSE handler uses
    /// this to dedupe live events whose `seq` is `<= last_backlog_seq` (they
    /// were already delivered as part of the backlog).
    pub last_backlog_seq: Option<u64>,
    /// Live broadcast receiver. The SSE handler drains this in a per-client
    /// bridge task.
    pub receiver: broadcast::Receiver<OperationTransitionEvent>,
    /// `Some(reason)` when the client's `Last-Event-ID` falls before the
    /// oldest buffered event — the SSE handler MUST emit a single
    /// `event: resync` frame so the client re-fetches via
    /// `GET /api/v1/operations`.
    pub resync_reason: Option<String>,
}

impl OperationsBroadcaster {
    /// Construct a fresh broadcaster with empty buffer and `next_seq = 1`.
    pub fn new() -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(BROADCAST_CHANNEL_CAPACITY);
        Arc::new(Self {
            inner: Arc::new(Mutex::new(Inner {
                next_seq: 1,
                buffer: VecDeque::with_capacity(RING_BUFFER_CAPACITY),
                tx,
            })),
        })
    }

    /// Publish a state transition.
    ///
    /// The `seq` assignment, buffer push, and `tx.send()` happen under one
    /// mutex acquisition so live subscribers and reconnecting clients see
    /// consistent ordering. Phase 9b §"Risks" row 4 invariant: callers MUST
    /// only invoke this AFTER the corresponding store transaction commits.
    ///
    /// Returns the assigned `seq` (primarily useful for tests).
    pub fn publish(&self, operation: Operation) -> u64 {
        let mut inner = self.inner.lock().expect("OperationsBroadcaster poisoned");
        let seq = inner.next_seq;
        inner.next_seq += 1;
        let event = OperationTransitionEvent { operation, seq };
        if inner.buffer.len() >= RING_BUFFER_CAPACITY {
            inner.buffer.pop_front();
        }
        inner.buffer.push_back(event.clone());
        // `tokio::sync::broadcast::Sender::send` is synchronous; safe to
        // hold the mutex across it. `SendError` (no live subscribers) is
        // ignored — replay covers any reconnecting client.
        let _ = inner.tx.send(event);
        seq
    }

    /// Subscribe to live transitions, optionally replaying events newer
    /// than `last_event_id`.
    ///
    /// Codex pre-consult refinement A: subscribe to the live channel BEFORE
    /// reading the backlog snapshot so no event slips between the snapshot
    /// read and the live tail. The SSE handler is responsible for deduping
    /// live events whose `seq <= last_backlog_seq`.
    pub fn subscribe(&self, last_event_id: Option<u64>) -> Subscription {
        let inner = self.inner.lock().expect("OperationsBroadcaster poisoned");
        let receiver = inner.tx.subscribe();
        let (backlog, resync_reason) = match last_event_id {
            Some(client_seq) => {
                if let Some(oldest_buffered) = inner.buffer.front() {
                    // Resync when the buffer has already evicted the event
                    // immediately after the client's last seen seq.
                    if client_seq + 1 < oldest_buffered.seq {
                        let reason = format!(
                            "last_event_id {} older than oldest buffered seq {}",
                            client_seq, oldest_buffered.seq
                        );
                        (Vec::new(), Some(reason))
                    } else {
                        let replay: Vec<_> = inner
                            .buffer
                            .iter()
                            .filter(|e| e.seq > client_seq)
                            .cloned()
                            .collect();
                        (replay, None)
                    }
                } else {
                    // Buffer empty; nothing to replay and no resync needed.
                    (Vec::new(), None)
                }
            }
            None => (Vec::new(), None),
        };
        let last_backlog_seq = backlog.last().map(|e| e.seq);
        Subscription {
            backlog,
            last_backlog_seq,
            receiver,
            resync_reason,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use serde_json::json;
    use tokio::time::timeout;

    use super::{OperationsBroadcaster, RING_BUFFER_CAPACITY};
    use crate::{Operation, OperationKind, OperationStatus};

    fn operation_with_id(suffix: &str) -> Operation {
        Operation {
            id: format!("op-{suffix}"),
            kind: OperationKind::ImportSessions,
            status: OperationStatus::Queued,
            canonical_params_hash: format!("{suffix:0<64}"),
            input_version: format!("input-{suffix}"),
            params_json: json!({"suffix": suffix}),
            result_json: None,
            error_json: None,
            submitted_at: "2026-05-18T00:00:00Z".to_string(),
            started_at: None,
            finished_at: None,
            cancel_requested_at: None,
        }
    }

    #[test]
    fn publish_assigns_monotonic_seq() {
        let broadcaster = OperationsBroadcaster::new();
        let s1 = broadcaster.publish(operation_with_id("a"));
        let s2 = broadcaster.publish(operation_with_id("b"));
        let s3 = broadcaster.publish(operation_with_id("c"));
        assert_eq!((s1, s2, s3), (1, 2, 3));
    }

    #[test]
    fn subscribe_with_no_last_event_id_returns_empty_backlog() {
        let broadcaster = OperationsBroadcaster::new();
        broadcaster.publish(operation_with_id("a"));
        let subscription = broadcaster.subscribe(None);
        assert!(subscription.backlog.is_empty());
        assert!(subscription.resync_reason.is_none());
        assert_eq!(subscription.last_backlog_seq, None);
    }

    #[test]
    fn subscribe_with_known_last_event_id_replays_from_ring_buffer() {
        let broadcaster = OperationsBroadcaster::new();
        for suffix in ["a", "b", "c", "d", "e"] {
            broadcaster.publish(operation_with_id(suffix));
        }
        let subscription = broadcaster.subscribe(Some(2));
        assert!(subscription.resync_reason.is_none());
        let seqs: Vec<u64> = subscription.backlog.iter().map(|e| e.seq).collect();
        assert_eq!(seqs, vec![3, 4, 5]);
        assert_eq!(subscription.last_backlog_seq, Some(5));
    }

    #[test]
    fn subscribe_with_stale_last_event_id_emits_resync() {
        let broadcaster = OperationsBroadcaster::new();
        // Publish more than the ring buffer can hold; the earliest seqs
        // are evicted.
        for index in 0..(RING_BUFFER_CAPACITY + 50) {
            broadcaster.publish(operation_with_id(&index.to_string()));
        }
        let subscription = broadcaster.subscribe(Some(10));
        assert!(subscription.resync_reason.is_some());
        assert!(subscription.backlog.is_empty());
        assert_eq!(subscription.last_backlog_seq, None);
    }

    #[test]
    fn ring_buffer_evicts_oldest_when_over_capacity() {
        let broadcaster = OperationsBroadcaster::new();
        for index in 0..(RING_BUFFER_CAPACITY + 1) {
            broadcaster.publish(operation_with_id(&index.to_string()));
        }
        // After 201 publishes with capacity 200, the oldest retained seq
        // should be 2 (seq 1 evicted on the 201st publish). Subscribing
        // with `Some(1)` is the resume point of a client that last saw
        // seq 1 — it is exactly at the edge of the buffer, so resync MUST
        // NOT fire and the backlog MUST start at seq 2.
        let subscription = broadcaster.subscribe(Some(1));
        assert!(
            subscription.resync_reason.is_none(),
            "expected no resync; got {:?}",
            subscription.resync_reason
        );
        let first = subscription
            .backlog
            .first()
            .expect("non-empty backlog after 201 publishes");
        assert_eq!(first.seq, 2);
        assert_eq!(subscription.backlog.len(), RING_BUFFER_CAPACITY);
    }

    #[tokio::test]
    async fn multiple_subscribers_each_receive_live_events() {
        let broadcaster = OperationsBroadcaster::new();
        let mut r1 = broadcaster.subscribe(None).receiver;
        let mut r2 = broadcaster.subscribe(None).receiver;
        let mut r3 = broadcaster.subscribe(None).receiver;

        broadcaster.publish(operation_with_id("a"));
        broadcaster.publish(operation_with_id("b"));

        for receiver in [&mut r1, &mut r2, &mut r3] {
            let event_one = timeout(Duration::from_millis(50), receiver.recv())
                .await
                .expect("receiver got first event")
                .expect("no recv error");
            assert_eq!(event_one.seq, 1);
            let event_two = timeout(Duration::from_millis(50), receiver.recv())
                .await
                .expect("receiver got second event")
                .expect("no recv error");
            assert_eq!(event_two.seq, 2);
        }
    }

    #[tokio::test]
    async fn subscribe_before_publish_sees_event_via_live_channel() {
        let broadcaster = OperationsBroadcaster::new();
        let subscription = broadcaster.subscribe(None);
        let mut receiver = subscription.receiver;
        // Publish AFTER subscribe — the receiver must observe the event on
        // the live channel even though it was not in the backlog.
        broadcaster.publish(operation_with_id("live"));
        let event = timeout(Duration::from_millis(50), receiver.recv())
            .await
            .expect("receiver observed published event")
            .expect("no recv error");
        assert_eq!(event.seq, 1);
        assert_eq!(event.operation.id, "op-live");
    }
}
