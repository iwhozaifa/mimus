-- A draft-only proposal (approval level 1, or an account that hasn't
-- allowed sending) is something the user sends themselves, so they need
-- to be able to dismiss it from Approvals too. Same function as 0019,
-- with 'draft_only' added to the statuses 'reject' can start from.

create or replace function claim_scheduling_proposal(p_id uuid, p_action text)
returns public.scheduling_proposals
security definer
set search_path = public
language plpgsql
as $$
declare
  v_proposal scheduling_proposals;
  v_allowed text[];
begin
  select * into v_proposal from scheduling_proposals
  where id = p_id and user_id = auth.uid()
  for update;

  if v_proposal.id is null then
    raise exception 'scheduling proposal not found' using errcode = 'P0002';
  end if;

  if p_action = 'reject' then
    v_allowed := array['draft_only', 'pending', 'offered'];
  elsif p_action = 'send_offer' and v_proposal.kind = 'offer_times' then
    v_allowed := array['pending'];
  elsif p_action = 'book' and v_proposal.kind = 'offer_times' then
    v_allowed := array['pending', 'offered'];
  elsif p_action = 'send_link' and v_proposal.kind = 'calendly_link' then
    v_allowed := array['pending'];
  else
    raise exception 'action % does not apply to a % proposal', p_action, v_proposal.kind
      using errcode = '22023';
  end if;

  if not v_proposal.status = any (v_allowed) then
    raise exception 'scheduling proposal is %', v_proposal.status using errcode = '55000';
  end if;

  if p_action = 'reject' then
    update scheduling_proposals
    set status = 'rejected', decided_at = now(), pending_action = null, error = null
    where id = p_id
    returning * into v_proposal;
  else
    update scheduling_proposals
    set status = 'executing', previous_status = v_proposal.status, pending_action = p_action, error = null
    where id = p_id
    returning * into v_proposal;
  end if;

  return v_proposal;
end;
$$;

revoke all on function claim_scheduling_proposal(uuid, text) from public, anon;
grant execute on function claim_scheduling_proposal(uuid, text) to authenticated;
