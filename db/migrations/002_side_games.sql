-- Games played alongside the round's Nassau (rounds.game), e.g. 9 Point.
-- Each entry: { id, type, players: [...], stake, ...options }.
alter table rounds add column side_games jsonb not null default '[]'::jsonb;
