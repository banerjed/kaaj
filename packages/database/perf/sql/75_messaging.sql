-- ---------------------------------------------------------------- messaging
-- docs/38-messaging.md. One SMS number and one inbound address for the firm;
-- a thread with a third of its contacts, on the channel that contact
-- can be reached on; messages skewed the way real threads are — most are
-- short, a few run long. Delivery status, direction and the unread mark
-- follow the shape the webhook and send paths write.

CREATE TEMP TABLE _msg_people AS
SELECT row_number() OVER (ORDER BY employee_number) AS p, id
  FROM employees WHERE tenant_id = _perf.tenant() AND is_active;

INSERT INTO messaging_endpoints (id, tenant_id, channel, address, label, provider_ref, country_code,
                                 registration_status, is_active, created_at, created_by)
VALUES
  (_perf.u('msg_endpoint', 1), _perf.tenant(), 'sms', '+12125550100', 'Main line',
   'nda_perf000000000000000001', 'US', 'verified', true, (_perf.as_of() - 700)::timestamptz,
   (SELECT id FROM _msg_people WHERE p = 1)),
  (_perf.u('msg_endpoint', 2), _perf.tenant(), 'email', 'brightline-k7m2qp4x@inbound.example',
   'Shared inbox', NULL, NULL, 'none', true, (_perf.as_of() - 700)::timestamptz,
   (SELECT id FROM _msg_people WHERE p = 1));

-- One thread per (endpoint, address): generated contacts share phone
-- numbers, so the SMS pick is deduplicated on the number, keeping the first.
CREATE TEMP TABLE _thread AS
SELECT DISTINCT ON (x.channel, x.address) x.*
  FROM (
    SELECT t, _perf.u('msg_conv', t) AS id,
           CASE WHEN _perf.r('mc:ch', t) < 0.4 THEN 'sms' ELSE 'email' END AS channel,
           cc.id AS contact_id, cc.customer_id,
           cc.first_name || ' ' || cc.last_name AS name,
           CASE WHEN _perf.r('mc:ch', t) < 0.4
                -- The fixture writes phones as `+1-555-0042`; the carrier delivers E.164.
                THEN regexp_replace(cc.phone, '[^0-9+]', '', 'g')
                ELSE lower(cc.email) END AS address
      FROM generate_series(1, _perf.n(3000)) t
      -- Contact ids are keyed by customer and position, not a sequence, so
      -- every third contact in id order is the stable pick.
      JOIN (SELECT id, customer_id, first_name, last_name, email, phone,
                   row_number() OVER (ORDER BY id) AS i
              FROM customer_contacts WHERE tenant_id = _perf.tenant()) cc ON cc.i = t * 3
  ) x
  ORDER BY x.channel, x.address, x.t;

INSERT INTO messaging_conversations (id, tenant_id, channel, endpoint_id, counterparty_address,
                                     counterparty_name, customer_contact_id, customer_id, subject,
                                     status, has_unread, last_message_at, last_direction, created_at)
SELECT h.id, _perf.tenant(), h.channel,
       CASE h.channel WHEN 'sms' THEN _perf.u('msg_endpoint', 1) ELSE _perf.u('msg_endpoint', 2) END,
       h.address,
       h.name, h.contact_id, h.customer_id,
       CASE WHEN h.channel = 'email'
            THEN _perf.pick(ARRAY['Renewal paperwork','Invoice query','Site visit','Contract amendment','Onboarding'], 'mc:s', h.t) END,
       CASE WHEN _perf.r('mc:st', h.t) < 0.8 THEN 'open' ELSE 'closed' END,
       _perf.r('mc:u', h.t) < 0.15,
       (_perf.as_of() - _perf.ri('mc:d', h.t, 0, 400))::timestamptz,
       CASE WHEN _perf.r('mc:dir', h.t) < 0.5 THEN 'inbound' ELSE 'outbound' END,
       (_perf.as_of() - 400 - _perf.ri('mc:c', h.t, 0, 300))::timestamptz
  FROM _thread h;

-- Each thread's messages alternate direction from a random start; outbound
-- ones carry an author and a delivery status, inbound ones Bird's id.
INSERT INTO messaging_messages (id, tenant_id, conversation_id, direction, from_address, to_address,
                                subject, body_text, status, provider_message_id, author_employee_id,
                                occurred_at, created_at)
SELECT _perf.u('msg_msg', h.t * 1000 + k), _perf.tenant(), h.id, d.direction,
       CASE d.direction WHEN 'inbound' THEN c.counterparty_address ELSE e.address END,
       CASE d.direction WHEN 'inbound' THEN e.address ELSE c.counterparty_address END,
       CASE WHEN h.channel = 'email' THEN CASE WHEN k = 1 THEN c.subject ELSE 'Re: ' || c.subject END END,
       _perf.pick(ARRAY['Thanks, will do.','Can you resend that?','Confirmed for Thursday.',
                        'Please find the details attached.','Sorry, wrong number.',
                        'Could we move it to next week?','All sorted on our side.'], 'mm:b', h.t * 1000 + k),
       CASE d.direction WHEN 'inbound' THEN 'received'
            ELSE _perf.pick(ARRAY['delivered','delivered','delivered','sent','failed'], 'mm:st', h.t * 1000 + k) END,
       CASE h.channel WHEN 'sms' THEN 'sms_perf' ELSE 'em_perf' END || _perf.pad(h.t * 1000 + k, 12),
       CASE d.direction WHEN 'outbound' THEN (SELECT id FROM _msg_people WHERE p = 1 + (h.t + k) % 50) END,
       ts.at, ts.at
  FROM _thread h
  JOIN messaging_conversations c ON c.id = h.id
  JOIN messaging_endpoints e ON e.id = c.endpoint_id
  CROSS JOIN LATERAL generate_series(1, _perf.skew('mm:n', h.t, 120, 2)) k
  CROSS JOIN LATERAL (SELECT CASE WHEN (k + (_perf.r('mm:d0', h.t) < 0.5)::int) % 2 = 0
                                  THEN 'inbound' ELSE 'outbound' END AS direction) d
  CROSS JOIN LATERAL (SELECT _perf.at(_perf.as_of() - floor(_perf.r('mm:dd', h.t * 1000 + k) * 400)::int,
                                      'mm:t', h.t * 1000 + k) AS at) ts;

DROP TABLE _msg_people, _thread;
