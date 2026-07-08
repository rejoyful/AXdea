-- AXdea MySQL 스키마 (빈 DB 신규 세팅용 참고). 이미 이전 완료된 서버는 실행 불필요.
create table if not exists ideas (
  id char(36) primary key, title text not null, body text,
  category varchar(32) default 'etc', color varchar(16) default '#22e3ff',
  avatar_style varchar(64), avatar_seed varchar(255), author varchar(255) not null,
  created_at datetime(6), round varchar(255) default 'lab-day', status varchar(32) default 'open'
) engine=InnoDB default charset=utf8mb4;
create table if not exists comments (
  id char(36) primary key, idea_id char(36), author varchar(255) not null, body text not null, created_at datetime(6),
  key idx_comments_idea (idea_id),
  constraint fk_comments_idea foreign key (idea_id) references ideas(id) on delete cascade
) engine=InnoDB default charset=utf8mb4;
create table if not exists likes (
  idea_id char(36), voter varchar(255) not null, created_at datetime(6),
  primary key (idea_id, voter),
  constraint fk_likes_idea foreign key (idea_id) references ideas(id) on delete cascade
) engine=InnoDB default charset=utf8mb4;
create table if not exists app_state (`key` varchar(191) primary key, `value` text) engine=InnoDB default charset=utf8mb4;
insert into app_state (`key`,`value`) values ('active_round','lab-day') on duplicate key update `value`=`value`;
