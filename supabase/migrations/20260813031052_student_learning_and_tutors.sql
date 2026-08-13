-- EDU톡 운영 DB 기반: 학생별 성적·성장·교사 AI 기록·개인 튜터
-- 실제 Supabase 프로젝트 연결 후 CLI로 적용한다. public 테이블은 모두 RLS를 사용한다.

create extension if not exists pgcrypto;

create type public.edutalk_role as enum ('PARENT', 'STUDENT', 'TEACHER');
create type public.assessment_kind as enum ('SCHOOL', 'MOCK', 'CSAT');
create type public.growth_category as enum ('LEARNING', 'PARTICIPATION', 'SOCIAL', 'SELF_MANAGEMENT', 'CAREER');
create type public.ai_draft_kind as enum ('JOURNAL', 'SCHOOL_RECORD');
create type public.subscription_plan as enum ('FREE', 'UNLIMITED');
create type public.institution_review_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'TEMPORARILY_HIDDEN');
create type public.communication_kind as enum ('NOTICE', 'JOURNAL', 'MESSAGE');
create type public.tutor_credential_kind as enum ('IDENTITY', 'TEACHING_CERT', 'LANGUAGE_SCORE', 'DEGREE');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  active_role public.edutalk_role,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role public.edutalk_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- 출시 전 동의·보호자 아래 자녀 프로필 기반. 실제 법률 문구와 수집 범위는 출시 전 확정한다.
create type public.edutalk_age_band as enum ('UNDER_14', 'FOURTEEN_PLUS', 'ADULT');

create table public.user_consents (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  age_band public.edutalk_age_band not null,
  terms_version text not null,
  privacy_version text not null,
  community_version text not null,
  consented_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.child_profiles (
  id uuid primary key default gen_random_uuid(),
  guardian_user_id uuid not null references public.profiles(user_id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 24),
  grade_level text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  alias text not null check (char_length(alias) between 1 and 24),
  grade_level text not null,
  class_name text not null default '',
  institution_id uuid,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_user_links (
  student_id uuid not null references public.students(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  relationship public.edutalk_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (student_id, user_id, relationship),
  constraint student_link_relationship check (relationship in ('PARENT', 'STUDENT', 'TEACHER'))
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  kind public.assessment_kind not null,
  title text not null,
  assessed_on date not null,
  term text not null,
  max_total numeric(7,2) not null check (max_total > 0),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, student_id)
);

create table public.subject_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  subject text not null,
  score numeric(7,2) not null check (score >= 0),
  max_score numeric(7,2) not null check (max_score > 0 and score <= max_score),
  grade_band smallint check (grade_band between 1 and 9),
  percentile numeric(5,2) check (percentile between 0 and 100),
  recorded_by uuid references public.profiles(user_id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (assessment_id, subject),
  foreign key (assessment_id, student_id) references public.assessments(id, student_id) on delete cascade
);

create table public.growth_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  category public.growth_category not null,
  observed_on date not null,
  level smallint not null check (level between 1 and 5),
  title text not null,
  note text not null,
  teacher_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.ai_usage_accounts (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  plan public.subscription_plan not null default 'FREE',
  free_limit smallint not null default 10 check (free_limit = 10),
  used_count integer not null default 0 check (used_count >= 0),
  subscription_active boolean not null default false,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_user_id uuid not null references public.profiles(user_id) on delete cascade,
  kind public.ai_draft_kind not null,
  section text,
  evidence text not null,
  content jsonb not null,
  generation_mode text not null check (generation_mode in ('openai', 'demo-template')),
  teacher_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

-- OAuth·매직링크 가입 직후 앱 기본 레코드를 만든다. 사용자 표시명은 인증 공급자 정보 또는 이메일 앞부분을 사용한다.
create or replace function public.handle_new_edutalk_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_name text;
begin
  resolved_name := left(coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(split_part(new.email, '@', 1), ''), 'EDU톡 사용자'), 40);
  insert into public.profiles (user_id, display_name) values (new.id, resolved_name);
  insert into public.ai_usage_accounts (user_id) values (new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_edutalk_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_edutalk_user();

-- 무료 10회 또는 활성 무제한 구독을 서버에서 한 번에 판정·차감한다.
create or replace function public.consume_ai_credit()
returns table (allowed boolean, remaining integer, plan public.subscription_plan)
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.ai_usage_accounts%rowtype;
begin
  if auth.uid() is null then
    return query select false, 0, 'FREE'::public.subscription_plan;
    return;
  end if;

  select * into account
  from public.ai_usage_accounts
  where user_id = auth.uid()
  for update;

  if not found then
    insert into public.ai_usage_accounts (user_id) values (auth.uid()) returning * into account;
  end if;

  if account.plan = 'UNLIMITED' and account.subscription_active
    and (account.current_period_end is null or account.current_period_end > now()) then
    return query select true, -1, account.plan;
    return;
  end if;

  if account.used_count >= account.free_limit then
    return query select false, 0, account.plan;
    return;
  end if;

  update public.ai_usage_accounts
  set used_count = used_count + 1, updated_at = now()
  where user_id = auth.uid()
  returning * into account;

  return query select true, greatest(account.free_limit - account.used_count, 0), account.plan;
end;
$$;

revoke all on function public.consume_ai_credit() from public, anon;
grant execute on function public.consume_ai_credit() to authenticated;

create table public.institution_reviews (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  author_user_id uuid not null references public.profiles(user_id) on delete cascade,
  relation public.edutalk_role not null,
  scores jsonb not null,
  strength text not null,
  improvement text not null,
  recommend_to text not null,
  verification_request_id uuid,
  status public.institution_review_status not null default 'PENDING',
  anonymous_public_author boolean not null default false,
  author_hidden_at timestamptz,
  created_at timestamptz not null default now(),
  constraint teacher_reviews_are_anonymous check (relation <> 'TEACHER' or anonymous_public_author)
);

create table public.tutor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(user_id) on delete cascade,
  display_name text not null,
  subjects text[] not null default '{}',
  target_grades text[] not null default '{}',
  zones text[] not null default '{}',
  introduction text not null default '',
  price_per_hour integer not null check (price_per_hour >= 0),
  response_rate smallint not null default 0 check (response_rate between 0 and 100),
  verified boolean not null default false,
  identity_verified boolean not null default false,
  verification_level text not null default 'PENDING' check (verification_level in ('IDENTITY', 'CREDENTIALS', 'PENDING')),
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tutor_credentials (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles(id) on delete cascade,
  kind public.tutor_credential_kind not null,
  public_label text not null,
  issuer text,
  public_value text,
  verified boolean not null default false,
  expires_on date,
  reviewed_at timestamptz,
  unique (tutor_id, kind)
);

create table public.tutor_jobs (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null,
  student_grade text not null,
  subject text not null,
  zone text not null,
  schedule text not null,
  budget_per_hour integer not null check (budget_per_hour >= 0),
  detail text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  created_at timestamptz not null default now()
);

create table public.tutor_reviews (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles(id) on delete cascade,
  author_user_id uuid not null references public.profiles(user_id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  content text not null check (char_length(content) between 10 and 3000),
  photo_path text,
  verified_lesson boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tutor_id, author_user_id)
);

create table public.tutor_review_media (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.tutor_reviews(id) on delete cascade,
  storage_bucket text not null,
  storage_object_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (storage_bucket, storage_object_path)
);

create table public.communication_threads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_user_id uuid not null references public.profiles(user_id) on delete cascade,
  parent_user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint communication_threads_participants_key unique (student_id, teacher_user_id, parent_user_id)
);

create table public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.communication_threads(id) on delete cascade,
  author_user_id uuid not null references public.profiles(user_id) on delete cascade,
  kind public.communication_kind not null,
  body text not null check (char_length(body) between 1 and 5000),
  is_important boolean not null default false,
  attachment_path text,
  shared_ai_draft_id uuid references public.ai_drafts(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.communication_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.communication_messages(id) on delete cascade,
  storage_bucket text not null,
  storage_object_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  created_at timestamptz not null default now(),
  unique (message_id),
  unique (storage_bucket, storage_object_path)
);

create index assessments_student_date_idx on public.assessments (student_id, assessed_on desc);
create index subject_scores_student_idx on public.subject_scores (student_id, recorded_at desc);
create index growth_records_student_idx on public.growth_records (student_id, observed_on desc);
create index ai_drafts_student_idx on public.ai_drafts (student_id, created_at desc);
create index institution_reviews_institution_idx on public.institution_reviews (institution_id, relation, status, created_at desc);
create index tutor_jobs_zone_status_idx on public.tutor_jobs (zone, status, created_at desc);
create index tutor_reviews_tutor_idx on public.tutor_reviews (tutor_id, created_at desc);
create index tutor_review_media_review_idx on public.tutor_review_media (review_id, created_at);
create index communication_messages_thread_idx on public.communication_messages (thread_id, created_at desc);
create index communication_attachments_message_idx on public.communication_attachments (message_id);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_consents enable row level security;
alter table public.child_profiles enable row level security;
alter table public.students enable row level security;
alter table public.student_user_links enable row level security;
alter table public.assessments enable row level security;
alter table public.subject_scores enable row level security;
alter table public.growth_records enable row level security;
alter table public.ai_usage_accounts enable row level security;
alter table public.ai_drafts enable row level security;
alter table public.institution_reviews enable row level security;
alter table public.tutor_profiles enable row level security;
alter table public.tutor_credentials enable row level security;
alter table public.tutor_jobs enable row level security;
alter table public.tutor_reviews enable row level security;
alter table public.tutor_review_media enable row level security;
alter table public.communication_threads enable row level security;
alter table public.communication_messages enable row level security;
alter table public.communication_attachments enable row level security;

create policy "profiles read own" on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);
create policy "profiles update own" on public.profiles for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "roles read own" on public.user_roles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users manage own consents" on public.user_consents for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "guardians manage own child profiles" on public.child_profiles for all to authenticated
using (guardian_user_id = (select auth.uid())) with check (guardian_user_id = (select auth.uid()));

create policy "linked users read students" on public.students for select to authenticated
using (exists (
  select 1 from public.student_user_links link
  where link.student_id = students.id and link.user_id = (select auth.uid()) and link.is_active
));

create policy "users read own student links" on public.student_user_links for select to authenticated
using (user_id = (select auth.uid()));

create policy "teachers manage assessments" on public.assessments for all to authenticated
using (exists (
  select 1 from public.student_user_links link
  where link.student_id = assessments.student_id and link.user_id = (select auth.uid())
    and link.relationship = 'TEACHER' and link.is_active
))
with check (exists (
  select 1 from public.student_user_links link
  where link.student_id = assessments.student_id and link.user_id = (select auth.uid())
    and link.relationship = 'TEACHER' and link.is_active
));

create policy "linked users read assessments" on public.assessments for select to authenticated
using (exists (
  select 1 from public.student_user_links link
  where link.student_id = assessments.student_id and link.user_id = (select auth.uid()) and link.is_active
));

create policy "teachers manage scores" on public.subject_scores for all to authenticated
using (exists (
  select 1 from public.student_user_links link
  where link.student_id = subject_scores.student_id and link.user_id = (select auth.uid())
    and link.relationship = 'TEACHER' and link.is_active
))
with check (exists (
  select 1 from public.student_user_links link
  where link.student_id = subject_scores.student_id and link.user_id = (select auth.uid())
    and link.relationship = 'TEACHER' and link.is_active
));

create policy "linked users read scores" on public.subject_scores for select to authenticated
using (exists (
  select 1 from public.student_user_links link
  where link.student_id = subject_scores.student_id and link.user_id = (select auth.uid()) and link.is_active
));

create policy "teachers manage growth" on public.growth_records for all to authenticated
using (teacher_user_id = (select auth.uid()) and exists (
  select 1 from public.student_user_links link
  where link.student_id = growth_records.student_id and link.user_id = (select auth.uid())
    and link.relationship = 'TEACHER' and link.is_active
))
with check (teacher_user_id = (select auth.uid()) and exists (
  select 1 from public.student_user_links link
  where link.student_id = growth_records.student_id and link.user_id = (select auth.uid())
    and link.relationship = 'TEACHER' and link.is_active
));

create policy "linked users read growth" on public.growth_records for select to authenticated
using (exists (
  select 1 from public.student_user_links link
  where link.student_id = growth_records.student_id and link.user_id = (select auth.uid()) and link.is_active
));

create policy "users read own ai usage" on public.ai_usage_accounts for select to authenticated
using (user_id = (select auth.uid()));

create policy "teachers manage own drafts" on public.ai_drafts for all to authenticated
using (teacher_user_id = (select auth.uid()) and exists (
  select 1 from public.student_user_links link
  where link.student_id = ai_drafts.student_id and link.user_id = (select auth.uid())
    and link.relationship = 'TEACHER' and link.is_active
))
with check (teacher_user_id = (select auth.uid()) and exists (
  select 1 from public.student_user_links link
  where link.student_id = ai_drafts.student_id and link.user_id = (select auth.uid())
    and link.relationship = 'TEACHER' and link.is_active
));

create policy "authors manage pending institution reviews" on public.institution_reviews for all to authenticated
using (author_user_id = (select auth.uid()) and status = 'PENDING')
with check (author_user_id = (select auth.uid()) and status = 'PENDING');
create policy "authenticated users read approved institution reviews" on public.institution_reviews for select to authenticated
using (status = 'APPROVED' or author_user_id = (select auth.uid()));

create policy "authenticated users read verified or own tutor profiles" on public.tutor_profiles for select to authenticated
using (verified or user_id = (select auth.uid()));
create policy "public reads verified tutor profiles" on public.tutor_profiles for select to anon
using (verified);
create policy "tutors insert own pending profile" on public.tutor_profiles for insert to authenticated
with check (
  user_id = (select auth.uid()) and not verified and not identity_verified
  and verification_level = 'PENDING' and response_rate = 0
);
create policy "tutors update own pending profile" on public.tutor_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid()) and not verified and not identity_verified
  and verification_level = 'PENDING' and response_rate = 0
);

create policy "everyone reads verified tutor credentials" on public.tutor_credentials for select to authenticated
using (verified);
create policy "public reads verified tutor credentials" on public.tutor_credentials for select to anon
using (verified);
create policy "tutors read own credential status" on public.tutor_credentials for select to authenticated
using (exists (
  select 1 from public.tutor_profiles profile
  where profile.id = tutor_credentials.tutor_id and profile.user_id = (select auth.uid())
));

create policy "everyone reads open tutor jobs" on public.tutor_jobs for select to anon, authenticated
using (status = 'OPEN');
create policy "authors manage tutor jobs" on public.tutor_jobs for all to authenticated
using (author_user_id = (select auth.uid())) with check (author_user_id = (select auth.uid()));

create policy "everyone reads verified tutor reviews" on public.tutor_reviews for select to authenticated
using (verified_lesson or author_user_id = (select auth.uid()));
create policy "public reads verified tutor reviews" on public.tutor_reviews for select to anon
using (verified_lesson);
create policy "authors insert tutor reviews" on public.tutor_reviews for insert to authenticated
with check (author_user_id = (select auth.uid()) and not verified_lesson);
create policy "authors update tutor reviews" on public.tutor_reviews for update to authenticated
using (author_user_id = (select auth.uid()) and not verified_lesson)
with check (author_user_id = (select auth.uid()) and not verified_lesson);
create policy "authors delete tutor reviews" on public.tutor_reviews for delete to authenticated
using (author_user_id = (select auth.uid()) and not verified_lesson);

create policy "authors read own tutor review media" on public.tutor_review_media for select to authenticated
using (exists (
  select 1 from public.tutor_reviews review
  where review.id = tutor_review_media.review_id and review.author_user_id = (select auth.uid())
));
create policy "users read verified tutor review media" on public.tutor_review_media for select to authenticated
using (deleted_at is null and exists (
  select 1 from public.tutor_reviews review
  where review.id = tutor_review_media.review_id and review.verified_lesson
));
create policy "public reads verified tutor review media" on public.tutor_review_media for select to anon
using (deleted_at is null and exists (
  select 1 from public.tutor_reviews review
  where review.id = tutor_review_media.review_id and review.verified_lesson
));
create policy "authors add pending tutor review media" on public.tutor_review_media for insert to authenticated
with check (exists (
  select 1 from public.tutor_reviews review
  where review.id = tutor_review_media.review_id
    and review.author_user_id = (select auth.uid())
    and not review.verified_lesson
));
create policy "authors mark pending tutor review media deleted" on public.tutor_review_media for update to authenticated
using (exists (
  select 1 from public.tutor_reviews review
  where review.id = tutor_review_media.review_id
    and review.author_user_id = (select auth.uid())
    and not review.verified_lesson
))
with check (deleted_at is not null and exists (
  select 1 from public.tutor_reviews review
  where review.id = tutor_review_media.review_id
    and review.author_user_id = (select auth.uid())
    and not review.verified_lesson
));

create policy "thread participants read threads" on public.communication_threads for select to authenticated
using (teacher_user_id = (select auth.uid()) or parent_user_id = (select auth.uid()));
create policy "thread participants read messages" on public.communication_messages for select to authenticated
using (exists (
  select 1 from public.communication_threads thread
  where thread.id = communication_messages.thread_id
    and (thread.teacher_user_id = (select auth.uid()) or thread.parent_user_id = (select auth.uid()))
));
create policy "thread participants send messages" on public.communication_messages for insert to authenticated
with check (
  author_user_id = (select auth.uid()) and exists (
    select 1 from public.communication_threads thread
    where thread.id = communication_messages.thread_id
      and (thread.teacher_user_id = (select auth.uid()) or thread.parent_user_id = (select auth.uid()))
  )
);
create policy "thread participants mark messages read" on public.communication_messages for update to authenticated
using (exists (
  select 1 from public.communication_threads thread
  where thread.id = communication_messages.thread_id
    and (thread.teacher_user_id = (select auth.uid()) or thread.parent_user_id = (select auth.uid()))
))
with check (exists (
  select 1 from public.communication_threads thread
  where thread.id = communication_messages.thread_id
    and (thread.teacher_user_id = (select auth.uid()) or thread.parent_user_id = (select auth.uid()))
));

-- 출시 운영 도메인 기반. 기관 식별자는 실제 기관 동기화 테이블 연결 전까지 UUID만 보관하며 FK를 두지 않는다.
-- 증빙 원본과 민감한 후기·신고 원문은 이 스키마에 저장하지 않는다. 파일은 비공개 Storage의 객체 경로 메타데이터만 참조한다.
create type public.verification_request_status as enum ('PENDING', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'CANCELLED');
create type public.verification_request_kind as enum ('INSTITUTION_RELATION', 'TUTOR_IDENTITY', 'TUTOR_CREDENTIAL');
create type public.correction_request_status as enum ('PENDING', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'CANCELLED');
create type public.correction_issue_kind as enum ('BASIC_INFO', 'OPERATING_HOURS', 'PROGRAM', 'FEE', 'CLOSED_OR_PAUSED', 'OTHER');
create type public.content_report_status as enum ('RECEIVED', 'TRIAGED', 'TEMPORARILY_HIDDEN', 'REQUESTED_MORE_INFO', 'UPHELD', 'REJECTED', 'RESTORED', 'CLOSED');
create type public.content_report_issue_kind as enum ('PERSONAL_INFO', 'IDENTIFICATION_RISK', 'ABUSE', 'MISINFORMATION', 'COPYRIGHT', 'SPAM', 'OTHER');
create type public.entitlement_scope as enum ('PARENT_REVIEWS', 'STUDENT_REVIEWS', 'TEACHER_REVIEWS');
create type public.data_sync_status as enum ('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');
create type public.data_quality_issue_status as enum ('OPEN', 'RESOLVED', 'IGNORED');

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles(user_id) on delete cascade,
  institution_id uuid,
  kind public.verification_request_kind not null,
  requested_role public.edutalk_role,
  status public.verification_request_status not null default 'PENDING',
  relationship_period text,
  reviewer_note text,
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create policy "thread participants read message attachments" on public.communication_attachments for select to authenticated
using (exists (
  select 1 from public.communication_messages message
  join public.communication_threads thread on thread.id = message.thread_id
  where message.id = communication_attachments.message_id
    and (thread.teacher_user_id = (select auth.uid()) or thread.parent_user_id = (select auth.uid()))
));
create policy "message authors add attachments" on public.communication_attachments for insert to authenticated
with check (exists (
  select 1 from public.communication_messages message
  join public.communication_threads thread on thread.id = message.thread_id
  where message.id = communication_attachments.message_id
    and message.author_user_id = (select auth.uid())
    and (thread.teacher_user_id = (select auth.uid()) or thread.parent_user_id = (select auth.uid()))
));

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  verification_request_id uuid not null references public.verification_requests(id) on delete cascade,
  storage_bucket text not null,
  storage_object_path text not null,
  document_kind text not null,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0),
  uploaded_at timestamptz not null default now(),
  retention_until timestamptz,
  deleted_at timestamptz,
  unique (storage_bucket, storage_object_path)
);

create table public.verification_events (
  id uuid primary key default gen_random_uuid(),
  verification_request_id uuid not null references public.verification_requests(id) on delete cascade,
  status public.verification_request_status not null,
  actor_user_id uuid references public.profiles(user_id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table public.institution_corrections (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles(user_id) on delete cascade,
  institution_id uuid not null,
  issue public.correction_issue_kind not null,
  current_summary text not null check (char_length(current_summary) between 1 and 500),
  requested_summary text not null check (char_length(requested_summary) between 1 and 500),
  status public.correction_request_status not null default 'PENDING',
  reviewer_note text,
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.institution_replies (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  review_id uuid references public.institution_reviews(id) on delete set null,
  author_user_id uuid references public.profiles(user_id) on delete set null,
  body text not null check (char_length(body) between 1 and 3000),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.profiles(user_id) on delete cascade,
  institution_id uuid,
  target_type text not null,
  target_id uuid,
  issue public.content_report_issue_kind not null,
  location_summary text not null check (char_length(location_summary) between 1 and 200),
  reason text not null check (char_length(reason) between 1 and 1000),
  status public.content_report_status not null default 'RECEIVED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.content_reports(id) on delete set null,
  target_type text not null,
  target_id uuid,
  action public.content_report_status not null,
  actor_user_id uuid references public.profiles(user_id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.access_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  scope public.entitlement_scope not null,
  source_verification_request_id uuid references public.verification_requests(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(user_id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.data_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  status public.data_sync_status not null default 'RUNNING',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_seen integer not null default 0 check (records_seen >= 0),
  records_created integer not null default 0 check (records_created >= 0),
  records_updated integer not null default 0 check (records_updated >= 0),
  error_summary text
);

create table public.data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid references public.data_sync_runs(id) on delete set null,
  institution_id uuid,
  issue_type text not null,
  status public.data_quality_issue_status not null default 'OPEN',
  summary text not null check (char_length(summary) between 1 and 1000),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index verification_requests_requester_status_idx on public.verification_requests (requester_user_id, status, created_at desc);
create index verification_requests_institution_status_idx on public.verification_requests (institution_id, status, created_at desc);
create index verification_documents_request_idx on public.verification_documents (verification_request_id);
create index verification_events_request_idx on public.verification_events (verification_request_id, created_at desc);
create index institution_corrections_requester_status_idx on public.institution_corrections (requester_user_id, status, created_at desc);
create index institution_corrections_institution_status_idx on public.institution_corrections (institution_id, status, created_at desc);
create index institution_replies_institution_published_idx on public.institution_replies (institution_id, is_published, published_at desc);
create index content_reports_reporter_status_idx on public.content_reports (reporter_user_id, status, created_at desc);
create index content_reports_target_idx on public.content_reports (target_type, target_id, status);
create index moderation_actions_report_idx on public.moderation_actions (report_id, created_at desc);
create index access_entitlements_user_scope_idx on public.access_entitlements (user_id, scope, ends_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id, created_at desc);
create index data_sync_runs_source_status_idx on public.data_sync_runs (source_system, status, started_at desc);
create index data_quality_issues_status_idx on public.data_quality_issues (status, created_at desc);

alter table public.verification_requests enable row level security;
alter table public.verification_documents enable row level security;
alter table public.verification_events enable row level security;
alter table public.institution_corrections enable row level security;
alter table public.institution_replies enable row level security;
alter table public.content_reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.access_entitlements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.data_sync_runs enable row level security;
alter table public.data_quality_issues enable row level security;

-- 사용자 소유 요청만 읽고 접수한다. 운영자·기관 관계자 권한 모델은 실제 역할 테이블이 연결된 뒤 별도 정책으로 추가한다.
create policy "users read own verification requests" on public.verification_requests for select to authenticated
using (requester_user_id = (select auth.uid()));
create policy "users create own verification requests" on public.verification_requests for insert to authenticated
with check (requester_user_id = (select auth.uid()) and status = 'PENDING');
create policy "users read own verification document metadata" on public.verification_documents for select to authenticated
using (exists (select 1 from public.verification_requests request where request.id = verification_documents.verification_request_id and request.requester_user_id = (select auth.uid())));
create policy "users read own verification events" on public.verification_events for select to authenticated
using (exists (select 1 from public.verification_requests request where request.id = verification_events.verification_request_id and request.requester_user_id = (select auth.uid())));
create policy "users read own corrections" on public.institution_corrections for select to authenticated
using (requester_user_id = (select auth.uid()));
create policy "users create own corrections" on public.institution_corrections for insert to authenticated
with check (requester_user_id = (select auth.uid()) and status = 'PENDING');
create policy "users read published institution replies" on public.institution_replies for select to authenticated
using (is_published);
create policy "users read own content reports" on public.content_reports for select to authenticated
using (reporter_user_id = (select auth.uid()));
create policy "users create own content reports" on public.content_reports for insert to authenticated
with check (reporter_user_id = (select auth.uid()) and status = 'RECEIVED');
create policy "users read own entitlements" on public.access_entitlements for select to authenticated
using (user_id = (select auth.uid()));

-- 공공기관 ETL canonical 저장 기반. 이 마이그레이션은 아직 어떤 프로젝트에도 적용되지 않았다.
-- 운영자·ETL 쓰기 권한은 아직 연결하지 않는다. 실제 동기화 작업은 서버 전용 권한 모델 확정 뒤 별도 정책으로 추가한다.
create type public.institution_zone as enum ('DONGTAN_1', 'DONGTAN_2', 'OTHER');
create type public.canonical_institution_type as enum ('CHILDCARE', 'KINDERGARTEN', 'ACADEMY', 'TUTORING');
create type public.institution_recruiting_status as enum ('OPEN', 'WAITLIST', 'CLOSED', 'CHECK_NEEDED');
create type public.institution_operating_status as enum ('ACTIVE', 'SUSPENDED', 'CLOSED', 'UNKNOWN');

create table public.raw_source_records (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  source_record_id text not null,
  fetched_at timestamptz not null,
  payload jsonb not null,
  checksum text,
  created_at timestamptz not null default now(),
  unique (provider, source_record_id, fetched_at)
);

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  institution_type public.canonical_institution_type not null,
  name text not null,
  address text not null,
  zone public.institution_zone not null default 'OTHER',
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  operating_status public.institution_operating_status not null default 'UNKNOWN',
  is_public boolean not null default false,
  is_synthetic boolean not null default false,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.institution_source_links (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  raw_source_record_id uuid not null references public.raw_source_records(id) on delete cascade,
  provider text not null,
  source_record_id text not null,
  linked_at timestamptz not null default now(),
  unique (provider, source_record_id),
  unique (institution_id, raw_source_record_id)
);

create table public.institution_status_history (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  recruiting_status public.institution_recruiting_status not null default 'CHECK_NEEDED',
  change_note text not null check (char_length(change_note) between 1 and 1000),
  source text not null,
  checked_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.institution_operation_status_history (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  operating_status public.institution_operating_status not null,
  source_status text not null check (char_length(source_status) between 1 and 160),
  source text not null,
  checked_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (institution_id, source, checked_at)
);

create index raw_source_records_provider_record_idx on public.raw_source_records (provider, source_record_id, fetched_at desc);
create index institutions_public_zone_type_idx on public.institutions (zone, institution_type, checked_at desc) where is_public and not is_synthetic;
create index institution_source_links_institution_idx on public.institution_source_links (institution_id);
create index institution_status_history_institution_checked_idx on public.institution_status_history (institution_id, checked_at desc);
create index institution_operation_history_checked_idx on public.institution_operation_status_history (institution_id, checked_at desc);

alter table public.raw_source_records enable row level security;
alter table public.institutions enable row level security;
alter table public.institution_source_links enable row level security;
alter table public.institution_status_history enable row level security;
alter table public.institution_operation_status_history enable row level security;

create policy "public reads published canonical institutions" on public.institutions for select to anon, authenticated
using (is_public and not is_synthetic);
create policy "public reads published institution source links" on public.institution_source_links for select to anon, authenticated
using (exists (select 1 from public.institutions institution where institution.id = institution_source_links.institution_id and institution.is_public and not institution.is_synthetic));
create policy "public reads published institution status history" on public.institution_status_history for select to anon, authenticated
using (exists (select 1 from public.institutions institution where institution.id = institution_status_history.institution_id and institution.is_public and not institution.is_synthetic));
create policy "public reads published institution operation history" on public.institution_operation_status_history for select to anon, authenticated
using (exists (select 1 from public.institutions institution where institution.id = institution_operation_status_history.institution_id and institution.is_public and not institution.is_synthetic));

-- 상세 URL은 public_slug로 canonical UUID를 찾는다. 실제 slug 발급과 운영자 삭제 처리 권한은 아직 연결하지 않는다.
alter table public.institutions
  add column public_slug text unique,
  add constraint institutions_public_slug_format check (public_slug is null or public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

create type public.account_deletion_request_status as enum ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED');

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(user_id) on delete set null,
  status public.account_deletion_request_status not null default 'PENDING',
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  note text,
  check (processed_at is null or processed_at >= requested_at)
);

create unique index account_deletion_requests_one_active_per_user_idx
  on public.account_deletion_requests (user_id)
  where status in ('PENDING', 'PROCESSING');
create index account_deletion_requests_user_status_idx
  on public.account_deletion_requests (user_id, status, requested_at desc);

alter table public.account_deletion_requests enable row level security;

create policy "users read own account deletion requests" on public.account_deletion_requests for select to authenticated
using (user_id = (select auth.uid()));
create policy "users create own account deletion requests" on public.account_deletion_requests for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'PENDING' and processed_at is null);

create table public.institution_favorites (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  target_key text not null check (target_key ~ '^[a-z0-9-]+$' and char_length(target_key) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (user_id, target_key)
);

alter table public.institution_favorites enable row level security;
create policy "users read own institution favorites" on public.institution_favorites for select to authenticated
using (user_id = (select auth.uid()));
create policy "users create own institution favorites" on public.institution_favorites for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.institutions institution
    where institution.public_slug = institution_favorites.target_key
      and institution.is_public
      and not institution.is_synthetic
  )
);
create policy "users delete own institution favorites" on public.institution_favorites for delete to authenticated
using (user_id = (select auth.uid()));
grant select, insert, delete on public.institution_favorites to authenticated;

create type public.notification_kind as enum ('VERIFICATION', 'REVIEW', 'SUPPORT', 'TUTOR', 'INSTITUTION', 'ACCOUNT');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  kind public.notification_kind not null,
  link_path text check (link_path is null or (link_path like '/%' and link_path not like '//%' and char_length(link_path) <= 240)),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
alter table public.notifications enable row level security;
create policy "users read own notifications" on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
create policy "users mark own notifications read" on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and read_at is not null);

-- 온보딩 최소 프로필: 민감정보 없이 역할별 선택값과 serviceZone만 fields에 보관한다.
-- 운영자 처리 권한은 아직 연결하지 않는다.
create table public.user_role_profiles (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role public.edutalk_role not null,
  fields jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.user_role_profiles enable row level security;

create policy "users read own role profiles" on public.user_role_profiles for select to authenticated
using (user_id = (select auth.uid()));
create policy "users upsert own role profiles" on public.user_role_profiles for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "users update own role profiles" on public.user_role_profiles for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "users add own roles" on public.user_roles for insert to authenticated
with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.verification_requests, public.verification_documents,
  public.verification_events, public.institution_corrections, public.institution_replies,
  public.content_reports, public.moderation_actions, public.access_entitlements, public.audit_logs,
  public.data_sync_runs, public.data_quality_issues to authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- 계정 모드 학생 등록: 담당 선생님이 본인이 만든 학생만 생성·연결할 수 있도록 최소 정책을 추가한다.
alter table public.students add column if not exists institution_name text;

create policy "teachers create own students" on public.students for insert to authenticated
with check (created_by = (select auth.uid()) and exists (
  select 1 from public.user_roles role
  where role.user_id = (select auth.uid()) and role.role = 'TEACHER'
));

create policy "teachers create own student links" on public.student_user_links for insert to authenticated
with check (
  user_id = (select auth.uid()) and relationship = 'TEACHER' and exists (
    select 1 from public.students student
    where student.id = student_user_links.student_id and student.created_by = (select auth.uid())
  )
);
grant select on public.institutions, public.institution_source_links, public.institution_status_history, public.institution_operation_status_history to anon;
grant select on public.tutor_profiles, public.tutor_credentials, public.tutor_jobs, public.tutor_reviews to anon;
revoke all on public.raw_source_records from anon, authenticated;

-- 튜터 계정 영속화: 본인 프로필의 심사 대기 자격 항목만 접수할 수 있다.
-- 실제 문서 Storage 업로드와 운영자 심사·승인 권한은 아직 연결하지 않는다.
create policy "tutors add own pending credentials" on public.tutor_credentials for insert to authenticated
with check (
  verified = false
  and exists (
    select 1 from public.tutor_profiles profile
    where profile.id = tutor_credentials.tutor_id and profile.user_id = (select auth.uid())
  )
);
create policy "tutors update own pending credentials" on public.tutor_credentials for update to authenticated
using (exists (
  select 1 from public.tutor_profiles profile
  where profile.id = tutor_credentials.tutor_id and profile.user_id = (select auth.uid())
))
with check (
  verified = false
  and exists (
    select 1 from public.tutor_profiles profile
    where profile.id = tutor_credentials.tutor_id and profile.user_id = (select auth.uid())
  )
);

-- 기관 상세 URL의 demo 문자열 ID와 canonical UUID를 혼용하지 않는다.
-- canonical 연결 전 후기 대상은 institution_target_key에 저장하며, 운영자 승인 권한은 아직 연결하지 않는다.
alter table public.institution_reviews
  alter column institution_id drop not null,
  add column institution_target_key text;
create index institution_reviews_target_approved_idx
  on public.institution_reviews (institution_target_key, relation, created_at desc)
  where status = 'APPROVED';
create policy "authenticated users read approved target reviews" on public.institution_reviews for select to authenticated
using (status = 'APPROVED' and institution_target_key is not null);

-- 아래 열람 정책이 인증 요청의 대상 키를 참조하므로 정책 생성 전에 열을 준비한다.
alter table public.verification_requests add column if not exists target_key text;

drop policy "authenticated users read approved institution reviews" on public.institution_reviews;
drop policy "authenticated users read approved target reviews" on public.institution_reviews;
create policy "authors read own institution reviews" on public.institution_reviews for select to authenticated
using (author_user_id = (select auth.uid()));
create policy "entitled users read approved institution reviews" on public.institution_reviews for select to authenticated
using (
  status = 'APPROVED'
  and institution_target_key is not null
  and exists (
    select 1
    from public.access_entitlements entitlement
    join public.verification_requests request on request.id = entitlement.source_verification_request_id
    where entitlement.user_id = (select auth.uid())
      and entitlement.revoked_at is null
      and entitlement.ends_at > now()
      and request.status = 'APPROVED'
      and request.target_key = institution_reviews.institution_target_key
      and request.requested_role = institution_reviews.relation
      and entitlement.scope = case institution_reviews.relation
        when 'PARENT' then 'PARENT_REVIEWS'::public.entitlement_scope
        when 'STUDENT' then 'STUDENT_REVIEWS'::public.entitlement_scope
        when 'TEACHER' then 'TEACHER_REVIEWS'::public.entitlement_scope
      end
  )
);

-- 최초 역할·약관·추천 프로필은 한 트랜잭션으로 저장한다. 실패하면 어느 단계도 남지 않는다.
create or replace function public.complete_edutalk_onboarding(
  selected_age_band public.edutalk_age_band,
  selected_role public.edutalk_role,
  terms_version text,
  privacy_version text,
  community_version text,
  consented_at timestamptz,
  profile_fields jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if selected_age_band = 'UNDER_14' and selected_role <> 'PARENT' then
    raise exception 'under 14 users must start with a guardian profile';
  end if;
  if char_length(terms_version) < 1 or char_length(terms_version) > 80
    or char_length(privacy_version) < 1 or char_length(privacy_version) > 80
    or char_length(community_version) < 1 or char_length(community_version) > 80 then
    raise exception 'invalid consent version';
  end if;
  if jsonb_typeof(profile_fields) <> 'object' then
    raise exception 'invalid profile fields';
  end if;

  insert into public.user_consents (
    user_id, age_band, terms_version, privacy_version, community_version, consented_at, updated_at
  ) values (
    auth.uid(), selected_age_band, terms_version, privacy_version, community_version, consented_at, now()
  )
  on conflict (user_id) do update set
    age_band = excluded.age_band,
    terms_version = excluded.terms_version,
    privacy_version = excluded.privacy_version,
    community_version = excluded.community_version,
    consented_at = excluded.consented_at,
    updated_at = now();

  insert into public.user_roles (user_id, role)
  values (auth.uid(), selected_role)
  on conflict (user_id, role) do nothing;

  insert into public.user_role_profiles (user_id, role, fields, updated_at)
  values (auth.uid(), selected_role, profile_fields, now())
  on conflict (user_id, role) do update set
    fields = excluded.fields,
    updated_at = now();

  update public.profiles set active_role = selected_role where user_id = auth.uid();
end;
$$;

revoke all on function public.complete_edutalk_onboarding(public.edutalk_age_band, public.edutalk_role, text, text, text, timestamptz, jsonb) from public, anon;
grant execute on function public.complete_edutalk_onboarding(public.edutalk_age_band, public.edutalk_role, text, text, text, timestamptz, jsonb) to authenticated;

-- 교사의 학생 생성과 담당 연결은 하나의 트랜잭션으로 처리한다.
create or replace function public.create_teacher_student(
  student_alias text,
  student_grade_level text,
  student_class_name text,
  student_institution_id uuid,
  student_institution_name text
)
returns public.students
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_student public.students%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles role
    where role.user_id = auth.uid() and role.role = 'TEACHER'
  ) then raise exception 'teacher role required'; end if;
  if char_length(student_alias) not between 1 and 24
    or char_length(student_grade_level) not between 1 and 40
    or char_length(student_class_name) not between 1 and 60
    or char_length(student_institution_name) not between 1 and 120
  then raise exception 'invalid student input'; end if;

  insert into public.students (alias, grade_level, class_name, institution_id, institution_name, created_by)
  values (student_alias, student_grade_level, student_class_name, student_institution_id, student_institution_name, auth.uid())
  returning * into created_student;
  insert into public.student_user_links (student_id, user_id, relationship)
  values (created_student.id, auth.uid(), 'TEACHER');
  return created_student;
end;
$$;

revoke all on function public.create_teacher_student(text, text, text, uuid, text) from public, anon;
grant execute on function public.create_teacher_student(text, text, text, uuid, text) to authenticated;

-- 담당 교사가 보호자를 학생에 연결하는 30분·1회용 초대. 원문 코드는 저장하지 않는다.
create table public.student_parent_invites (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  code_digest text not null unique check (code_digest ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((used_at is null and used_by is null) or (used_at is not null and used_by is not null))
);

create index student_parent_invites_student_active_idx
  on public.student_parent_invites (student_id, expires_at desc)
  where used_at is null;
alter table public.student_parent_invites enable row level security;

create or replace function public.create_parent_link_invite(
  target_student_id uuid,
  invitation_digest text,
  invitation_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or invitation_digest !~ '^[a-f0-9]{64}$'
    or invitation_expires_at <= now()
    or invitation_expires_at > now() + interval '31 minutes'
    or not exists (
      select 1 from public.student_user_links link
      where link.student_id = target_student_id
        and link.user_id = auth.uid()
        and link.relationship = 'TEACHER'
        and link.is_active
    ) then
    raise exception 'not allowed';
  end if;

  delete from public.student_parent_invites
  where student_id = target_student_id and used_at is null;
  insert into public.student_parent_invites (student_id, created_by, code_digest, expires_at)
  values (target_student_id, auth.uid(), invitation_digest, invitation_expires_at);
end;
$$;

create or replace function public.redeem_parent_link_invite(invitation_digest text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.student_parent_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.user_roles role
    where role.user_id = auth.uid() and role.role = 'PARENT'
  ) then raise exception 'parent role required'; end if;

  select * into invite from public.student_parent_invites
  where code_digest = invitation_digest and used_at is null and expires_at > now()
  for update;
  if not found then raise exception 'invalid invitation'; end if;

  insert into public.student_user_links (student_id, user_id, relationship)
  values (invite.student_id, auth.uid(), 'PARENT')
  on conflict (student_id, user_id, relationship) do update set is_active = true;
  insert into public.communication_threads (student_id, teacher_user_id, parent_user_id)
  select invite.student_id, link.user_id, auth.uid()
  from public.student_user_links link
  where link.student_id = invite.student_id
    and link.relationship = 'TEACHER'
    and link.is_active
  on conflict on constraint communication_threads_participants_key do nothing;
  update public.student_parent_invites
  set used_at = now(), used_by = auth.uid()
  where id = invite.id;
  return invite.student_id;
end;
$$;

revoke all on public.student_parent_invites from anon, authenticated;
revoke all on function public.create_parent_link_invite(uuid, text, timestamptz) from public, anon;
revoke all on function public.redeem_parent_link_invite(text) from public, anon;
grant execute on function public.create_parent_link_invite(uuid, text, timestamptz) to authenticated;
grant execute on function public.redeem_parent_link_invite(text) to authenticated;

-- 상용 계정 메시지: 동일 학생에 활성 보호자·교사 연결이 있는 참여자만 대화방을 만들 수 있다.
-- 이미지 원본은 Storage 연결 전까지 이 테이블에 올리지 않는다.
create policy "linked participants create communication threads" on public.communication_threads for insert to authenticated
with check (
  (teacher_user_id = (select auth.uid()) or parent_user_id = (select auth.uid()))
  and exists (
    select 1 from public.student_user_links teacher_link
    where teacher_link.student_id = communication_threads.student_id
      and teacher_link.user_id = communication_threads.teacher_user_id
      and teacher_link.relationship = 'TEACHER'
      and teacher_link.is_active
  )
  and exists (
    select 1 from public.student_user_links parent_link
    where parent_link.student_id = communication_threads.student_id
      and parent_link.user_id = communication_threads.parent_user_id
      and parent_link.relationship = 'PARENT'
      and parent_link.is_active
  )
);

-- 체험 fixture의 문자열 식별자와 canonical UUID를 혼동하지 않기 위한 요청 대상 키.
-- canonical 기관 연결 전에는 target_key만 보관하며, 운영자 실제 처리 연결은 아직 하지 않는다.
alter table public.verification_requests add column if not exists target_key text;
alter table public.institution_corrections add column if not exists target_key text;
alter table public.content_reports add column if not exists target_key text;
alter table public.institution_corrections alter column institution_id drop not null;
alter table public.verification_requests
  add column if not exists evidence_type text,
  add constraint verification_requests_evidence_type_check check (
    evidence_type is null or evidence_type in ('ENROLLMENT', 'EMPLOYMENT', 'IDENTITY', 'TEACHING_CERT', 'LANGUAGE_SCORE', 'DEGREE')
  );

-- 고객 문의와 튜터 연결 요청은 계정 소유 데이터로 보관한다.
create type public.service_request_status as enum ('RECEIVED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED');
create type public.support_request_category as enum ('ACCOUNT', 'VERIFICATION', 'REVIEW_REPORT', 'INSTITUTION_DATA', 'BILLING', 'OTHER');

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  category public.support_request_category not null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 10 and 3000),
  reply_email text check (reply_email is null or char_length(reply_email) <= 254),
  response_body text check (response_body is null or char_length(response_body) between 1 and 3000),
  responded_by uuid references public.profiles(user_id) on delete set null,
  responded_at timestamptz,
  status public.service_request_status not null default 'RECEIVED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tutor_contact_requests (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles(id) on delete cascade,
  requester_user_id uuid not null references public.profiles(user_id) on delete cascade,
  message text not null check (char_length(message) between 10 and 1000),
  response_message text check (response_message is null or char_length(response_message) between 1 and 1000),
  responded_by uuid references public.profiles(user_id) on delete set null,
  responded_at timestamptz,
  status public.service_request_status not null default 'RECEIVED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tutor_id, requester_user_id)
);

create table public.tutor_job_applications (
  id uuid primary key default gen_random_uuid(),
  tutor_job_id uuid not null references public.tutor_jobs(id) on delete cascade,
  applicant_user_id uuid not null references public.profiles(user_id) on delete cascade,
  message text not null check (char_length(message) between 10 and 1000),
  response_message text check (response_message is null or char_length(response_message) between 1 and 1000),
  responded_by uuid references public.profiles(user_id) on delete set null,
  responded_at timestamptz,
  status public.service_request_status not null default 'RECEIVED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tutor_job_id, applicant_user_id)
);

create index support_requests_user_status_idx on public.support_requests (user_id, status, created_at desc);
create index tutor_contact_requests_tutor_status_idx on public.tutor_contact_requests (tutor_id, status, created_at desc);
create index tutor_job_applications_job_status_idx on public.tutor_job_applications (tutor_job_id, status, created_at desc);

alter table public.support_requests enable row level security;
alter table public.tutor_contact_requests enable row level security;
alter table public.tutor_job_applications enable row level security;

create policy "users read own support requests" on public.support_requests for select to authenticated
using (user_id = (select auth.uid()));
create policy "users create own support requests" on public.support_requests for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'RECEIVED');

create policy "participants read tutor contact requests" on public.tutor_contact_requests for select to authenticated
using (
  requester_user_id = (select auth.uid())
  or exists (
    select 1 from public.tutor_profiles profile
    where profile.id = tutor_contact_requests.tutor_id and profile.user_id = (select auth.uid())
  )
);
create policy "users create tutor contact requests" on public.tutor_contact_requests for insert to authenticated
with check (
  requester_user_id = (select auth.uid())
  and status = 'RECEIVED'
  and exists (
    select 1 from public.tutor_profiles profile
    where profile.id = tutor_contact_requests.tutor_id
      and profile.verified
      and profile.user_id <> (select auth.uid())
  )
);
create policy "tutors respond to contact requests" on public.tutor_contact_requests for update to authenticated
using (exists (
  select 1 from public.tutor_profiles profile
  where profile.id = tutor_contact_requests.tutor_id and profile.user_id = (select auth.uid())
))
with check (
  responded_by = (select auth.uid())
  and status in ('IN_PROGRESS', 'ANSWERED', 'CLOSED')
  and exists (
    select 1 from public.tutor_profiles profile
    where profile.id = tutor_contact_requests.tutor_id and profile.user_id = (select auth.uid())
  )
);

create policy "participants read tutor job applications" on public.tutor_job_applications for select to authenticated
using (
  applicant_user_id = (select auth.uid())
  or exists (
    select 1 from public.tutor_jobs job
    where job.id = tutor_job_applications.tutor_job_id and job.author_user_id = (select auth.uid())
  )
);
create policy "tutors create own job applications" on public.tutor_job_applications for insert to authenticated
with check (
  applicant_user_id = (select auth.uid())
  and status = 'RECEIVED'
  and exists (
    select 1 from public.tutor_profiles profile
    where profile.user_id = (select auth.uid())
  )
  and exists (
    select 1 from public.tutor_jobs job
    where job.id = tutor_job_applications.tutor_job_id
      and job.status = 'OPEN'
      and job.author_user_id <> (select auth.uid())
  )
);
create policy "job authors respond to applications" on public.tutor_job_applications for update to authenticated
using (exists (
  select 1 from public.tutor_jobs job
  where job.id = tutor_job_applications.tutor_job_id and job.author_user_id = (select auth.uid())
))
with check (
  responded_by = (select auth.uid())
  and status in ('IN_PROGRESS', 'ANSWERED', 'CLOSED')
  and exists (
    select 1 from public.tutor_jobs job
    where job.id = tutor_job_applications.tutor_job_id and job.author_user_id = (select auth.uid())
  )
);

grant select, insert on public.support_requests, public.tutor_contact_requests, public.tutor_job_applications to authenticated;
grant update (status, response_message, responded_by, responded_at, updated_at) on public.tutor_contact_requests to authenticated;
grant update (status, response_message, responded_by, responded_at, updated_at) on public.tutor_job_applications to authenticated;

-- 선생님이 보호자 또는 만 14세 이상 학생 본인에게 발급하는 30분·1회용 연결 코드.
alter table public.student_parent_invites
  add column link_role public.edutalk_role not null default 'PARENT',
  add constraint student_invite_link_role check (link_role in ('PARENT', 'STUDENT'));

create unique index student_user_links_one_student_account_idx
  on public.student_user_links (student_id)
  where relationship = 'STUDENT' and is_active;
create unique index student_user_links_one_record_per_student_account_idx
  on public.student_user_links (user_id)
  where relationship = 'STUDENT' and is_active;

create or replace function public.create_student_user_link_invite(
  target_student_id uuid,
  invitation_digest text,
  invitation_expires_at timestamptz,
  link_relationship public.edutalk_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or link_relationship not in ('PARENT', 'STUDENT')
    or invitation_digest !~ '^[a-f0-9]{64}$'
    or invitation_expires_at <= now()
    or invitation_expires_at > now() + interval '31 minutes'
    or not exists (
      select 1 from public.student_user_links link
      where link.student_id = target_student_id
        and link.user_id = auth.uid()
        and link.relationship = 'TEACHER'
        and link.is_active
    ) then
    raise exception 'not allowed';
  end if;

  delete from public.student_parent_invites
  where student_id = target_student_id and link_role = link_relationship and used_at is null;
  insert into public.student_parent_invites (student_id, created_by, code_digest, expires_at, link_role)
  values (target_student_id, auth.uid(), invitation_digest, invitation_expires_at, link_relationship);
end;
$$;

create or replace function public.redeem_student_user_link_invite(invitation_digest text)
returns table (student_id uuid, linked_role public.edutalk_role)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.student_parent_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into invite from public.student_parent_invites
  where code_digest = invitation_digest and used_at is null and expires_at > now()
  for update;
  if not found then raise exception 'invalid invitation'; end if;

  if invite.link_role = 'PARENT' then
    if not exists (
      select 1 from public.user_roles role
      where role.user_id = auth.uid() and role.role = 'PARENT'
    ) then raise exception 'parent role required'; end if;
  elsif invite.link_role = 'STUDENT' then
    if not exists (
      select 1
      from public.user_roles role
      join public.user_consents consent on consent.user_id = role.user_id
      where role.user_id = auth.uid()
        and role.role = 'STUDENT'
        and consent.age_band in ('FOURTEEN_PLUS', 'ADULT')
    ) then raise exception 'eligible student role required'; end if;
  else
    raise exception 'invalid invitation role';
  end if;

  insert into public.student_user_links (student_id, user_id, relationship)
  values (invite.student_id, auth.uid(), invite.link_role)
  on conflict on constraint student_user_links_pkey do update set is_active = true;

  if invite.link_role = 'PARENT' then
    insert into public.communication_threads (student_id, teacher_user_id, parent_user_id)
    select invite.student_id, link.user_id, auth.uid()
    from public.student_user_links link
    where link.student_id = invite.student_id
      and link.relationship = 'TEACHER'
      and link.is_active
    on conflict on constraint communication_threads_participants_key do nothing;
  end if;

  update public.student_parent_invites
  set used_at = now(), used_by = auth.uid()
  where id = invite.id;

  return query select invite.student_id, invite.link_role;
end;
$$;

revoke all on function public.create_student_user_link_invite(uuid, text, timestamptz, public.edutalk_role) from public, anon;
revoke all on function public.redeem_student_user_link_invite(text) from public, anon;
grant execute on function public.create_student_user_link_invite(uuid, text, timestamptz, public.edutalk_role) to authenticated;
grant execute on function public.redeem_student_user_link_invite(text) to authenticated;

-- 운영자 역할은 DB에서 명시적으로 부여하며, 일반 사용자는 자기 역할 존재 여부만 조회할 수 있다.
create type public.operator_role as enum ('VERIFICATION_REVIEWER', 'CONTENT_MODERATOR', 'SUPPORT_AGENT', 'DATA_OPERATOR', 'ADMIN');

create table public.operator_roles (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role public.operator_role not null,
  assigned_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.operator_roles enable row level security;
create policy "operators read own roles" on public.operator_roles for select to authenticated
using (user_id = (select auth.uid()));
grant select on public.operator_roles to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_edutalk_operator(allowed_roles public.operator_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.operator_roles operator
    where operator.user_id = auth.uid()
      and operator.role = any(allowed_roles)
  );
$$;

revoke all on function private.is_edutalk_operator(public.operator_role[]) from public, anon;
grant execute on function private.is_edutalk_operator(public.operator_role[]) to authenticated;

create policy "verification operators read requests" on public.verification_requests for select to authenticated
using (private.is_edutalk_operator(array['VERIFICATION_REVIEWER', 'ADMIN']::public.operator_role[]));
create policy "verification operators read events" on public.verification_events for select to authenticated
using (private.is_edutalk_operator(array['VERIFICATION_REVIEWER', 'ADMIN']::public.operator_role[]));
create policy "verification operators read document metadata" on public.verification_documents for select to authenticated
using (private.is_edutalk_operator(array['VERIFICATION_REVIEWER', 'ADMIN']::public.operator_role[]));
create policy "content operators read reviews" on public.institution_reviews for select to authenticated
using (private.is_edutalk_operator(array['CONTENT_MODERATOR', 'ADMIN']::public.operator_role[]));
create policy "support operators read requests" on public.support_requests for select to authenticated
using (private.is_edutalk_operator(array['SUPPORT_AGENT', 'ADMIN']::public.operator_role[]));
create policy "support operators update requests" on public.support_requests for update to authenticated
using (private.is_edutalk_operator(array['SUPPORT_AGENT', 'ADMIN']::public.operator_role[]))
with check (
  private.is_edutalk_operator(array['SUPPORT_AGENT', 'ADMIN']::public.operator_role[])
  and responded_by = (select auth.uid())
  and status in ('IN_PROGRESS', 'ANSWERED', 'CLOSED')
);
create policy "admins read account deletion requests" on public.account_deletion_requests for select to authenticated
using (private.is_edutalk_operator(array['ADMIN']::public.operator_role[]));

create unique index access_entitlements_one_active_source_scope_idx
  on public.access_entitlements (source_verification_request_id, scope)
  where source_verification_request_id is not null and revoked_at is null;
create unique index verification_requests_one_active_relation_idx
  on public.verification_requests (requester_user_id, target_key, requested_role, kind)
  where target_key is not null and status in ('PENDING', 'NEEDS_INFO');
create unique index verification_requests_one_active_tutor_kind_idx
  on public.verification_requests (requester_user_id, kind)
  where kind in ('TUTOR_IDENTITY', 'TUTOR_CREDENTIAL') and status in ('PENDING', 'NEEDS_INFO');

alter table public.institution_reviews
  add constraint institution_reviews_verification_request_fk
  foreign key (verification_request_id) references public.verification_requests(id) on delete restrict;
alter table public.institution_reviews alter column verification_request_id set not null;
create unique index institution_reviews_one_active_author_target_role_idx
  on public.institution_reviews (author_user_id, institution_target_key, relation)
  where institution_target_key is not null and status in ('PENDING', 'APPROVED', 'TEMPORARILY_HIDDEN');

create or replace function private.enforce_institution_review_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.verification_request_id is null or not exists (
    select 1 from public.verification_requests request
    where request.id = new.verification_request_id
      and request.requester_user_id = new.author_user_id
      and request.kind = 'INSTITUTION_RELATION'
      and request.status = 'APPROVED'
      and request.target_key = new.institution_target_key
      and request.requested_role = new.relation
      and exists (
        select 1 from public.access_entitlements entitlement
        where entitlement.source_verification_request_id = request.id
          and entitlement.user_id = new.author_user_id
          and entitlement.revoked_at is null
          and entitlement.ends_at > now()
      )
  ) then
    raise exception 'approved matching verification required';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_institution_review_verification() from public, anon, authenticated;
create trigger enforce_institution_review_verification
  before insert or update of verification_request_id, institution_target_key, author_user_id, relation
  on public.institution_reviews
  for each row execute function private.enforce_institution_review_verification();

create or replace function private.record_verification_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.verification_events (verification_request_id, status, actor_user_id, note)
  values (new.id, 'PENDING', new.requester_user_id, '인증 요청이 접수되었습니다.');
  return new;
end;
$$;

revoke all on function private.record_verification_submission() from public, anon, authenticated;
create trigger record_verification_submission
  after insert on public.verification_requests
  for each row execute function private.record_verification_submission();

create or replace function public.review_verification_request(
  target_request_id uuid,
  target_status public.verification_request_status,
  review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.verification_requests%rowtype;
  entitlement_kind public.entitlement_scope;
  access_end timestamptz;
begin
  if not private.is_edutalk_operator(array['VERIFICATION_REVIEWER', 'ADMIN']::public.operator_role[]) then
    raise exception 'operator role required';
  end if;
  if target_status not in ('PENDING', 'NEEDS_INFO', 'APPROVED', 'REJECTED')
    or char_length(coalesce(review_note, '')) > 1000 then
    raise exception 'invalid review input';
  end if;

  select * into request_row from public.verification_requests
  where id = target_request_id for update;
  if not found then raise exception 'request not found'; end if;

  if target_status = 'APPROVED' and not exists (
    select 1
    from public.verification_documents document
    join storage.objects object
      on object.bucket_id = document.storage_bucket
      and object.name = document.storage_object_path
    where document.verification_request_id = request_row.id
      and document.deleted_at is null
  ) then
    raise exception 'verification evidence required';
  end if;

  update public.verification_requests
  set status = target_status,
      reviewer_note = nullif(trim(review_note), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = request_row.id
  returning * into request_row;

  insert into public.verification_events (verification_request_id, status, actor_user_id, note)
  values (request_row.id, target_status, auth.uid(), nullif(trim(review_note), ''));

  if request_row.kind = 'INSTITUTION_RELATION' then
    entitlement_kind := case request_row.requested_role
      when 'PARENT' then 'PARENT_REVIEWS'::public.entitlement_scope
      when 'STUDENT' then 'STUDENT_REVIEWS'::public.entitlement_scope
      when 'TEACHER' then 'TEACHER_REVIEWS'::public.entitlement_scope
      else null
    end;
    if entitlement_kind is null or request_row.target_key is null then
      raise exception 'invalid relation verification';
    end if;

    if target_status = 'APPROVED' then
      access_end := now() + interval '6 months';
      insert into public.access_entitlements (
        user_id, scope, source_verification_request_id, starts_at, ends_at, revoked_at
      ) values (
        request_row.requester_user_id, entitlement_kind, request_row.id, now(), access_end, null
      )
      on conflict (source_verification_request_id, scope)
        where source_verification_request_id is not null and revoked_at is null
      do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at, revoked_at = null;
    else
      update public.access_entitlements
      set revoked_at = now()
      where source_verification_request_id = request_row.id and revoked_at is null;

      update public.institution_reviews
      set status = 'TEMPORARILY_HIDDEN'
      where verification_request_id = request_row.id and status = 'APPROVED';
    end if;
  elsif request_row.kind = 'TUTOR_IDENTITY' then
    update public.tutor_profiles
    set identity_verified = (target_status = 'APPROVED'),
        verified = (target_status = 'APPROVED') and exists (
          select 1 from public.tutor_credentials credential
          where credential.tutor_id = tutor_profiles.id and credential.verified
        ),
        verification_level = case when target_status = 'APPROVED' then 'IDENTITY' else 'PENDING' end,
        updated_at = now()
    where user_id = request_row.requester_user_id;
  elsif request_row.kind = 'TUTOR_CREDENTIAL' then
    if target_status = 'APPROVED' then
      update public.tutor_credentials
      set verified = true,
          reviewed_at = now()
      where tutor_id = (
        select profile.id from public.tutor_profiles profile
        where profile.user_id = request_row.requester_user_id
      )
        and kind::text = request_row.evidence_type;
    else
      update public.tutor_credentials
      set verified = false,
          reviewed_at = now()
      where tutor_id = (
        select profile.id from public.tutor_profiles profile
        where profile.user_id = request_row.requester_user_id
      )
        and kind::text = request_row.evidence_type;
    end if;
    update public.tutor_profiles
    set verified = identity_verified and exists (
          select 1 from public.tutor_credentials credential
          where credential.tutor_id = tutor_profiles.id and credential.verified
        ),
        verification_level = case
          when identity_verified and exists (
            select 1 from public.tutor_credentials credential
            where credential.tutor_id = tutor_profiles.id and credential.verified
          ) then 'CREDENTIALS'
          when identity_verified then 'IDENTITY'
          else 'PENDING'
        end,
        updated_at = now()
    where user_id = request_row.requester_user_id;
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'verification.' || lower(target_status::text), 'verification_request', request_row.id, jsonb_build_object('note', nullif(trim(review_note), '')));

  return jsonb_build_object('id', request_row.id, 'status', target_status, 'accessEndsAt', access_end);
end;
$$;

revoke all on function public.review_verification_request(uuid, public.verification_request_status, text) from public, anon;
grant execute on function public.review_verification_request(uuid, public.verification_request_status, text) to authenticated;

create or replace function public.moderate_institution_review(
  target_review_id uuid,
  target_status public.institution_review_status,
  review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_row public.institution_reviews%rowtype;
begin
  if not private.is_edutalk_operator(array['CONTENT_MODERATOR', 'ADMIN']::public.operator_role[]) then
    raise exception 'operator role required';
  end if;
  if target_status not in ('PENDING', 'APPROVED', 'REJECTED', 'TEMPORARILY_HIDDEN')
    or char_length(coalesce(review_note, '')) > 1000 then
    raise exception 'invalid review input';
  end if;

  select * into review_row from public.institution_reviews
  where id = target_review_id for update;
  if not found then raise exception 'review not found'; end if;

  if target_status = 'APPROVED' and not exists (
    select 1 from public.verification_requests request
    where request.id = review_row.verification_request_id
      and request.requester_user_id = review_row.author_user_id
      and request.kind = 'INSTITUTION_RELATION'
      and request.status = 'APPROVED'
      and request.target_key = review_row.institution_target_key
      and request.requested_role = review_row.relation
  ) then
    raise exception 'approved matching verification required';
  end if;

  update public.institution_reviews set status = target_status where id = review_row.id;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'institution_review.' || lower(target_status::text), 'institution_review', review_row.id, jsonb_build_object('note', nullif(trim(review_note), '')));
  return jsonb_build_object('id', review_row.id, 'status', target_status);
end;
$$;

revoke all on function public.moderate_institution_review(uuid, public.institution_review_status, text) from public, anon;
grant execute on function public.moderate_institution_review(uuid, public.institution_review_status, text) to authenticated;

revoke update, delete on public.support_requests from authenticated;
grant update (status, response_body, responded_by, responded_at, updated_at) on public.support_requests to authenticated;

-- 인증 원본은 공개 URL이 없는 전용 비공개 버킷에 보관한다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-documents',
  'verification-documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload own verification documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.verification_requests request
    where request.id::text = (storage.foldername(name))[2]
      and request.requester_user_id = (select auth.uid())
      and request.status in ('PENDING', 'NEEDS_INFO')
  )
);

create policy "users read own verification documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.verification_requests request
    where request.id::text = (storage.foldername(name))[2]
      and request.requester_user_id = (select auth.uid())
  )
);

create policy "users delete pending verification documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.verification_requests request
    where request.id::text = (storage.foldername(name))[2]
      and request.requester_user_id = (select auth.uid())
      and request.status in ('PENDING', 'NEEDS_INFO')
  )
);

create policy "verification operators read verification documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'verification-documents'
  and private.is_edutalk_operator(array['VERIFICATION_REVIEWER', 'ADMIN']::public.operator_role[])
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('tutor-review-media', 'tutor-review-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('message-attachments', 'message-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload own pending tutor review media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'tutor-review-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.tutor_reviews review
    where review.id::text = (storage.foldername(name))[2]
      and review.author_user_id = (select auth.uid())
      and not review.verified_lesson
  )
);
create policy "users read allowed tutor review media"
on storage.objects for select to authenticated
using (
  bucket_id = 'tutor-review-media'
  and exists (
    select 1 from public.tutor_review_media media
    join public.tutor_reviews review on review.id = media.review_id
    where media.storage_object_path = storage.objects.name
      and media.deleted_at is null
      and (review.author_user_id = (select auth.uid()) or review.verified_lesson)
  )
);
create policy "users delete own pending tutor review media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'tutor-review-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.tutor_reviews review
    where review.id::text = (storage.foldername(name))[2]
      and review.author_user_id = (select auth.uid())
      and not review.verified_lesson
  )
);

create policy "message authors upload attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.communication_messages message
    join public.communication_threads thread on thread.id = message.thread_id
    where message.id::text = (storage.foldername(name))[2]
      and message.author_user_id = (select auth.uid())
      and (thread.teacher_user_id = (select auth.uid()) or thread.parent_user_id = (select auth.uid()))
  )
);
create policy "thread participants read attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'message-attachments'
  and exists (
    select 1 from public.communication_attachments attachment
    join public.communication_messages message on message.id = attachment.message_id
    join public.communication_threads thread on thread.id = message.thread_id
    where attachment.storage_object_path = storage.objects.name
      and (thread.teacher_user_id = (select auth.uid()) or thread.parent_user_id = (select auth.uid()))
  )
);

create policy "users add own verification document metadata"
on public.verification_documents for insert to authenticated
with check (
  storage_bucket = 'verification-documents'
  and split_part(storage_object_path, '/', 1) = (select auth.uid())::text
  and split_part(storage_object_path, '/', 2) = verification_request_id::text
  and mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  and byte_size between 1 and 5242880
  and exists (
    select 1 from public.verification_requests request
    where request.id = verification_documents.verification_request_id
      and request.requester_user_id = (select auth.uid())
      and request.status in ('PENDING', 'NEEDS_INFO')
  )
);

create policy "users mark own pending verification documents deleted"
on public.verification_documents for update to authenticated
using (
  exists (
    select 1 from public.verification_requests request
    where request.id = verification_documents.verification_request_id
      and request.requester_user_id = (select auth.uid())
      and request.status in ('PENDING', 'NEEDS_INFO')
  )
)
with check (
  deleted_at is not null
  and exists (
    select 1 from public.verification_requests request
    where request.id = verification_documents.verification_request_id
      and request.requester_user_id = (select auth.uid())
      and request.status in ('PENDING', 'NEEDS_INFO')
  )
);

revoke insert, update, delete on public.verification_documents from authenticated;
grant insert (verification_request_id, storage_bucket, storage_object_path, document_kind, mime_type, byte_size)
  on public.verification_documents to authenticated;
grant update (deleted_at) on public.verification_documents to authenticated;
grant select, insert, update on public.tutor_review_media to authenticated;
grant select, insert on public.communication_attachments to authenticated;
grant select on public.tutor_review_media to anon;

revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke update, delete on public.tutor_contact_requests, public.tutor_job_applications from authenticated;
grant update (status, response_message, responded_by, responded_at, updated_at) on public.tutor_contact_requests to authenticated;
grant update (status, response_message, responded_by, responded_at, updated_at) on public.tutor_job_applications to authenticated;

-- 공개 숫자 집계만 반환하고 후기 본문·작성자·증빙은 노출하지 않는다.
create or replace function public.get_institution_review_summary(review_target_key text)
returns table (
  relation public.edutalk_role,
  review_count bigint,
  overall_average numeric,
  items jsonb,
  is_public boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with roles(relation) as (
    values ('PARENT'::public.edutalk_role), ('STUDENT'::public.edutalk_role), ('TEACHER'::public.edutalk_role)
  ), approved as (
    select review.relation, review.scores
    from public.institution_reviews review
    where review.institution_target_key = review_target_key
      and review.status = 'APPROVED'
      and review.relation in ('PARENT', 'STUDENT', 'TEACHER')
      and review_target_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ), counts as (
    select approved.relation, count(*) as review_count
    from approved group by approved.relation
  ), score_averages as (
    select approved.relation, score.key, avg((score.value #>> '{}')::numeric) as average
    from approved
    cross join lateral jsonb_each(approved.scores) score
    where jsonb_typeof(score.value) = 'number'
    group by approved.relation, score.key
  ), item_groups as (
    select score_averages.relation,
      jsonb_object_agg(score_averages.key, round(score_averages.average, 2)) as items,
      avg(score_averages.average) as overall_average
    from score_averages group by score_averages.relation
  )
  select roles.relation,
    coalesce(counts.review_count, 0),
    case when roles.relation = 'TEACHER' and coalesce(counts.review_count, 0) < 3 then null
      else round(item_groups.overall_average, 2) end,
    case when roles.relation = 'TEACHER' and coalesce(counts.review_count, 0) < 3 then '{}'::jsonb
      else coalesce(item_groups.items, '{}'::jsonb) end,
    not (roles.relation = 'TEACHER' and coalesce(counts.review_count, 0) < 3)
  from roles
  left join counts on counts.relation = roles.relation
  left join item_groups on item_groups.relation = roles.relation;
$$;

revoke all on function public.get_institution_review_summary(text) from public;
grant execute on function public.get_institution_review_summary(text) to anon, authenticated;

create or replace function private.notify_verification_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (
      new.requester_user_id,
      '인증 요청 상태가 변경됐어요',
      case new.status
        when 'APPROVED' then '인증이 승인됐습니다. 기관 관계 인증은 6개월 후기 열람권이 함께 적용됩니다.'
        when 'NEEDS_INFO' then '인증 요청에 보완 자료가 필요합니다.'
        when 'REJECTED' then '인증 요청이 반려됐습니다. 처리 메모를 확인해 주세요.'
        else '인증 요청이 다시 대기 상태로 변경됐습니다.'
      end,
      'VERIFICATION',
      '/trust-center'
    );
  end if;
  return new;
end;
$$;

create or replace function private.notify_review_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (
      new.author_user_id,
      '기관 후기 심사 결과가 도착했어요',
      case new.status
        when 'APPROVED' then '후기가 승인되어 역할별 집계에 반영됐습니다.'
        when 'REJECTED' then '후기가 반려됐습니다.'
        when 'TEMPORARILY_HIDDEN' then '후기가 임시 비공개 처리됐습니다.'
        else '후기가 다시 심사 대기 상태가 됐습니다.'
      end,
      'REVIEW',
      '/activity'
    );
  end if;
  return new;
end;
$$;

create or replace function private.notify_support_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status or old.responded_at is distinct from new.responded_at then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (new.user_id, '고객센터 답변이 업데이트됐어요', '문의 상태와 운영자 답변을 확인해 주세요.', 'SUPPORT', '/support');
  end if;
  return new;
end;
$$;

create or replace function private.notify_tutor_contact_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status or old.responded_at is distinct from new.responded_at then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (new.requester_user_id, '튜터 문의 답변이 업데이트됐어요', '튜터 문의 상태와 답변을 확인해 주세요.', 'TUTOR', '/tutors');
  end if;
  return new;
end;
$$;

create or replace function private.notify_tutor_application_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status or old.responded_at is distinct from new.responded_at then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (new.applicant_user_id, '튜터 지원 결과가 업데이트됐어요', '구인 지원 상태와 답변을 확인해 주세요.', 'TUTOR', '/tutors');
  end if;
  return new;
end;
$$;

revoke all on function private.notify_verification_status() from public, anon, authenticated;
revoke all on function private.notify_review_status() from public, anon, authenticated;
revoke all on function private.notify_support_response() from public, anon, authenticated;
revoke all on function private.notify_tutor_contact_response() from public, anon, authenticated;
revoke all on function private.notify_tutor_application_response() from public, anon, authenticated;

create trigger notify_verification_status after update of status on public.verification_requests
  for each row execute function private.notify_verification_status();
create trigger notify_review_status after update of status on public.institution_reviews
  for each row execute function private.notify_review_status();
create trigger notify_support_response after update of status, responded_at on public.support_requests
  for each row execute function private.notify_support_response();
create trigger notify_tutor_contact_response after update of status, responded_at on public.tutor_contact_requests
  for each row execute function private.notify_tutor_contact_response();
create trigger notify_tutor_application_response after update of status, responded_at on public.tutor_job_applications
  for each row execute function private.notify_tutor_application_response();

-- 비공개 버킷은 유지한다. 익명 사용자는 승인된 공개 후기 사진의 signed URL 생성에 필요한 객체 읽기만 할 수 있다.
create policy "public reads approved tutor review media objects"
on storage.objects for select to anon
using (
  bucket_id = 'tutor-review-media'
  and exists (
    select 1
    from public.tutor_review_media media
    join public.tutor_reviews review on review.id = media.review_id
    where media.storage_object_path = storage.objects.name
      and media.deleted_at is null
      and review.verified_lesson
  )
);

-- 튜터 후기는 운영자 심사 전까지 공개 평점과 사진에 반영하지 않는다.
alter table public.tutor_reviews
  alter column rating type numeric(2,1) using rating::numeric(2,1),
  add column if not exists moderation_status text not null default 'PENDING' check (moderation_status in ('PENDING', 'APPROVED', 'REJECTED')),
  add column if not exists moderation_note text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(user_id) on delete set null;

create index if not exists tutor_reviews_moderation_queue_idx
  on public.tutor_reviews (moderation_status, created_at desc);

create or replace function public.moderate_tutor_review(
  target_review_id uuid,
  target_status text,
  review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_row public.tutor_reviews%rowtype;
begin
  if not private.is_edutalk_operator(array['CONTENT_MODERATOR', 'ADMIN']::public.operator_role[]) then
    raise exception 'operator role required';
  end if;
  if target_status not in ('PENDING', 'APPROVED', 'REJECTED')
    or char_length(coalesce(review_note, '')) > 1000 then
    raise exception 'invalid tutor review input';
  end if;

  select * into review_row from public.tutor_reviews where id = target_review_id for update;
  if not found then raise exception 'tutor review not found'; end if;

  update public.tutor_reviews
  set moderation_status = target_status,
      moderation_note = nullif(trim(review_note), ''),
      moderated_at = now(),
      moderated_by = auth.uid(),
      verified_lesson = (target_status = 'APPROVED')
  where id = review_row.id;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'tutor_review.' || lower(target_status), 'tutor_review', review_row.id, jsonb_build_object('note', nullif(trim(review_note), '')));
  return jsonb_build_object('id', review_row.id, 'status', target_status, 'verifiedLesson', target_status = 'APPROVED');
end;
$$;

revoke all on function public.moderate_tutor_review(uuid, text, text) from public, anon;
grant execute on function public.moderate_tutor_review(uuid, text, text) to authenticated;

-- 운영자가 확인한 외부 후기 원문 링크만 canonical 기관 상세에 공개한다.
-- 평점, 후기 수, 본문, 작성자와 검색 결과는 수집·저장·집계하지 않는다.
create table if not exists public.institution_external_review_sources (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  platform text not null check (char_length(trim(platform)) between 1 and 80),
  source_label text not null check (char_length(trim(source_label)) between 1 and 160),
  original_url text,
  checked_at date not null,
  status text not null check (status in ('LINK_ONLY', 'UNAVAILABLE')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'LINK_ONLY' and original_url ~ '^https://') or (status = 'UNAVAILABLE' and original_url is null)),
  unique (institution_id, platform)
);

create index if not exists institution_external_review_sources_public_idx
  on public.institution_external_review_sources(institution_id, checked_at desc)
  where is_public;

alter table public.institution_external_review_sources enable row level security;

create policy "public reads approved external review source links"
on public.institution_external_review_sources for select to anon, authenticated
using (
  is_public
  and exists (
    select 1 from public.institutions institution
    where institution.id = institution_external_review_sources.institution_id
      and institution.is_public
      and not institution.is_synthetic
  )
);

create policy "data operators manage external review source links"
on public.institution_external_review_sources for all to authenticated
using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]))
with check (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));

grant select on public.institution_external_review_sources to anon, authenticated;
grant insert, update, delete on public.institution_external_review_sources to authenticated;

-- 공개 순위의 주간 변동은 운영자가 실제 공개 집계를 확정해 캡처한 값에서만 계산한다.
-- 스냅샷이 없으면 API와 화면은 상승·하락·신규를 표시하지 않는다.
create table public.institution_ranking_weekly_snapshots (
  snapshot_week date not null,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  relation public.edutalk_role not null check (relation in ('PARENT', 'STUDENT', 'TEACHER')),
  rank_position integer not null check (rank_position > 0),
  score numeric(3, 2) not null check (score between 0 and 5),
  review_count integer not null check (review_count >= 0),
  captured_at timestamptz not null default now(),
  captured_by uuid references public.profiles(user_id) on delete set null,
  primary key (snapshot_week, institution_id, relation)
);
create index institution_ranking_weekly_snapshots_lookup_idx on public.institution_ranking_weekly_snapshots (relation, snapshot_week desc, rank_position);
alter table public.institution_ranking_weekly_snapshots enable row level security;
revoke all on public.institution_ranking_weekly_snapshots from anon, authenticated;

create or replace function public.capture_institution_ranking_week(target_week date default date_trunc('week', now())::date)
returns integer language plpgsql security definer set search_path = '' as $$
declare captured_count integer;
begin
  if not private.is_edutalk_operator(array['ADMIN']::public.operator_role[]) then raise exception 'admin role required'; end if;
  if target_week <> date_trunc('week', target_week)::date then raise exception 'week must start on monday'; end if;
  delete from public.institution_ranking_weekly_snapshots where snapshot_week = target_week;
  insert into public.institution_ranking_weekly_snapshots (snapshot_week, institution_id, relation, rank_position, score, review_count, captured_by)
  select target_week, summary.institution_id, summary.relation, row_number() over (partition by summary.relation order by summary.score desc, summary.review_count desc, summary.institution_name), summary.score, summary.review_count, auth.uid()
  from public.get_public_ranking_summaries() summary
  where (summary.relation <> 'TEACHER' or summary.review_count >= 3) and summary.score is not null;
  get diagnostics captured_count = row_count;
  return captured_count;
end;
$$;
revoke all on function public.capture_institution_ranking_week(date) from public, anon;
grant execute on function public.capture_institution_ranking_week(date) to authenticated;

create or replace function public.get_public_ranking_weekly_movements()
returns table (institution_id text, relation public.edutalk_role, rank_position integer, previous_rank_position integer, change text, snapshot_week text)
language sql security definer set search_path = '' as $$
  with latest_week as (
    select max(snapshot.snapshot_week) as value from public.institution_ranking_weekly_snapshots snapshot
  ), previous_week as (
    select max(snapshot.snapshot_week) as value from public.institution_ranking_weekly_snapshots snapshot, latest_week
    where snapshot.snapshot_week < latest_week.value
  ), current_snapshot as (
    select snapshot.* from public.institution_ranking_weekly_snapshots snapshot, latest_week
    where snapshot.snapshot_week = latest_week.value
  ), prior_snapshot as (
    select snapshot.* from public.institution_ranking_weekly_snapshots snapshot, previous_week
    where snapshot.snapshot_week = previous_week.value
  )
  select current_snapshot.institution_id::text, current_snapshot.relation, current_snapshot.rank_position, prior_snapshot.rank_position,
    case when prior_snapshot.rank_position is null then 'NEW'
      when current_snapshot.rank_position < prior_snapshot.rank_position then 'UP'
      when current_snapshot.rank_position > prior_snapshot.rank_position then 'DOWN'
      else 'UNCHANGED' end,
    current_snapshot.snapshot_week::text
  from current_snapshot
  left join prior_snapshot on prior_snapshot.institution_id = current_snapshot.institution_id and prior_snapshot.relation = current_snapshot.relation
  where (select value from previous_week) is not null;
$$;
revoke all on function public.get_public_ranking_weekly_movements() from public, anon;
grant execute on function public.get_public_ranking_weekly_movements() to anon, authenticated;

-- 공개 베타에서는 로그인한 학부모에게 승인 학부모 후기의 장점 요약만 2건 미리 보여준다.
-- 개선점·추천 대상·작성자·추가 설명·교육자 근무후기는 기존 관계 인증 열람권 뒤에 두는다.
create or replace function public.get_parent_review_previews(review_target_key text)
returns table (strength_preview text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select left(review.strength, 180), review.created_at
  from public.institution_reviews review
  where auth.uid() is not null
    and exists (
      select 1 from public.user_roles role
      where role.user_id = auth.uid() and role.role = 'PARENT'
    )
    and review.institution_target_key = review_target_key
    and review.relation = 'PARENT'
    and review.status = 'APPROVED'
    and review.author_hidden_at is null
  order by review.created_at desc
  limit 2
$$;

revoke all on function public.get_parent_review_previews(text) from public, anon;
grant execute on function public.get_parent_review_previews(text) to authenticated;

-- 보호자 자녀 프로필은 선택적으로 실제 학생 연결과 대응한다. 별칭·학년 외 정보는 추가하지 않는다.
alter table public.student_user_links
  add column if not exists child_profile_id uuid references public.child_profiles(id) on delete set null;

create unique index if not exists student_parent_links_one_child_profile_idx
  on public.student_user_links (child_profile_id)
  where relationship = 'PARENT' and is_active and child_profile_id is not null;

create or replace function public.redeem_student_user_link_invite(
  invitation_digest text,
  selected_child_profile_id uuid
)
returns table (student_id uuid, linked_role public.edutalk_role)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.student_parent_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into invite from public.student_parent_invites
  where code_digest = invitation_digest and used_at is null and expires_at > now()
  for update;
  if not found then raise exception 'invalid invitation'; end if;

  if invite.link_role = 'PARENT' then
    if not exists (
      select 1 from public.user_roles role
      where role.user_id = auth.uid() and role.role = 'PARENT'
    ) then raise exception 'parent role required'; end if;
    if selected_child_profile_id is not null and not exists (
      select 1 from public.child_profiles child
      where child.id = selected_child_profile_id and child.guardian_user_id = auth.uid()
    ) then raise exception 'child profile not owned'; end if;
    if selected_child_profile_id is not null and exists (
      select 1 from public.student_user_links link
      where link.child_profile_id = selected_child_profile_id
        and link.relationship = 'PARENT'
        and link.is_active
        and link.student_id <> invite.student_id
    ) then raise exception 'child profile already linked'; end if;
  elsif invite.link_role = 'STUDENT' then
    if selected_child_profile_id is not null then raise exception 'child profile is parent only'; end if;
    if not exists (
      select 1
      from public.user_roles role
      join public.user_consents consent on consent.user_id = role.user_id
      where role.user_id = auth.uid()
        and role.role = 'STUDENT'
        and consent.age_band in ('FOURTEEN_PLUS', 'ADULT')
    ) then raise exception 'eligible student role required'; end if;
  else
    raise exception 'invalid invitation role';
  end if;

  insert into public.student_user_links (student_id, user_id, relationship, child_profile_id)
  values (invite.student_id, auth.uid(), invite.link_role, selected_child_profile_id)
  on conflict on constraint student_user_links_pkey do update set
    is_active = true,
    child_profile_id = case when student_user_links.relationship = 'PARENT' then coalesce(excluded.child_profile_id, student_user_links.child_profile_id) else null end;

  if invite.link_role = 'PARENT' then
    insert into public.communication_threads (student_id, teacher_user_id, parent_user_id)
    select invite.student_id, link.user_id, auth.uid()
    from public.student_user_links link
    where link.student_id = invite.student_id
      and link.relationship = 'TEACHER'
      and link.is_active
    on conflict on constraint communication_threads_participants_key do nothing;
  end if;

  update public.student_parent_invites
  set used_at = now(), used_by = auth.uid()
  where id = invite.id;

  return query select invite.student_id, invite.link_role;
end;
$$;

revoke all on function public.redeem_student_user_link_invite(text, uuid) from public, anon;
grant execute on function public.redeem_student_user_link_invite(text, uuid) to authenticated;

create or replace function private.notify_tutor_review_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.moderation_status is distinct from new.moderation_status then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (
      new.author_user_id,
      '튜터 후기 심사 결과가 도착했어요',
      case new.moderation_status
        when 'APPROVED' then '후기와 사진이 승인되어 공개 평점에 반영됐습니다.'
        when 'REJECTED' then '후기가 반려되어 공개되지 않습니다.'
        else '후기가 다시 심사 대기 상태가 됐습니다.'
      end,
      'TUTOR',
      '/tutors/' || new.tutor_id::text
    );
  end if;
  return new;
end;
$$;

revoke all on function private.notify_tutor_review_status() from public, anon, authenticated;
create trigger notify_tutor_review_status
  after update of moderation_status on public.tutor_reviews
  for each row execute function private.notify_tutor_review_status();

-- 튜터 응답률은 본인 입력값이 아니라 실제 계정 문의 응답 결과로만 계산한다.
create or replace function private.refresh_tutor_response_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tutor_id uuid;
begin
  target_tutor_id := case when tg_op = 'DELETE' then old.tutor_id else new.tutor_id end;
  update public.tutor_profiles profile
  set response_rate = coalesce((
        select round(100.0 * count(*) filter (where request.responded_at is not null) / nullif(count(*), 0))::smallint
        from public.tutor_contact_requests request
        where request.tutor_id = target_tutor_id
      ), 0),
      updated_at = now()
  where profile.id = target_tutor_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.refresh_tutor_response_rate() from public, anon, authenticated;
create trigger refresh_tutor_response_rate
  after insert or update of responded_at or delete on public.tutor_contact_requests
  for each row execute function private.refresh_tutor_response_rate();

-- 외부 수집은 연결하지 않는다. 운영자가 검수한 공개 정책·행사 데이터만 앱에 적재할 수 있다.
create table public.public_information_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null check (char_length(summary) between 1 and 3000),
  audience_roles public.edutalk_role[] not null default '{}',
  category text not null check (category in ('POLICY', 'EVENT', 'PROGRAM')),
  organizer text not null check (char_length(organizer) between 1 and 160),
  application_period text not null check (char_length(application_period) between 1 and 160),
  status text not null check (status in ('OPEN', 'ONGOING', 'CLOSED')),
  region text not null check (char_length(region) between 1 and 120),
  source_url text not null check (source_url ~ '^https://'),
  source_label text not null check (char_length(source_label) between 1 and 160),
  source_date date not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index public_information_items_public_source_idx
  on public.public_information_items (source_date desc)
  where is_public;
alter table public.public_information_items enable row level security;
create policy "public reads published information items" on public.public_information_items for select to anon, authenticated
using (is_public);
create policy "data operators manage information items" on public.public_information_items for all to authenticated
using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]))
with check (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));
grant select on public.public_information_items to anon, authenticated;
grant insert, update, delete on public.public_information_items to authenticated;

-- Stripe 실제 호출은 앱 서버에서만 수행한다. 아래 테이블은 검증된 서비스 전용 동기화 결과만 적재한다.
-- 카드번호, 결제수단 상세, Stripe 서명 원문은 저장하지 않는다.
create table public.billing_customers (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  provider text not null default 'STRIPE' check (provider = 'STRIPE'),
  provider_customer_id text not null unique check (char_length(provider_customer_id) between 1 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  provider text not null default 'STRIPE' check (provider = 'STRIPE'),
  provider_subscription_id text not null unique check (char_length(provider_subscription_id) between 1 and 255),
  provider_price_id text not null check (char_length(provider_price_id) between 1 and 255),
  status text not null check (status in ('ACTIVE', 'PAST_DUE', 'CANCELED')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index billing_subscriptions_one_current_user_idx
  on public.billing_subscriptions (user_id)
  where status in ('ACTIVE', 'PAST_DUE');

create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'STRIPE' check (provider = 'STRIPE'),
  provider_event_id text not null unique check (char_length(provider_event_id) between 1 and 255),
  event_type text not null check (char_length(event_type) between 1 and 160),
  occurred_at timestamptz not null,
  processed_at timestamptz,
  processing_error text check (processing_error is null or char_length(processing_error) <= 1000),
  created_at timestamptz not null default now()
);

create index billing_webhook_events_unprocessed_idx
  on public.billing_webhook_events (created_at)
  where processed_at is null;

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_webhook_events enable row level security;

-- 사용자·운영자 직접 쓰기 정책을 만들지 않는다. 검증된 service-role 서버만 적재·처리한다.
create policy "users read own billing subscription" on public.billing_subscriptions for select to authenticated
using (user_id = (select auth.uid()));
grant select on public.billing_subscriptions to authenticated;

create or replace function private.sync_ai_usage_from_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_usage_accounts (user_id, plan, subscription_active, current_period_end)
  values (
    new.user_id,
    case when new.status = 'ACTIVE' and new.current_period_end > now() then 'UNLIMITED'::public.subscription_plan else 'FREE'::public.subscription_plan end,
    new.status = 'ACTIVE' and new.current_period_end > now(),
    new.current_period_end
  )
  on conflict (user_id) do update set
    plan = case when new.status = 'ACTIVE' and new.current_period_end > now() then 'UNLIMITED'::public.subscription_plan else 'FREE'::public.subscription_plan end,
    subscription_active = new.status = 'ACTIVE' and new.current_period_end > now(),
    current_period_end = new.current_period_end,
    updated_at = now();
  return new;
end;
$$;

revoke all on function private.sync_ai_usage_from_billing() from public, anon, authenticated;
create trigger sync_ai_usage_from_billing
  after insert or update of status, current_period_end on public.billing_subscriptions
  for each row execute function private.sync_ai_usage_from_billing();

-- 공개 랭킹은 canonical 기관의 승인 후기 숫자만 반환한다. 후기 본문·작성자·증빙은 포함하지 않는다.
create or replace function public.get_public_ranking_summaries()
returns table (
  institution_id uuid,
  public_slug text,
  institution_name text,
  institution_type public.canonical_institution_type,
  institution_zone public.institution_zone,
  relation public.edutalk_role,
  review_count bigint,
  overall_average numeric,
  items jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with approved as (
    select review.institution_target_key, review.relation, review.scores
    from public.institution_reviews review
    where review.status = 'APPROVED'
      and review.institution_target_key is not null
      and review.relation in ('PARENT', 'STUDENT', 'TEACHER')
  ), review_counts as (
    select approved.institution_target_key, approved.relation, count(*) as review_count
    from approved
    group by approved.institution_target_key, approved.relation
  ), score_averages as (
    select approved.institution_target_key, approved.relation, score.key,
      avg((score.value #>> '{}')::numeric) as average
    from approved
    cross join lateral jsonb_each(approved.scores) score
    where jsonb_typeof(score.value) = 'number'
    group by approved.institution_target_key, approved.relation, score.key
  ), summaries as (
    select score_averages.institution_target_key, score_averages.relation, review_counts.review_count,
      avg(score_averages.average) as overall_average,
      jsonb_object_agg(score_averages.key, round(score_averages.average, 2)) as items
    from score_averages
    join review_counts on review_counts.institution_target_key = score_averages.institution_target_key
      and review_counts.relation = score_averages.relation
    group by score_averages.institution_target_key, score_averages.relation, review_counts.review_count
  )
  select institution.id, institution.public_slug, institution.name, institution.institution_type, institution.zone,
    summaries.relation, summaries.review_count, round(summaries.overall_average, 2), summaries.items
  from summaries
  join public.institutions institution on institution.public_slug = summaries.institution_target_key
  where institution.is_public
    and not institution.is_synthetic
    and (summaries.relation <> 'TEACHER' or summaries.review_count >= 3)
  order by summaries.overall_average desc, summaries.review_count desc, institution.name;
$$;

revoke all on function public.get_public_ranking_summaries() from public;
grant execute on function public.get_public_ranking_summaries() to anon, authenticated;

-- 동의 현재값과 별도로, 온보딩 성공 시점의 약관별 동의 이력을 본인 계정에 보관한다.
create table public.user_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  age_band public.edutalk_age_band not null,
  terms_version text not null,
  privacy_version text not null,
  community_version text not null,
  consented_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index user_consent_events_user_consented_idx
  on public.user_consent_events (user_id, consented_at desc);

alter table public.user_consent_events enable row level security;
create policy "users read own consent events" on public.user_consent_events for select to authenticated
using (user_id = (select auth.uid()));
create policy "users add own consent events" on public.user_consent_events for insert to authenticated
with check (user_id = (select auth.uid()));
grant select, insert on public.user_consent_events to authenticated;

create or replace function public.complete_edutalk_onboarding(
  selected_age_band public.edutalk_age_band,
  selected_role public.edutalk_role,
  terms_version text,
  privacy_version text,
  community_version text,
  consented_at timestamptz,
  profile_fields jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if selected_age_band = 'UNDER_14' and selected_role <> 'PARENT' then
    raise exception 'under 14 users must start with a guardian profile';
  end if;
  if char_length(terms_version) < 1 or char_length(terms_version) > 80
    or char_length(privacy_version) < 1 or char_length(privacy_version) > 80
    or char_length(community_version) < 1 or char_length(community_version) > 80 then
    raise exception 'invalid consent version';
  end if;
  if jsonb_typeof(profile_fields) <> 'object' then
    raise exception 'invalid profile fields';
  end if;

  insert into public.user_consents (
    user_id, age_band, terms_version, privacy_version, community_version, consented_at, updated_at
  ) values (
    auth.uid(), selected_age_band, terms_version, privacy_version, community_version, consented_at, now()
  )
  on conflict (user_id) do update set
    age_band = excluded.age_band,
    terms_version = excluded.terms_version,
    privacy_version = excluded.privacy_version,
    community_version = excluded.community_version,
    consented_at = excluded.consented_at,
    updated_at = now();

  insert into public.user_consent_events (
    user_id, age_band, terms_version, privacy_version, community_version, consented_at
  ) values (
    auth.uid(), selected_age_band, terms_version, privacy_version, community_version, consented_at
  );

  insert into public.user_roles (user_id, role)
  values (auth.uid(), selected_role)
  on conflict (user_id, role) do nothing;

  insert into public.user_role_profiles (user_id, role, fields, updated_at)
  values (auth.uid(), selected_role, profile_fields, now())
  on conflict (user_id, role) do update set
    fields = excluded.fields,
    updated_at = now();

  update public.profiles set active_role = selected_role where user_id = auth.uid();
end;
$$;

-- 기관 공식 답변의 공개 수정 이력. 작성자 식별자는 별도 보관하지 않으며, 이전 공개 본문과 수정 시각만 기록한다.
create table public.institution_reply_revisions (
  id uuid primary key default gen_random_uuid(),
  institution_reply_id uuid not null references public.institution_replies(id) on delete cascade,
  previous_body text not null check (char_length(previous_body) between 1 and 3000),
  revised_at timestamptz not null default now()
);
create index institution_reply_revisions_reply_revised_idx
  on public.institution_reply_revisions (institution_reply_id, revised_at desc);
alter table public.institution_reply_revisions enable row level security;

create or replace function private.record_institution_reply_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.body is distinct from new.body and old.is_published then
    insert into public.institution_reply_revisions (institution_reply_id, previous_body, revised_at)
    values (old.id, old.body, now());
  end if;
  return new;
end;
$$;
revoke all on function private.record_institution_reply_revision() from public, anon, authenticated;
create trigger record_institution_reply_revision
  before update of body on public.institution_replies
  for each row execute function private.record_institution_reply_revision();

drop function if exists public.get_public_institution_replies(text);
create function public.get_public_institution_replies(target_slug text)
returns table (
  body text,
  published_at timestamptz,
  revision_count bigint,
  last_revised_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select reply.body, reply.published_at,
    count(revision.id) as revision_count,
    max(revision.revised_at) as last_revised_at
  from public.institution_replies reply
  join public.institutions institution on institution.id = reply.institution_id
  join public.institution_reviews review on review.id = reply.review_id
    and review.status = 'APPROVED'
    and review.author_hidden_at is null
  left join public.institution_reply_revisions revision on revision.institution_reply_id = reply.id
  where institution.public_slug = target_slug
    and institution.is_public and not institution.is_synthetic
    and reply.is_published
  group by reply.id, reply.body, reply.published_at
  order by reply.published_at desc;
$$;
revoke all on function public.get_public_institution_replies(text) from public;
grant execute on function public.get_public_institution_replies(text) to anon, authenticated;

-- Canonical 기관 상세의 비용·셔틀·모집·프로그램·공개 변경 이력이다.
-- 실제 값은 운영자가 출처와 확인일을 검수해 is_public=true로 전환한 경우에만 공개한다.
create table if not exists public.institution_cost_items (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  item_label text not null check (char_length(item_label) between 1 and 160),
  amount_display text not null check (char_length(amount_display) between 1 and 160),
  source text not null check (char_length(source) between 1 and 160),
  checked_at date not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.institution_shuttle_info (
  institution_id uuid primary key references public.institutions(id) on delete cascade,
  available boolean,
  zones text[] not null default '{}',
  source text not null check (char_length(source) between 1 and 160),
  checked_at date not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.institution_recruitment_info (
  institution_id uuid primary key references public.institutions(id) on delete cascade,
  status text,
  waitlist_note text,
  source text not null check (char_length(source) between 1 and 160),
  checked_at date not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.institution_program_items (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  audience text,
  source text not null check (char_length(source) between 1 and 160),
  checked_at date not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.institution_public_change_history (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  public_field text not null check (char_length(public_field) between 1 and 80),
  summary text not null check (char_length(summary) between 1 and 1000),
  changed_at date not null,
  source text not null check (char_length(source) between 1 and 160),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists institution_cost_items_public_idx on public.institution_cost_items(institution_id, checked_at desc) where is_public;
create index if not exists institution_program_items_public_idx on public.institution_program_items(institution_id, checked_at desc) where is_public;
create index if not exists institution_change_history_public_idx on public.institution_public_change_history(institution_id, changed_at desc) where is_public;
alter table public.institution_cost_items enable row level security;
alter table public.institution_shuttle_info enable row level security;
alter table public.institution_recruitment_info enable row level security;
alter table public.institution_program_items enable row level security;
alter table public.institution_public_change_history enable row level security;
create policy "public reads approved institution cost items" on public.institution_cost_items for select to anon, authenticated using (is_public and exists (select 1 from public.institutions institution where institution.id = institution_cost_items.institution_id and institution.is_public and not institution.is_synthetic));
create policy "public reads approved institution shuttle info" on public.institution_shuttle_info for select to anon, authenticated using (is_public and exists (select 1 from public.institutions institution where institution.id = institution_shuttle_info.institution_id and institution.is_public and not institution.is_synthetic));
create policy "public reads approved institution recruitment info" on public.institution_recruitment_info for select to anon, authenticated using (is_public and exists (select 1 from public.institutions institution where institution.id = institution_recruitment_info.institution_id and institution.is_public and not institution.is_synthetic));
create policy "public reads approved institution program items" on public.institution_program_items for select to anon, authenticated using (is_public and exists (select 1 from public.institutions institution where institution.id = institution_program_items.institution_id and institution.is_public and not institution.is_synthetic));
create policy "public reads approved institution change history" on public.institution_public_change_history for select to anon, authenticated using (is_public and exists (select 1 from public.institutions institution where institution.id = institution_public_change_history.institution_id and institution.is_public and not institution.is_synthetic));
grant select on public.institution_cost_items, public.institution_shuttle_info, public.institution_recruitment_info, public.institution_program_items, public.institution_public_change_history to anon, authenticated;
create policy "data operators manage institution cost items" on public.institution_cost_items for all to authenticated using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[])) with check (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));
create policy "data operators manage institution shuttle info" on public.institution_shuttle_info for all to authenticated using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[])) with check (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));
create policy "data operators manage institution recruitment info" on public.institution_recruitment_info for all to authenticated using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[])) with check (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));
create policy "data operators manage institution program items" on public.institution_program_items for all to authenticated using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[])) with check (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));
create policy "data operators manage institution change history" on public.institution_public_change_history for all to authenticated using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[])) with check (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));
grant insert, update, delete on public.institution_cost_items, public.institution_shuttle_info, public.institution_recruitment_info, public.institution_program_items, public.institution_public_change_history to authenticated;

-- 공개 필드별 출처·확인 주체·신뢰등급은 상세 값과 분리해 보관한다.
create table if not exists public.institution_field_provenance (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  public_field text not null check (char_length(public_field) between 1 and 80),
  source text not null check (char_length(source) between 1 and 160),
  checked_at date not null,
  confirmed_by text,
  trust_level text not null check (trust_level in ('PUBLIC_DATA', 'INSTITUTION_CONFIRMED', 'PAYMENT_ENROLLMENT_VERIFIED', 'STAFF_VERIFIED', 'PARENT_REPORTED', 'UNVERIFIED')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (institution_id, public_field)
);
create index if not exists institution_field_provenance_public_idx on public.institution_field_provenance(institution_id, checked_at desc) where is_public;
alter table public.institution_field_provenance enable row level security;
create policy "public reads approved institution field provenance" on public.institution_field_provenance for select to anon, authenticated using (is_public and exists (select 1 from public.institutions institution where institution.id = institution_field_provenance.institution_id and institution.is_public and not institution.is_synthetic));
create policy "data operators manage institution field provenance" on public.institution_field_provenance for all to authenticated using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[])) with check (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));
grant select, insert, update, delete on public.institution_field_provenance to authenticated;
grant select on public.institution_field_provenance to anon;

-- 공개 기관 상세에는 최종 정정과 기관 자체를 대상으로 한 신고의 안전한 처리 결과만 보인다.
-- 요청 원문, 운영자 메모, 작성자·신고자, 증빙과 후기 대상 신고는 반환하지 않는다.
alter table public.content_reports add column if not exists reviewed_at timestamptz;
create or replace function public.get_public_institution_handling_timeline(target_slug text)
returns table (kind text, outcome text, handled_at date)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select institution.id, institution.public_slug
    from public.institutions institution
    where institution.public_slug = target_slug
      and institution.is_public
      and not institution.is_synthetic
  ), corrections as (
    select 'CORRECTION'::text as kind, correction.status::text as outcome, correction.reviewed_at::date as handled_at
    from public.institution_corrections correction
    join target on target.public_slug = correction.target_key
    where correction.status in ('APPROVED', 'REJECTED', 'CANCELLED')
      and correction.reviewed_at is not null
  ), reports as (
    select 'REPORT'::text as kind, report.status::text as outcome, report.reviewed_at::date as handled_at
    from public.content_reports report
    join target on target.public_slug = report.target_key
    where report.target_type = 'institution'
      and report.target_id is null
      and report.status in ('TEMPORARILY_HIDDEN', 'UPHELD', 'RESTORED', 'CLOSED')
      and report.reviewed_at is not null
  )
  select * from corrections
  union all
  select * from reports
  order by handled_at desc;
$$;
revoke all on function public.get_public_institution_handling_timeline(text) from public;
grant execute on function public.get_public_institution_handling_timeline(text) to anon, authenticated;

-- 사용자가 알림 종류별 수신 여부를 고른다. 설정 행이 없으면 기존 동작과 같이 수신한다.
create table public.notification_preferences (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  kind public.notification_kind not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.notification_preferences enable row level security;
create policy "users read own notification preferences" on public.notification_preferences for select to authenticated
using (user_id = (select auth.uid()));
create policy "users create own notification preferences" on public.notification_preferences for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "users update own notification preferences" on public.notification_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
grant select, insert, update on public.notification_preferences to authenticated;

create or replace function private.notification_enabled(target_user_id uuid, target_kind public.notification_kind)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select preference.enabled
    from public.notification_preferences preference
    where preference.user_id = target_user_id and preference.kind = target_kind
  ), true);
$$;

revoke all on function private.notification_enabled(uuid, public.notification_kind) from public, anon, authenticated;

create or replace function private.notify_verification_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and private.notification_enabled(new.requester_user_id, 'VERIFICATION') then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (
      new.requester_user_id,
      '인증 요청 상태가 변경됐어요',
      case new.status
        when 'APPROVED' then '인증이 승인됐습니다. 기관 관계 인증은 6개월 후기 열람권이 함께 적용됩니다.'
        when 'NEEDS_INFO' then '인증 요청에 보완 자료가 필요합니다.'
        when 'REJECTED' then '인증 요청이 반려됐습니다. 처리 메모를 확인해 주세요.'
        else '인증 요청이 다시 대기 상태로 변경됐습니다.'
      end,
      'VERIFICATION',
      '/trust-center'
    );
  end if;
  return new;
end;
$$;

create or replace function private.notify_review_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and private.notification_enabled(new.author_user_id, 'REVIEW') then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (
      new.author_user_id,
      '기관 후기 심사 결과가 도착했어요',
      case new.status
        when 'APPROVED' then '후기가 승인되어 역할별 집계에 반영됐습니다.'
        when 'REJECTED' then '후기가 반려됐습니다.'
        when 'TEMPORARILY_HIDDEN' then '후기가 임시 비공개 처리됐습니다.'
        else '후기가 다시 심사 대기 상태가 됐습니다.'
      end,
      'REVIEW',
      '/activity'
    );
  end if;
  return new;
end;
$$;

create or replace function private.notify_support_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.status is distinct from new.status or old.responded_at is distinct from new.responded_at)
    and private.notification_enabled(new.user_id, 'SUPPORT') then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (new.user_id, '고객센터 답변이 업데이트됐어요', '문의 상태와 운영자 답변을 확인해 주세요.', 'SUPPORT', '/support');
  end if;
  return new;
end;
$$;

create or replace function private.notify_tutor_contact_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.status is distinct from new.status or old.responded_at is distinct from new.responded_at)
    and private.notification_enabled(new.requester_user_id, 'TUTOR') then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (new.requester_user_id, '튜터 문의 답변이 업데이트됐어요', '튜터 문의 상태와 답변을 확인해 주세요.', 'TUTOR', '/tutors');
  end if;
  return new;
end;
$$;

create or replace function private.notify_tutor_application_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.status is distinct from new.status or old.responded_at is distinct from new.responded_at)
    and private.notification_enabled(new.applicant_user_id, 'TUTOR') then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (new.applicant_user_id, '튜터 지원 결과가 업데이트됐어요', '구인 지원 상태와 답변을 확인해 주세요.', 'TUTOR', '/tutors');
  end if;
  return new;
end;
$$;

create or replace function private.notify_tutor_review_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.moderation_status is distinct from new.moderation_status
    and private.notification_enabled(new.author_user_id, 'TUTOR') then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (
      new.author_user_id,
      '튜터 후기 심사 결과가 도착했어요',
      case new.moderation_status
        when 'APPROVED' then '후기와 사진이 승인되어 공개 평점에 반영됐습니다.'
        when 'REJECTED' then '후기가 반려되어 공개되지 않습니다.'
        else '후기가 다시 심사 대기 상태가 됐습니다.'
      end,
      'TUTOR',
      '/tutors/' || new.tutor_id::text
    );
  end if;
  return new;
end;
$$;

create or replace function private.notify_communication_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread_row public.communication_threads%rowtype;
  recipient uuid;
begin
  select * into thread_row from public.communication_threads where id = new.thread_id;
  if not found then return new; end if;
  recipient := case when new.author_user_id = thread_row.teacher_user_id then thread_row.parent_user_id else thread_row.teacher_user_id end;
  if recipient is not null and recipient <> new.author_user_id and private.notification_enabled(recipient, 'ACCOUNT') then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (
      recipient,
      case when new.kind = 'JOURNAL' then '새 학생일지가 도착했어요' else '새 알림장 메시지가 도착했어요' end,
      case when new.kind = 'JOURNAL' then '선생님이 확인한 학생일지를 알림장에서 확인해 주세요.' else '학생별 알림장에서 새 내용을 확인해 주세요.' end,
      'ACCOUNT',
      '/messages'
    );
  end if;
  return new;
end;
$$;

create or replace function private.notify_correction_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and private.notification_enabled(new.requester_user_id, 'INSTITUTION') then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (new.requester_user_id, '기관 정보 정정 요청 상태가 변경됐어요', '정정 요청의 처리 상태와 운영자 메모를 확인해 주세요.', 'INSTITUTION', '/trust-center');
  end if;
  return new;
end;
$$;

create or replace function private.notify_content_report_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and private.notification_enabled(new.reporter_user_id, 'INSTITUTION') then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (new.reporter_user_id, '콘텐츠 신고 처리 상태가 변경됐어요', '신고 처리 상태와 운영자 메모를 확인해 주세요.', 'INSTITUTION', '/trust-center');
  end if;
  return new;
end;
$$;

-- 관심 기관의 승인 후기·공식 답변·모집 상태 변경은 저장한 사용자에게만 알린다.
create or replace function private.notify_favorite_institution_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status = 'APPROVED' and new.author_hidden_at is null then
    insert into public.notifications (user_id, title, body, kind, link_path)
    select favorite.user_id, '관심 기관에 새 후기가 등록됐어요', '승인된 새 후기를 기관 상세에서 확인해 주세요.', 'INSTITUTION', '/institutions/' || new.institution_target_key
    from public.institution_favorites favorite
    where favorite.target_key = new.institution_target_key
      and favorite.user_id <> new.author_user_id
      and private.notification_enabled(favorite.user_id, 'INSTITUTION');
  end if;
  return new;
end;
$$;

create or replace function private.notify_favorite_institution_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_slug text;
begin
  if tg_op = 'INSERT' then
    if not new.is_published then return new; end if;
  elsif not new.is_published or (old.is_published is not distinct from new.is_published and old.body is not distinct from new.body) then
    return new;
  end if;
  if new.is_published then
    select institution.public_slug into target_slug
    from public.institutions institution
    where institution.id = new.institution_id and institution.is_public and not institution.is_synthetic;
    if target_slug is not null then
      insert into public.notifications (user_id, title, body, kind, link_path)
      select favorite.user_id, '관심 기관의 공식 답변이 등록됐어요', '기관 관계자의 공식 답변을 확인해 주세요.', 'INSTITUTION', '/institutions/' || target_slug
      from public.institution_favorites favorite
      where favorite.target_key = target_slug
        and favorite.user_id <> coalesce(new.author_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and private.notification_enabled(favorite.user_id, 'INSTITUTION');
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.notify_favorite_institution_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_slug text;
begin
  select institution.public_slug into target_slug
  from public.institutions institution
  where institution.id = new.institution_id and institution.is_public and not institution.is_synthetic;
  if target_slug is not null then
    insert into public.notifications (user_id, title, body, kind, link_path)
    select favorite.user_id, '관심 기관의 모집 정보가 변경됐어요', '최신 모집·대기 상태와 확인일을 기관 상세에서 확인해 주세요.', 'INSTITUTION', '/institutions/' || target_slug
    from public.institution_favorites favorite
    where favorite.target_key = target_slug
      and private.notification_enabled(favorite.user_id, 'INSTITUTION');
  end if;
  return new;
end;
$$;

-- 새 canonical 기관이 공개되면 일치하는 저장 검색 소유자에게 한 번 알려 준다.
create or replace function private.notify_saved_search_institution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_public and not new.is_synthetic and new.public_slug is not null
    and (tg_op = 'INSERT' or old.is_public is distinct from new.is_public or old.public_slug is distinct from new.public_slug) then
    insert into public.notifications (user_id, title, body, kind, link_path)
    select distinct search.user_id, '저장한 검색에 새 기관이 생겼어요', search.label || ' 조건에 맞는 공개 기관을 확인해 주세요.', 'INSTITUTION'::public.notification_kind, '/institutions/' || new.public_slug
    from public.saved_searches search
    where search.zone = new.zone
      and (search.institution_type = 'ALL' or search.institution_type = new.institution_type::text)
      and (search.query = '' or new.name ilike '%' || search.query || '%' or new.address ilike '%' || search.query || '%')
      and private.notification_enabled(search.user_id, 'INSTITUTION');
  end if;
  return new;
end;
$$;

revoke all on function private.notify_favorite_institution_review() from public, anon, authenticated;
revoke all on function private.notify_favorite_institution_reply() from public, anon, authenticated;
revoke all on function private.notify_favorite_institution_status() from public, anon, authenticated;
revoke all on function private.notify_saved_search_institution() from public, anon, authenticated;

create trigger notify_favorite_institution_review
  after update of status on public.institution_reviews
  for each row execute function private.notify_favorite_institution_review();
create trigger notify_favorite_institution_reply
  after insert or update of is_published, body on public.institution_replies
  for each row execute function private.notify_favorite_institution_reply();
create trigger notify_favorite_institution_status
  after insert on public.institution_status_history
  for each row execute function private.notify_favorite_institution_status();
create trigger notify_saved_search_institution
  after insert or update of is_public, public_slug on public.institutions
  for each row execute function private.notify_saved_search_institution();

-- 사용자가 자주 확인하는 기관 탐색 조건. 최대 10개를 계정별로 보관한다.
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  query text not null default '' check (char_length(query) <= 80),
  zone public.institution_zone not null default 'OTHER',
  institution_type text not null default 'ALL' check (institution_type in ('ALL', 'CHILDCARE', 'KINDERGARTEN', 'ACADEMY', 'TUTORING')),
  sort text not null default 'RECOMMENDED' check (sort in ('RECOMMENDED', 'DISTANCE', 'RATING', 'REVIEWS', 'PRICE')),
  pickup boolean not null default false,
  trial boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, label)
);

create index saved_searches_user_created_idx on public.saved_searches (user_id, created_at desc);
alter table public.saved_searches enable row level security;
create policy "users read own saved searches" on public.saved_searches for select to authenticated
using (user_id = (select auth.uid()));
create policy "users create own saved searches" on public.saved_searches for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "users delete own saved searches" on public.saved_searches for delete to authenticated
using (user_id = (select auth.uid()));
grant select, insert, delete on public.saved_searches to authenticated;

-- 알림장 새 메시지는 해당 대화의 상대방에게 본문 없이 알림만 남긴다.
create or replace function private.notify_communication_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread_row public.communication_threads%rowtype;
  recipient uuid;
begin
  select * into thread_row from public.communication_threads where id = new.thread_id;
  if not found then return new; end if;
  recipient := case when new.author_user_id = thread_row.teacher_user_id then thread_row.parent_user_id else thread_row.teacher_user_id end;
  if recipient is not null and recipient <> new.author_user_id then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (
      recipient,
      case when new.kind = 'JOURNAL' then '새 학생일지가 도착했어요' else '새 알림장 메시지가 도착했어요' end,
      case when new.kind = 'JOURNAL' then '선생님이 확인한 학생일지를 알림장에서 확인해 주세요.' else '학생별 알림장에서 새 내용을 확인해 주세요.' end,
      'ACCOUNT',
      '/messages'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.notify_communication_message() from public, anon, authenticated;
create trigger notify_communication_message
  after insert on public.communication_messages
  for each row execute function private.notify_communication_message();

-- 인증 심사 종료 뒤 원본은 30일 유예 후 삭제 대상으로 표시한다.
create or replace function private.schedule_verification_document_retention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status in ('APPROVED', 'REJECTED', 'CANCELLED') then
    update public.verification_documents
    set retention_until = coalesce(retention_until, now() + interval '30 days')
    where verification_request_id = new.id and deleted_at is null;
  elsif old.status is distinct from new.status and new.status in ('PENDING', 'NEEDS_INFO') then
    update public.verification_documents set retention_until = null
    where verification_request_id = new.id and deleted_at is null;
  end if;
  return new;
end;
$$;

revoke all on function private.schedule_verification_document_retention() from public, anon, authenticated;
create trigger schedule_verification_document_retention
  after update of status on public.verification_requests
  for each row execute function private.schedule_verification_document_retention();

-- 제품 KPI 이벤트에는 원문·식별자·정확 위치·학생 정보·증빙 정보를 저장하지 않는다.
create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in ('LOGIN_STARTED', 'ROLE_SELECTED', 'LOCATION_SELECTED', 'ONBOARDING_COMPLETED', 'INSTITUTION_VIEWED', 'FAVORITE_ADDED', 'COMPARISON_CREATED', 'REVIEW_SUBMITTED', 'VERIFICATION_SUBMITTED', 'ACCOUNT_DELETION_STARTED')),
  path text not null check (char_length(path) between 1 and 160),
  category text not null check (char_length(category) between 1 and 60),
  role public.edutalk_role,
  created_at timestamptz not null default now()
);
create index product_events_name_created_idx on public.product_events (event_name, created_at desc);
alter table public.product_events enable row level security;
create policy "admins read product events" on public.product_events for select to authenticated
using (private.is_edutalk_operator(array['ADMIN']::public.operator_role[]));
grant select on public.product_events to authenticated;
revoke insert, update, delete on public.product_events from anon, authenticated;

-- 운영 관찰용 읽기 권한. 감사 로그 메타데이터와 원문 데이터는 API에서 반환하지 않는다.
create policy "admins read audit logs" on public.audit_logs for select to authenticated
using (private.is_edutalk_operator(array['ADMIN']::public.operator_role[]));
create policy "admins read notifications for observability" on public.notifications for select to authenticated
using (private.is_edutalk_operator(array['ADMIN']::public.operator_role[]));
create policy "admins read sync runs for observability" on public.data_sync_runs for select to authenticated
using (private.is_edutalk_operator(array['ADMIN']::public.operator_role[]));
create policy "admins read support requests for observability" on public.support_requests for select to authenticated
using (private.is_edutalk_operator(array['ADMIN']::public.operator_role[]));
grant select on public.audit_logs, public.notifications, public.data_sync_runs, public.support_requests to authenticated;

-- 상용 서버 노출을 제어한다. 데모 모드는 이 테이블을 조회하지 않는다.
create table public.feature_flags (
  key text primary key check (key in ('AI_GENERATION', 'REVIEW_SUBMISSION', 'TUTOR_WRITE', 'BILLING_CHECKOUT', 'PUBLIC_DATA_DISCOVERY')),
  default_enabled boolean not null,
  is_enabled boolean not null,
  note text check (note is null or char_length(note) <= 500),
  updated_by uuid references public.profiles(user_id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.feature_flags (key, default_enabled, is_enabled) values
  ('AI_GENERATION', true, true),
  ('REVIEW_SUBMISSION', true, true),
  ('TUTOR_WRITE', true, true),
  ('BILLING_CHECKOUT', false, false),
  ('PUBLIC_DATA_DISCOVERY', true, true);
alter table public.feature_flags enable row level security;
create policy "admins read feature flags" on public.feature_flags for select to authenticated
using (private.is_edutalk_operator(array['ADMIN']::public.operator_role[]));
create policy "admins update feature flags" on public.feature_flags for update to authenticated
using (private.is_edutalk_operator(array['ADMIN']::public.operator_role[]))
with check (private.is_edutalk_operator(array['ADMIN']::public.operator_role[]) and updated_by = (select auth.uid()));
grant select, update (is_enabled, note, updated_by, updated_at) on public.feature_flags to authenticated;

create or replace function public.is_feature_enabled(feature_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select flag.is_enabled from public.feature_flags flag where flag.key = feature_key), true);
$$;
revoke all on function public.is_feature_enabled(text) from public;
grant execute on function public.is_feature_enabled(text) to anon, authenticated;

-- 계정 비교 목록은 canonical 공개 기관 slug만 보관하며, 브라우저 demo 비교 목록과 섞지 않는다.
create table public.institution_comparisons (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  target_key text not null check (target_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  primary key (user_id, target_key)
);

create index institution_comparisons_user_created_idx on public.institution_comparisons (user_id, created_at desc);
alter table public.institution_comparisons enable row level security;
create policy "users read own institution comparisons" on public.institution_comparisons for select to authenticated
using (user_id = (select auth.uid()));
create policy "users create own institution comparisons" on public.institution_comparisons for insert to authenticated
with check (
  user_id = (select auth.uid())
);
create policy "users delete own institution comparisons" on public.institution_comparisons for delete to authenticated
using (user_id = (select auth.uid()));
grant select, insert, delete on public.institution_comparisons to authenticated;

create or replace function private.enforce_institution_comparison()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.institutions institution
    where institution.public_slug = new.target_key
      and institution.is_public
      and not institution.is_synthetic
  ) then
    raise exception 'public canonical institution required';
  end if;
  if not exists (
    select 1 from public.institution_comparisons existing
    where existing.user_id = new.user_id and existing.target_key = new.target_key
  ) and (
    select count(*) from public.institution_comparisons existing where existing.user_id = new.user_id
  ) >= 3 then
    raise exception 'comparison limit exceeded';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_institution_comparison() from public, anon, authenticated;
create trigger enforce_institution_comparison
  before insert on public.institution_comparisons
  for each row execute function private.enforce_institution_comparison();

-- 작성자 내리기는 후기를 삭제하지 않고 공개 노출만 중단한다. 열람자 숨김은 해당 계정의 개인 설정이다.
alter table public.institution_reviews add column if not exists author_hidden_at timestamptz;
create table public.user_hidden_institution_reviews (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  review_id uuid not null references public.institution_reviews(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, review_id)
);
create index user_hidden_institution_reviews_user_idx on public.user_hidden_institution_reviews (user_id, created_at desc);
alter table public.user_hidden_institution_reviews enable row level security;
create policy "users read own hidden institution reviews" on public.user_hidden_institution_reviews for select to authenticated
using (user_id = (select auth.uid()));
create policy "users create own hidden institution reviews" on public.user_hidden_institution_reviews for insert to authenticated
with check (user_id = (select auth.uid()));
grant select, insert on public.user_hidden_institution_reviews to authenticated;

create or replace function public.hide_own_institution_review(target_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_row public.institution_reviews%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into review_row from public.institution_reviews
  where id = target_review_id and author_user_id = auth.uid() for update;
  if not found then raise exception 'own review not found'; end if;
  if review_row.author_hidden_at is null then
    update public.institution_reviews set author_hidden_at = now() where id = review_row.id;
    insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'institution_review.author_hidden', 'institution_review', review_row.id, '{}'::jsonb);
  end if;
  return jsonb_build_object('id', review_row.id, 'authorHiddenAt', now());
end;
$$;

revoke all on function public.hide_own_institution_review(uuid) from public, anon;
grant execute on function public.hide_own_institution_review(uuid) to authenticated;

-- 공개 열람·집계는 작성자가 내린 후기를 제외한다. 운영자 심사 select 정책은 별도로 유지한다.
drop policy "entitled users read approved institution reviews" on public.institution_reviews;
create policy "entitled users read approved institution reviews" on public.institution_reviews for select to authenticated
using (
  status = 'APPROVED' and author_hidden_at is null and institution_target_key is not null
  and exists (
    select 1 from public.access_entitlements entitlement
    join public.verification_requests request on request.id = entitlement.source_verification_request_id
    where entitlement.user_id = (select auth.uid()) and entitlement.revoked_at is null and entitlement.ends_at > now()
      and request.status = 'APPROVED' and request.target_key = institution_reviews.institution_target_key
      and request.requested_role = institution_reviews.relation
      and entitlement.scope = case institution_reviews.relation
        when 'PARENT' then 'PARENT_REVIEWS'::public.entitlement_scope
        when 'STUDENT' then 'STUDENT_REVIEWS'::public.entitlement_scope
        when 'TEACHER' then 'TEACHER_REVIEWS'::public.entitlement_scope
      end
  )
);

create or replace function public.get_institution_review_summary(review_target_key text)
returns table (relation public.edutalk_role, review_count bigint, overall_average numeric, items jsonb, is_public boolean)
language sql stable security definer set search_path = ''
as $$
  with roles(relation) as (values ('PARENT'::public.edutalk_role), ('STUDENT'::public.edutalk_role), ('TEACHER'::public.edutalk_role)),
  approved as (
    select review.relation, review.scores from public.institution_reviews review
    where review.institution_target_key = review_target_key and review.status = 'APPROVED' and review.author_hidden_at is null
      and review.relation in ('PARENT', 'STUDENT', 'TEACHER') and review_target_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ), counts as (select relation, count(*) as review_count from approved group by relation),
  score_averages as (
    select approved.relation, score.key, avg((score.value #>> '{}')::numeric) as average from approved
    cross join lateral jsonb_each(approved.scores) score where jsonb_typeof(score.value) = 'number' group by approved.relation, score.key
  ), item_groups as (
    select relation, jsonb_object_agg(key, round(average, 2)) as items, avg(average) as overall_average from score_averages group by relation
  )
  select roles.relation, coalesce(counts.review_count, 0),
    case when roles.relation = 'TEACHER' and coalesce(counts.review_count, 0) < 3 then null else round(item_groups.overall_average, 2) end,
    case when roles.relation = 'TEACHER' and coalesce(counts.review_count, 0) < 3 then '{}'::jsonb else coalesce(item_groups.items, '{}'::jsonb) end,
    not (roles.relation = 'TEACHER' and coalesce(counts.review_count, 0) < 3)
  from roles left join counts on counts.relation = roles.relation left join item_groups on item_groups.relation = roles.relation;
$$;

drop function if exists public.get_public_institution_replies(text);
create function public.get_public_institution_replies(target_slug text)
returns table (body text, published_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select reply.body, reply.published_at from public.institution_replies reply
  join public.institutions institution on institution.id = reply.institution_id
  join public.institution_reviews review on review.id = reply.review_id and review.status = 'APPROVED' and review.author_hidden_at is null
  where institution.public_slug = target_slug and institution.is_public and not institution.is_synthetic and reply.is_published
  order by reply.published_at desc;
$$;

-- 운영자 정정·신고 처리: 사용자 요청의 상태와 처리 메모를 남기며, 원문·개인정보는 알림에 포함하지 않는다.
alter table public.content_reports
  add column if not exists reviewer_note text,
  add column if not exists reviewed_by uuid references public.profiles(user_id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create policy "data operators read corrections" on public.institution_corrections for select to authenticated
using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));
create policy "content operators read reports" on public.content_reports for select to authenticated
using (private.is_edutalk_operator(array['CONTENT_MODERATOR', 'ADMIN']::public.operator_role[]));
create policy "data operators update corrections" on public.institution_corrections for update to authenticated
using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]))
with check (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));
create policy "content operators update reports" on public.content_reports for update to authenticated
using (private.is_edutalk_operator(array['CONTENT_MODERATOR', 'ADMIN']::public.operator_role[]))
with check (private.is_edutalk_operator(array['CONTENT_MODERATOR', 'ADMIN']::public.operator_role[]));

create or replace function public.moderate_institution_correction(
  target_correction_id uuid,
  target_status public.correction_request_status,
  review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  correction_row public.institution_corrections%rowtype;
begin
  if not private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]) then
    raise exception 'operator role required';
  end if;
  if char_length(coalesce(review_note, '')) > 1000 then raise exception 'invalid correction note'; end if;
  select * into correction_row from public.institution_corrections where id = target_correction_id for update;
  if not found then raise exception 'correction not found'; end if;
  update public.institution_corrections
  set status = target_status, reviewer_note = nullif(trim(review_note), ''), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = correction_row.id;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'institution_correction.' || lower(target_status::text), 'institution_correction', correction_row.id, jsonb_build_object('note', nullif(trim(review_note), '')));
  return jsonb_build_object('id', correction_row.id, 'status', target_status);
end;
$$;

create or replace function public.moderate_content_report(
  target_report_id uuid,
  target_status public.content_report_status,
  review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_row public.content_reports%rowtype;
begin
  if not private.is_edutalk_operator(array['CONTENT_MODERATOR', 'ADMIN']::public.operator_role[]) then
    raise exception 'operator role required';
  end if;
  if char_length(coalesce(review_note, '')) > 1000 then raise exception 'invalid report note'; end if;
  select * into report_row from public.content_reports where id = target_report_id for update;
  if not found then raise exception 'report not found'; end if;

  if report_row.target_type = 'institution_review' and report_row.target_id is not null then
    if target_status = 'TEMPORARILY_HIDDEN' then
      update public.institution_reviews
      set status = 'TEMPORARILY_HIDDEN'
      where id = report_row.target_id
        and institution_target_key = report_row.target_key
        and status = 'APPROVED';
    elsif target_status in ('RESTORED', 'REJECTED') then
      update public.institution_reviews
      set status = 'APPROVED'
      where id = report_row.target_id
        and institution_target_key = report_row.target_key
        and status = 'TEMPORARILY_HIDDEN';
    elsif target_status = 'UPHELD' then
      update public.institution_reviews
      set status = 'REJECTED'
      where id = report_row.target_id
        and institution_target_key = report_row.target_key
        and status in ('APPROVED', 'TEMPORARILY_HIDDEN');
    end if;
  end if;

  update public.content_reports
  set status = target_status, reviewer_note = nullif(trim(review_note), ''), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = report_row.id;
  insert into public.moderation_actions (report_id, target_type, target_id, action, actor_user_id, reason)
  values (report_row.id, report_row.target_type, report_row.target_id, target_status, auth.uid(), coalesce(nullif(trim(review_note), ''), '운영자 상태 처리'));
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'content_report.' || lower(target_status::text), 'content_report', report_row.id, jsonb_build_object('note', nullif(trim(review_note), '')));
  return jsonb_build_object('id', report_row.id, 'status', target_status);
end;
$$;

create or replace function private.notify_correction_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (new.requester_user_id, '기관 정보 정정 요청 상태가 변경됐어요', '정정 요청의 처리 상태와 운영자 메모를 확인해 주세요.', 'INSTITUTION', '/trust-center');
  end if;
  return new;
end;
$$;

create or replace function private.notify_content_report_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.notifications (user_id, title, body, kind, link_path)
    values (new.reporter_user_id, '콘텐츠 신고 처리 상태가 변경됐어요', '신고 처리 상태와 운영자 메모를 확인해 주세요.', 'INSTITUTION', '/trust-center');
  end if;
  return new;
end;
$$;

revoke all on function public.moderate_institution_correction(uuid, public.correction_request_status, text) from public, anon;
revoke all on function public.moderate_content_report(uuid, public.content_report_status, text) from public, anon;
revoke all on function private.notify_correction_status() from public, anon, authenticated;
revoke all on function private.notify_content_report_status() from public, anon, authenticated;
grant execute on function public.moderate_institution_correction(uuid, public.correction_request_status, text) to authenticated;
grant execute on function public.moderate_content_report(uuid, public.content_report_status, text) to authenticated;

create trigger notify_correction_status after update of status on public.institution_corrections
  for each row execute function private.notify_correction_status();
create trigger notify_content_report_status after update of status on public.content_reports
  for each row execute function private.notify_content_report_status();

-- 기관 관계자는 canonical 기관 단위로 승인한다. ADMIN 또는 기관지원 담당자만 멤버십을 승인·해제한다.
create table public.institution_support_users (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  assigned_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.institution_support_users enable row level security;
create policy "institution support users read own assignment" on public.institution_support_users for select to authenticated
using (user_id = (select auth.uid()));
create policy "admins manage institution support users" on public.institution_support_users for all to authenticated
using (private.is_edutalk_operator(array['ADMIN']::public.operator_role[]))
with check (private.is_edutalk_operator(array['ADMIN']::public.operator_role[]));
grant select, insert, update, delete on public.institution_support_users to authenticated;

create or replace function private.is_institution_support()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    private.is_edutalk_operator(array['ADMIN']::public.operator_role[])
    or exists (select 1 from public.institution_support_users support where support.user_id = auth.uid())
  );
$$;
revoke all on function private.is_institution_support() from public, anon, authenticated;
grant execute on function private.is_institution_support() to authenticated;

create table public.institution_members (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(user_id) on delete set null,
  unique (institution_id, user_id)
);

create index institution_members_user_status_idx on public.institution_members (user_id, status);
alter table public.institution_members enable row level security;
create policy "members read own institution membership" on public.institution_members for select to authenticated
using (user_id = (select auth.uid()));
create policy "institution support manages memberships" on public.institution_members for all to authenticated
using (private.is_institution_support())
with check (private.is_institution_support());
grant select on public.institution_members to authenticated;
grant insert, update, delete on public.institution_members to authenticated;

create or replace function public.get_institution_membership_status(target_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select member.status
  from public.institution_members member
  join public.institutions institution on institution.id = member.institution_id
  where member.user_id = auth.uid() and institution.public_slug = target_slug
  limit 1;
$$;

create or replace function public.request_institution_membership(target_slug text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_institution uuid;
  member_status text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select id into target_institution from public.institutions
  where public_slug = target_slug and is_public and not is_synthetic;
  if not found then raise exception 'public institution not found'; end if;
  select status into member_status from public.institution_members
  where institution_id = target_institution and user_id = auth.uid();
  if found then return member_status; end if;
  insert into public.institution_members (institution_id, user_id)
  values (target_institution, auth.uid());
  return 'PENDING';
end;
$$;

create or replace function public.review_institution_member(
  target_member_id uuid,
  target_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_institution_support() then
    raise exception 'institution support role required';
  end if;
  if target_status not in ('APPROVED', 'REJECTED') then raise exception 'invalid member status'; end if;
  update public.institution_members
  set status = target_status,
      approved_at = case when target_status = 'APPROVED' then now() else null end,
      approved_by = auth.uid()
  where id = target_member_id;
  if not found then raise exception 'institution member not found'; end if;
  return jsonb_build_object('id', target_member_id, 'status', target_status);
end;
$$;

create or replace function public.get_institution_manager_queue()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  memberships jsonb;
  corrections jsonb;
  reviews jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('institutionId', institution.id, 'institutionName', institution.name)), '[]'::jsonb)
    into memberships
  from public.institution_members member
  join public.institutions institution on institution.id = member.institution_id
  where member.user_id = auth.uid() and member.status = 'APPROVED';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', correction.id, 'institutionName', institution.name, 'issue', correction.issue,
    'currentSummary', correction.current_summary, 'requestedSummary', correction.requested_summary,
    'status', correction.status, 'createdAt', correction.created_at
  ) order by correction.created_at desc), '[]'::jsonb)
    into corrections
  from public.institution_corrections correction
  join public.institutions institution on institution.public_slug = correction.target_key
  join public.institution_members member on member.institution_id = institution.id
  where member.user_id = auth.uid() and member.status = 'APPROVED';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', review.id, 'institutionName', institution.name, 'relation', review.relation,
    'strength', review.strength, 'improvement', review.improvement,
    'recommendTo', review.recommend_to, 'createdAt', review.created_at
  ) order by review.created_at desc), '[]'::jsonb)
    into reviews
  from public.institution_reviews review
  join public.institutions institution on institution.public_slug = review.institution_target_key
  join public.institution_members member on member.institution_id = institution.id
  where member.user_id = auth.uid()
    and member.status = 'APPROVED'
    and review.status = 'APPROVED'
    and review.author_hidden_at is null;

  return jsonb_build_object('memberships', memberships, 'corrections', corrections, 'reviews', reviews);
end;
$$;

create or replace function public.submit_institution_review_reply(
  target_review_id uuid,
  reply_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_row public.institution_reviews%rowtype;
  institution_row public.institutions%rowtype;
  reply_id uuid;
begin
  if auth.uid() is null or char_length(trim(coalesce(reply_body, ''))) not between 1 and 3000 then
    raise exception 'invalid reply input';
  end if;
  select * into review_row from public.institution_reviews
  where id = target_review_id and status = 'APPROVED' and author_hidden_at is null;
  if not found then raise exception 'approved review not found'; end if;
  select * into institution_row from public.institutions where public_slug = review_row.institution_target_key;
  if not found or not exists (
    select 1 from public.institution_members member
    where member.institution_id = institution_row.id and member.user_id = auth.uid() and member.status = 'APPROVED'
  ) then raise exception 'approved institution member required'; end if;
  update public.institution_replies
  set body = trim(reply_body), author_user_id = auth.uid(), is_published = true, published_at = now()
  where review_id = review_row.id
  returning id into reply_id;
  if not found then
    insert into public.institution_replies (institution_id, review_id, author_user_id, body, is_published, published_at)
    values (institution_row.id, review_row.id, auth.uid(), trim(reply_body), true, now())
    returning id into reply_id;
  end if;
  return jsonb_build_object('id', reply_id, 'reviewId', review_row.id, 'published', true);
end;
$$;

create unique index institution_replies_one_per_review_idx
  on public.institution_replies (review_id)
  where review_id is not null;

revoke all on function public.review_institution_member(uuid, text) from public, anon;
revoke all on function public.get_institution_membership_status(text) from public, anon;
revoke all on function public.request_institution_membership(text) from public, anon;
revoke all on function public.get_institution_manager_queue() from public, anon;
revoke all on function public.submit_institution_review_reply(uuid, text) from public, anon;
grant execute on function public.review_institution_member(uuid, text) to authenticated;
grant execute on function public.get_institution_membership_status(text) to authenticated;
grant execute on function public.request_institution_membership(text) to authenticated;
grant execute on function public.get_institution_manager_queue() to authenticated;
grant execute on function public.submit_institution_review_reply(uuid, text) to authenticated;
-- 기관 공식 답변 수정 이력의 최종 공개 계약. 작성자 UUID와 작성자 정보는 반환하지 않는다.
drop function if exists public.get_public_institution_replies(text);
create function public.get_public_institution_replies(target_slug text)
returns table (
  body text,
  published_at timestamptz,
  revision_count bigint,
  last_revised_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select reply.body, reply.published_at,
    count(revision.id) as revision_count,
    max(revision.revised_at) as last_revised_at
  from public.institution_replies reply
  join public.institutions institution on institution.id = reply.institution_id
  join public.institution_reviews review on review.id = reply.review_id
    and review.status = 'APPROVED'
    and review.author_hidden_at is null
  left join public.institution_reply_revisions revision on revision.institution_reply_id = reply.id
  where institution.public_slug = target_slug
    and institution.is_public and not institution.is_synthetic
    and reply.is_published
  group by reply.id, reply.body, reply.published_at
  order by reply.published_at desc;
$$;
revoke all on function public.get_public_institution_replies(text) from public;
grant execute on function public.get_public_institution_replies(text) to anon, authenticated;

-- 공공데이터 CLI 적재 결과 관찰·품질 처리. 브라우저에서 동기화를 실행하지 않는다.
alter table public.data_quality_issues
  add column if not exists processing_note text,
  add column if not exists reviewed_by uuid references public.profiles(user_id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create policy "data operators read sync runs" on public.data_sync_runs for select to authenticated
using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));

create policy "data operators read quality issues" on public.data_quality_issues for select to authenticated
using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));

create policy "data operators update quality issues" on public.data_quality_issues for update to authenticated
using (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]))
with check (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));

-- 보호자 자녀 프로필: 별칭·학년만 본인 소유 행에 보관한다.
grant select, insert, update, delete on public.child_profiles to authenticated;

-- 공개 연락처·홈페이지·좌표는 기관 공개 정보로만 보관한다. 위치는 탐색 거리 계산에만 사용한다.
alter table public.institutions
  add column if not exists phone text check (phone is null or phone ~ '^[0-9() +.-]{6,30}$'),
  add column if not exists homepage_url text check (homepage_url is null or homepage_url ~ '^https://');

-- 공개 랭킹은 광고·유료 노출을 사용하지 않고 canonical 공개 기관의 APPROVED 후기만 역할별로 계산한다.
-- 최근 후기는 최대 35%의 최근성 가중을 받고, 역할별 전체 평균과 가상 3건을 섞어 소표본 과대평가를 줄인다.
drop function if exists public.get_public_ranking_summaries();
create or replace function public.get_public_ranking_summaries()
returns table (
  institution_id uuid,
  public_slug text,
  institution_name text,
  institution_type public.canonical_institution_type,
  institution_zone public.institution_zone,
  relation public.edutalk_role,
  review_count bigint,
  score numeric,
  items jsonb,
  formula_description text,
  reference_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  with approved as (
    select review.id as review_id, institution.id as canonical_institution_id, institution.public_slug, institution.name, institution.institution_type, institution.zone,
      review.relation, review.scores, review.created_at,
      0.65 + 0.35 * exp(-greatest(0, current_date - review.created_at::date)::numeric / 180.0) as recency_weight
    from public.institution_reviews review
    join public.institutions institution on institution.public_slug = review.institution_target_key
    where review.status = 'APPROVED'
      and review.author_hidden_at is null
      and institution.is_public and not institution.is_synthetic
      and review.relation in ('PARENT', 'STUDENT', 'TEACHER')
  ), review_scores as (
    select approved.*, avg((entry.value #>> '{}')::numeric) as review_score
    from approved
    cross join lateral jsonb_each(approved.scores) entry
    where jsonb_typeof(entry.value) = 'number'
    group by approved.review_id, approved.canonical_institution_id, approved.public_slug, approved.name, approved.institution_type, approved.zone,
      approved.relation, approved.scores, approved.created_at, approved.recency_weight
  ), role_prior as (
    select relation, sum(review_score * recency_weight) / nullif(sum(recency_weight), 0) as prior_score
    from review_scores
    group by relation
  ), item_scores as (
    select approved.canonical_institution_id, approved.relation, entry.key,
      sum((entry.value #>> '{}')::numeric * approved.recency_weight) / nullif(sum(approved.recency_weight), 0) as item_score
    from approved
    cross join lateral jsonb_each(approved.scores) entry
    where jsonb_typeof(entry.value) = 'number'
    group by approved.canonical_institution_id, approved.relation, entry.key
  ), grouped as (
    select review_scores.canonical_institution_id, review_scores.public_slug, review_scores.name as institution_name,
      review_scores.institution_type, review_scores.zone as institution_zone, review_scores.relation,
      count(*) as review_count,
      (sum(review_scores.review_score * review_scores.recency_weight) + 3 * max(role_prior.prior_score))
        / nullif(sum(review_scores.recency_weight) + 3, 0) as score
    from review_scores
    join role_prior on role_prior.relation = review_scores.relation
    group by review_scores.canonical_institution_id, review_scores.public_slug, review_scores.name,
      review_scores.institution_type, review_scores.zone, review_scores.relation
  )
  select grouped.canonical_institution_id, grouped.public_slug, grouped.institution_name, grouped.institution_type, grouped.institution_zone,
    grouped.relation, grouped.review_count, round(grouped.score, 2),
    coalesce((select jsonb_object_agg(item_scores.key, round(item_scores.item_score, 2)) from item_scores
      where item_scores.canonical_institution_id = grouped.canonical_institution_id and item_scores.relation = grouped.relation), '{}'::jsonb),
    '승인 후기만 사용 · 최근 후기에 최대 35% 가중 · 역할별 평균과 가상 3건 보정'::text,
    current_date
  from grouped
  where grouped.relation <> 'TEACHER' or grouped.review_count >= 3
  order by grouped.score desc, grouped.review_count desc, grouped.institution_name;
$$;

revoke all on function public.get_public_ranking_summaries() from public;
grant execute on function public.get_public_ranking_summaries() to anon, authenticated;

-- 동일 기관의 교육자 후기·관계 인증 이력과 기관 관계자 권한은 자동 병합하지 않는다.
-- 충돌 대상의 작성자 식별자·증빙은 기관 및 공개 응답에서 제외하고 운영자 검토에만 사용한다.
alter table public.institution_members
  drop constraint if exists institution_members_status_check,
  add constraint institution_members_status_check check (status in ('PENDING', 'CONFLICT_REVIEW', 'APPROVED', 'REJECTED')),
  add column if not exists conflict_detected boolean not null default false,
  add column if not exists conflict_reviewed_at timestamptz,
  add column if not exists conflict_reviewed_by uuid references public.profiles(user_id) on delete set null;

create or replace function private.has_institution_member_conflict(target_institution_id uuid, target_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.institutions institution
    where institution.id = target_institution_id and (
      exists (select 1 from public.institution_reviews review where review.author_user_id = target_user_id and review.relation = 'TEACHER' and review.institution_target_key = institution.public_slug)
      or exists (select 1 from public.verification_requests request where request.requester_user_id = target_user_id and request.kind = 'INSTITUTION_RELATION' and request.requested_role = 'TEACHER' and request.target_key = institution.public_slug)
    )
  );
$$;
revoke all on function private.has_institution_member_conflict(uuid, uuid) from public, anon, authenticated;

create or replace function public.request_institution_membership(target_slug text)
returns text language plpgsql security definer set search_path = '' as $$
declare target_institution uuid; member_status text; has_conflict boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select id into target_institution from public.institutions where public_slug = target_slug and is_public and not is_synthetic;
  if not found then raise exception 'public institution not found'; end if;
  select status into member_status from public.institution_members where institution_id = target_institution and user_id = auth.uid();
  if found then return member_status; end if;
  select private.has_institution_member_conflict(target_institution, auth.uid()) into has_conflict;
  insert into public.institution_members (institution_id, user_id, status, conflict_detected)
  values (target_institution, auth.uid(), case when has_conflict then 'CONFLICT_REVIEW' else 'PENDING' end, has_conflict);
  return case when has_conflict then 'CONFLICT_REVIEW' else 'PENDING' end;
end;
$$;

create or replace function public.review_institution_member(target_member_id uuid, target_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare member_row public.institution_members%rowtype; still_conflicted boolean;
begin
  if not private.is_institution_support() then raise exception 'institution support role required'; end if;
  if target_status not in ('APPROVED', 'REJECTED') then raise exception 'invalid member status'; end if;
  select * into member_row from public.institution_members where id = target_member_id for update;
  if not found then raise exception 'institution member not found'; end if;
  select private.has_institution_member_conflict(member_row.institution_id, member_row.user_id) into still_conflicted;
  update public.institution_members set status = target_status, conflict_detected = still_conflicted,
    conflict_reviewed_at = case when member_row.status = 'CONFLICT_REVIEW' then now() else conflict_reviewed_at end,
    conflict_reviewed_by = case when member_row.status = 'CONFLICT_REVIEW' then auth.uid() else conflict_reviewed_by end,
    approved_at = case when target_status = 'APPROVED' then now() else null end, approved_by = auth.uid()
  where id = target_member_id;
  return jsonb_build_object('id', target_member_id, 'status', target_status, 'conflictReviewed', member_row.status = 'CONFLICT_REVIEW');
end;
$$;

create or replace function private.guard_institution_member_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'APPROVED' and private.has_institution_member_conflict(new.institution_id, new.user_id) and old.status <> 'CONFLICT_REVIEW' then
    new.status := 'CONFLICT_REVIEW'; new.conflict_detected := true; new.approved_at := null; new.approved_by := null;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_institution_member_approval() from public, anon, authenticated;
create trigger guard_institution_member_approval before update of status on public.institution_members
  for each row execute function private.guard_institution_member_approval();

-- 관계자 승인 뒤 교사 후기 또는 교사 관계 인증이 생성되어도, 관계자 권한을 자동 유지하지 않는다.
create or replace function private.flag_member_conflict_from_teacher_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.relation = 'TEACHER' then
    update public.institution_members member
    set status = 'CONFLICT_REVIEW',
        conflict_detected = true,
        approved_at = null,
        approved_by = null
    from public.institutions institution
    where member.user_id = new.author_user_id
      and member.institution_id = institution.id
      and institution.public_slug = new.institution_target_key
      and member.status in ('PENDING', 'APPROVED');
  end if;
  return new;
end;
$$;
revoke all on function private.flag_member_conflict_from_teacher_review() from public, anon, authenticated;

create trigger flag_member_conflict_from_teacher_review
  after insert or update of relation, author_user_id, institution_target_key on public.institution_reviews
  for each row execute function private.flag_member_conflict_from_teacher_review();

create or replace function private.flag_member_conflict_from_teacher_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'INSTITUTION_RELATION' and new.requested_role = 'TEACHER' then
    update public.institution_members member
    set status = 'CONFLICT_REVIEW',
        conflict_detected = true,
        approved_at = null,
        approved_by = null
    from public.institutions institution
    where member.user_id = new.requester_user_id
      and member.institution_id = institution.id
      and institution.public_slug = new.target_key
      and member.status in ('PENDING', 'APPROVED');
  end if;
  return new;
end;
$$;
revoke all on function private.flag_member_conflict_from_teacher_verification() from public, anon, authenticated;

create trigger flag_member_conflict_from_teacher_verification
  after insert or update of kind, requested_role, requester_user_id, target_key on public.verification_requests
  for each row execute function private.flag_member_conflict_from_teacher_verification();

-- 후기 원문은 수정하지 않고, 작성자의 후속 설명은 별도 심사를 거쳐 공개한다.
create table public.institution_review_addenda (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.institution_reviews(id) on delete cascade,
  author_user_id uuid not null references public.profiles(user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  status public.institution_review_status not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 1000),
  moderated_at timestamptz,
  moderated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index institution_review_addenda_review_status_idx on public.institution_review_addenda (review_id, status, created_at);
alter table public.institution_review_addenda enable row level security;
create policy "authors read own institution review addenda" on public.institution_review_addenda for select to authenticated
using (author_user_id = (select auth.uid()));
create policy "review operators read institution review addenda" on public.institution_review_addenda for select to authenticated
using (private.is_edutalk_operator(array['CONTENT_MODERATOR', 'ADMIN']::public.operator_role[]));
create policy "entitled users read approved institution review addenda" on public.institution_review_addenda for select to authenticated
using (status = 'APPROVED' and exists (
  select 1 from public.institution_reviews review
  join public.access_entitlements entitlement on entitlement.user_id = (select auth.uid()) and entitlement.revoked_at is null and entitlement.ends_at > now()
  join public.verification_requests request on request.id = entitlement.source_verification_request_id and request.status = 'APPROVED'
  where review.id = institution_review_addenda.review_id
    and review.status = 'APPROVED' and review.author_hidden_at is null
    and request.target_key = review.institution_target_key and request.requested_role = review.relation
    and entitlement.scope = case review.relation
      when 'PARENT' then 'PARENT_REVIEWS'::public.entitlement_scope
      when 'STUDENT' then 'STUDENT_REVIEWS'::public.entitlement_scope
      when 'TEACHER' then 'TEACHER_REVIEWS'::public.entitlement_scope
    end
));
grant select on public.institution_review_addenda to authenticated;

create or replace function public.submit_institution_review_addendum(target_review_id uuid, addendum_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare review_row public.institution_reviews%rowtype; created_addendum public.institution_review_addenda%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if char_length(trim(coalesce(addendum_body, ''))) not between 1 and 1000 then raise exception 'invalid addendum body'; end if;
  select * into review_row from public.institution_reviews where id = target_review_id and author_user_id = auth.uid() for update;
  if not found then raise exception 'review not found'; end if;
  if review_row.status not in ('APPROVED', 'TEMPORARILY_HIDDEN') then raise exception 'addendum unavailable for current review status'; end if;
  insert into public.institution_review_addenda (review_id, author_user_id, body)
  values (review_row.id, auth.uid(), trim(addendum_body)) returning * into created_addendum;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'institution_review_addendum.submitted', 'institution_review_addendum', created_addendum.id, jsonb_build_object('reviewId', review_row.id));
  return jsonb_build_object('id', created_addendum.id, 'reviewId', review_row.id, 'status', created_addendum.status, 'createdAt', created_addendum.created_at);
end;
$$;
revoke all on function public.submit_institution_review_addendum(uuid, text) from public, anon;
grant execute on function public.submit_institution_review_addendum(uuid, text) to authenticated;

create or replace function public.moderate_institution_review_addendum(target_addendum_id uuid, target_status text, review_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare addendum_row public.institution_review_addenda%rowtype;
begin
  if not private.is_edutalk_operator(array['CONTENT_MODERATOR', 'ADMIN']::public.operator_role[]) then raise exception 'operator role required'; end if;
  if target_status not in ('PENDING', 'APPROVED', 'REJECTED') or char_length(coalesce(review_note, '')) > 1000 then raise exception 'invalid addendum moderation input'; end if;
  select * into addendum_row from public.institution_review_addenda where id = target_addendum_id for update;
  if not found then raise exception 'addendum not found'; end if;
  update public.institution_review_addenda set status = target_status, moderation_note = nullif(trim(review_note), ''), moderated_at = now(), moderated_by = auth.uid() where id = addendum_row.id;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'institution_review_addendum.' || lower(target_status), 'institution_review_addendum', addendum_row.id, jsonb_build_object('note', nullif(trim(review_note), '')));
  return jsonb_build_object('id', addendum_row.id, 'status', target_status);
end;
$$;
revoke all on function public.moderate_institution_review_addendum(uuid, text, text) from public, anon;
grant execute on function public.moderate_institution_review_addendum(uuid, text, text) to authenticated;

-- 동탄 생활권과 기준 출발지 이동 참고는 출처·확인일을 가진 공개 승인값만 canonical 상세에 노출한다.
-- 실제 거리·이동 수치는 이 테이블에 적재하지 않으며, 출처가 없으면 앱에서 기관 확인 필요로 표시한다.
create table if not exists public.institution_local_contexts (
  institution_id uuid primary key references public.institutions(id) on delete cascade,
  living_area text not null check (char_length(living_area) between 1 and 120),
  legal_dong text check (legal_dong is null or char_length(legal_dong) between 1 and 120),
  administrative_dong text check (administrative_dong is null or char_length(administrative_dong) between 1 and 120),
  residential_area text check (residential_area is null or char_length(residential_area) between 1 and 160),
  source text not null check (char_length(source) between 1 and 160),
  checked_at date not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.institution_travel_references (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  origin_type text not null check (origin_type in ('SCHOOL', 'KINDERGARTEN', 'RESIDENTIAL_COMPLEX')),
  origin_label text not null check (char_length(origin_label) between 1 and 160),
  distance_meters integer check (distance_meters is null or distance_meters > 0),
  travel_minutes integer check (travel_minutes is null or travel_minutes > 0),
  distance_note text check (distance_note is null or char_length(distance_note) between 1 and 300),
  travel_note text check (travel_note is null or char_length(travel_note) between 1 and 300),
  source text not null check (char_length(source) between 1 and 160),
  checked_at date not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists institution_local_contexts_public_idx on public.institution_local_contexts(institution_id, checked_at desc) where is_public;
create index if not exists institution_travel_references_public_idx on public.institution_travel_references(institution_id, checked_at desc) where is_public;
alter table public.institution_local_contexts enable row level security;
alter table public.institution_travel_references enable row level security;
create policy "public reads approved institution local contexts" on public.institution_local_contexts for select to anon, authenticated using (
  is_public and exists (select 1 from public.institutions institution where institution.id = institution_local_contexts.institution_id and institution.is_public and not institution.is_synthetic)
);
create policy "public reads approved institution travel references" on public.institution_travel_references for select to anon, authenticated using (
  is_public and exists (select 1 from public.institutions institution where institution.id = institution_travel_references.institution_id and institution.is_public and not institution.is_synthetic)
);
create policy "data operators manage institution local contexts" on public.institution_local_contexts for all to authenticated using (
  private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[])
) with check (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));
create policy "data operators manage institution travel references" on public.institution_travel_references for all to authenticated using (
  private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[])
) with check (private.is_edutalk_operator(array['DATA_OPERATOR', 'ADMIN']::public.operator_role[]));
grant select on public.institution_local_contexts, public.institution_travel_references to anon, authenticated;
grant insert, update, delete on public.institution_local_contexts, public.institution_travel_references to authenticated;

-- 인증 튜터가 발급한 1회용 수업 확인 코드만 튜터 후기 접수에 사용할 수 있다.
-- 코드 원문은 저장하지 않고 SHA-256 digest만 7일 동안 보관하며, 사용 즉시 재사용을 막는다.
create table public.tutor_lesson_invites (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles(id) on delete cascade,
  code_digest text not null unique check (code_digest ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

alter table public.tutor_reviews
  add column if not exists lesson_invite_id uuid references public.tutor_lesson_invites(id) on delete set null,
  add column if not exists lesson_verified_at timestamptz;

create unique index tutor_reviews_one_lesson_invite_idx on public.tutor_reviews(lesson_invite_id) where lesson_invite_id is not null;
create index tutor_lesson_invites_tutor_expiry_idx on public.tutor_lesson_invites(tutor_id, expires_at desc);
alter table public.tutor_lesson_invites enable row level security;
create policy "tutors read own lesson invite status" on public.tutor_lesson_invites for select to authenticated using (
  exists (select 1 from public.tutor_profiles profile where profile.id = tutor_lesson_invites.tutor_id and profile.user_id = (select auth.uid()))
);
grant select on public.tutor_lesson_invites to authenticated;

create or replace function public.create_tutor_lesson_invite(invitation_digest text, invitation_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_tutor_id uuid;
begin
  if auth.uid() is null
    or invitation_digest !~ '^[a-f0-9]{64}$'
    or invitation_expires_at <= now()
    or invitation_expires_at > now() + interval '7 days 1 minute' then
    raise exception 'invalid lesson invite';
  end if;
  select profile.id into target_tutor_id
  from public.tutor_profiles profile
  where profile.user_id = auth.uid()
    and profile.verified
    and profile.identity_verified
    and profile.verification_level = 'CREDENTIALS';
  if not found then raise exception 'verified tutor required'; end if;

  insert into public.tutor_lesson_invites(tutor_id, code_digest, expires_at)
  values (target_tutor_id, invitation_digest, invitation_expires_at);
end;
$$;

create or replace function public.submit_tutor_lesson_review(target_tutor_id uuid, invitation_digest text, review_rating numeric, review_content text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare invite public.tutor_lesson_invites%rowtype; review_id uuid;
begin
  if auth.uid() is null
    or invitation_digest !~ '^[a-f0-9]{64}$'
    or review_rating < 1 or review_rating > 5 or mod(review_rating * 2, 1) <> 0
    or char_length(trim(coalesce(review_content, ''))) not between 10 and 3000 then
    raise exception 'invalid lesson review';
  end if;

  select * into invite from public.tutor_lesson_invites
  where code_digest = invitation_digest
    and tutor_id = target_tutor_id
    and used_at is null
    and expires_at > now()
  for update;
  if not found then raise exception 'invalid or expired lesson invite'; end if;

  if exists (select 1 from public.tutor_profiles profile where profile.id = target_tutor_id and profile.user_id = auth.uid()) then
    raise exception 'tutor cannot review self';
  end if;

  insert into public.tutor_reviews(tutor_id, author_user_id, rating, content, verified_lesson, moderation_status, lesson_invite_id, lesson_verified_at)
  values (target_tutor_id, auth.uid(), review_rating, trim(review_content), false, 'PENDING', invite.id, now())
  returning id into review_id;

  update public.tutor_lesson_invites set used_at = now(), used_by = auth.uid() where id = invite.id;
  return jsonb_build_object('id', review_id, 'lessonVerified', true);
end;
$$;

revoke all on function public.create_tutor_lesson_invite(text, timestamptz) from public, anon;
revoke all on function public.submit_tutor_lesson_review(uuid, text, numeric, text) from public, anon;
grant execute on function public.create_tutor_lesson_invite(text, timestamptz) to authenticated;
grant execute on function public.submit_tutor_lesson_review(uuid, text, numeric, text) to authenticated;

-- canonical 기관 검색은 이름순·최근 확인일순만 저장하며, 체험 전용 차량·체험수업 조건은 false로 보관한다.
alter table public.saved_searches drop constraint if exists saved_searches_sort_check;
alter table public.saved_searches add constraint saved_searches_sort_check
  check (sort in ('RECOMMENDED', 'DISTANCE', 'RATING', 'REVIEWS', 'PRICE', 'NAME', 'CHECKED'));

-- 운영자는 수업 확인 코드가 사용된 후기만 공개 승인할 수 있다.
create or replace function public.moderate_tutor_review(target_review_id uuid, target_status text, review_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare review_row public.tutor_reviews%rowtype;
begin
  if not private.is_edutalk_operator(array['CONTENT_MODERATOR', 'ADMIN']::public.operator_role[]) then raise exception 'operator role required'; end if;
  if target_status not in ('PENDING', 'APPROVED', 'REJECTED') or char_length(coalesce(review_note, '')) > 1000 then raise exception 'invalid tutor review input'; end if;
  select * into review_row from public.tutor_reviews where id = target_review_id for update;
  if not found then raise exception 'tutor review not found'; end if;
  if target_status = 'APPROVED' and (review_row.lesson_invite_id is null or review_row.lesson_verified_at is null) then raise exception 'verified lesson invite required'; end if;

  update public.tutor_reviews set moderation_status = target_status, moderation_note = nullif(trim(review_note), ''), moderated_at = now(), moderated_by = auth.uid(), verified_lesson = (target_status = 'APPROVED') where id = review_row.id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'tutor_review.' || lower(target_status), 'tutor_review', review_row.id, jsonb_build_object('note', nullif(trim(review_note), '')));
  return jsonb_build_object('id', review_row.id, 'status', target_status, 'verifiedLesson', target_status = 'APPROVED');
end;
$$;

revoke all on function public.moderate_tutor_review(uuid, text, text) from public, anon;
grant execute on function public.moderate_tutor_review(uuid, text, text) to authenticated;
