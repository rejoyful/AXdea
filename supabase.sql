-- AXdea 스키마 — Supabase SQL Editor에 붙여넣고 1회 실행
-- (프로젝트 생성 후: 좌측 SQL Editor → New query → 아래 전체 붙여넣기 → Run)

create table if not exists ideas (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text default '',
  category     text default 'etc',
  color        text default '#FFD6A5',
  avatar_style text not null,
  avatar_seed  text not null,
  author       text not null,
  created_at   timestamptz default now()
);

create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid references ideas(id) on delete cascade,
  author     text not null,
  body       text not null,
  created_at timestamptz default now()
);

-- 반려 상태 (open | rejected)
alter table ideas add column if not exists status text default 'open';

-- 좋아요 (1인 1회, 토글) — 개수는 행 수로 집계
create table if not exists likes (
  idea_id    uuid references ideas(id) on delete cascade,
  voter      text not null,
  created_at timestamptz default now(),
  primary key (idea_id, voter)
);

alter table ideas    enable row level security;
alter table comments enable row level security;
alter table likes    enable row level security;

-- 내부 신뢰 기반 파일럿: 익명(anon) 읽기/쓰기 허용
drop policy if exists "anon read ideas"    on ideas;
drop policy if exists "anon write ideas"   on ideas;
drop policy if exists "anon update ideas"  on ideas;
drop policy if exists "anon delete ideas"  on ideas;
drop policy if exists "anon read comments"  on comments;
drop policy if exists "anon write comments" on comments;

create policy "anon read ideas"    on ideas    for select using (true);
create policy "anon write ideas"   on ideas    for insert with check (true);
create policy "anon update ideas"  on ideas    for update using (true) with check (true);
create policy "anon delete ideas"  on ideas    for delete using (true);
drop policy if exists "anon update comments" on comments;
drop policy if exists "anon delete comments" on comments;
create policy "anon read comments"   on comments for select using (true);
create policy "anon write comments"  on comments for insert with check (true);
create policy "anon update comments" on comments for update using (true) with check (true);
create policy "anon delete comments" on comments for delete using (true);

drop policy if exists "anon read likes"   on likes;
drop policy if exists "anon write likes"  on likes;
drop policy if exists "anon delete likes" on likes;
create policy "anon read likes"   on likes for select using (true);
create policy "anon write likes"  on likes for insert with check (true);
create policy "anon delete likes" on likes for delete using (true);

-- (선택) 진짜 '즉시' 실시간을 원하면 아래 실행 — 안 해도 앱은 4초 폴링으로 반영됨.
-- 이미 추가돼 있으면 "already member" 에러가 날 수 있는데 무시해도 됩니다.
alter publication supabase_realtime add table ideas;
alter publication supabase_realtime add table comments;
