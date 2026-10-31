-- t1221: повторы 2×2 и «Все ×3…×8» — все места партии (до 8). Только добавление.
-- seats: JSON {mode, s: [{u, nick, race, team, bot}]}; p0/p1/nick0/nick1 остаются (первые два места, старые записи).
ALTER TABLE strat_replays ADD COLUMN seats TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS strat_replay_players (
  replay_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  PRIMARY KEY (replay_id, seat)
);
CREATE INDEX IF NOT EXISTS idx_srp_user ON strat_replay_players (user_id, replay_id);
