-- Flystream policy control plane initial schema.
-- Secrets stay in GitHub Environments or an external secret manager.
-- This migration stores metadata and policy decisions, not raw subscription credentials.

create table if not exists schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
);

create table if not exists sync_sources (
    id bigint generated always as identity primary key,
    source_type text not null check (source_type in ('v2board', 'blackmatrix7', 'health')),
    name text not null,
    enabled boolean not null default true,
    schedule text,
    secret_ref text,
    last_success_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (source_type, name)
);

create table if not exists sync_runs (
    id bigint generated always as identity primary key,
    source_id bigint not null references sync_sources(id),
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null check (status in ('running', 'succeeded', 'failed', 'skipped')),
    input_hash text,
    result_summary jsonb not null default '{}'::jsonb,
    error_code text
);

create table if not exists node_catalog (
    id bigint generated always as identity primary key,
    source_id bigint not null references sync_sources(id),
    source_node_key text not null,
    display_name text not null,
    protocol text not null,
    address_hash text,
    enabled boolean not null default true,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    unique (source_id, source_node_key)
);

create table if not exists node_route_metadata (
    node_id bigint primary key references node_catalog(id) on delete cascade,
    route_types jsonb not null default '[]'::jsonb,
    region text,
    bandwidth_class text,
    latency_class text,
    ipv6 boolean not null default false,
    confidence numeric(5, 4) not null default 0 check (confidence between 0 and 1),
    source text not null default 'automatic',
    updated_at timestamptz not null default now()
);

create table if not exists node_operator_scores (
    node_id bigint not null references node_catalog(id) on delete cascade,
    operator text not null check (operator in ('telecom', 'unicom', 'mobile', 'unknown')),
    score numeric(5, 4) not null check (score between 0 and 1),
    sample_count integer not null default 0 check (sample_count >= 0),
    measured_at timestamptz,
    source text not null default 'automatic',
    primary key (node_id, operator)
);

create table if not exists node_capabilities (
    node_id bigint not null references node_catalog(id) on delete cascade,
    business text not null,
    supported boolean not null default false,
    score numeric(5, 4) not null default 0 check (score between 0 and 1),
    verified_at timestamptz,
    primary key (node_id, business)
);

create table if not exists operator_asn_rules (
    asn bigint primary key,
    isp_pattern text,
    operator text not null check (operator in ('telecom', 'unicom', 'mobile', 'unknown')),
    priority integer not null default 0,
    enabled boolean not null default true,
    source text not null default 'manual',
    updated_at timestamptz not null default now()
);

create table if not exists business_policies (
    business text primary key,
    mode text not null check (mode in ('auto', 'url-test', 'fallback', 'manual')),
    candidate_tags jsonb not null default '[]'::jsonb,
    fallback_tags jsonb not null default '[]'::jsonb,
    health_check_url text,
    enabled boolean not null default true,
    updated_at timestamptz not null default now()
);

create table if not exists policy_versions (
    version text primary key,
    content_hash text not null unique,
    status text not null check (status in ('draft', 'validated', 'active', 'superseded', 'rolled-back')),
    generated_by text not null,
    policy_document jsonb not null,
    created_at timestamptz not null default now(),
    published_at timestamptz,
    rollback_of text references policy_versions(version)
);

create unique index if not exists policy_versions_one_active
    on policy_versions (status)
    where status = 'active';

create table if not exists rule_sources (
    id bigint generated always as identity primary key,
    name text not null unique,
    source_url text not null,
    enabled boolean not null default true,
    last_commit text,
    last_success_at timestamptz
);

create table if not exists rule_versions (
    version text primary key,
    source_id bigint not null references rule_sources(id),
    content_hash text not null,
    categories jsonb not null default '[]'::jsonb,
    status text not null check (status in ('fetched', 'validated', 'active', 'superseded')),
    fetched_at timestamptz not null default now(),
    unique (source_id, content_hash)
);

create table if not exists manual_overrides (
    id bigint generated always as identity primary key,
    target_type text not null,
    target_id text not null,
    field text not null,
    value jsonb not null,
    reason text not null,
    operator text not null,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (target_type, target_id, field)
);

create table if not exists audit_logs (
    id bigint generated always as identity primary key,
    actor text not null,
    action text not null,
    target_type text not null,
    target_id text,
    before_hash text,
    after_hash text,
    request_id text,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
