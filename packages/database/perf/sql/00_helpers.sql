-- Helpers every generator step uses (docs/32-perf-tenant.md). They live in a
-- private `_perf` schema in the perf cluster only; nothing in the app reads
-- them. The driver sets _perf.params before running the steps.
--
-- Everything is deterministic: ids and "random" choices are hashes of a kind
-- and a number, so two runs at the same scale and as_of produce the same data
-- and a measurement can name a specific record.

CREATE SCHEMA IF NOT EXISTS _perf;

CREATE TABLE IF NOT EXISTS _perf.params (
    singleton  boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    tenant_id  uuid    NOT NULL,
    scale      numeric NOT NULL CHECK (scale > 0),
    as_of      date    NOT NULL,
    seeded_at  timestamptz,
    seconds    numeric
);

-- The tenant. A fixed id, so the measurement script and a cleanup can find it.
CREATE OR REPLACE FUNCTION _perf.tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT tenant_id FROM _perf.params $$;

CREATE OR REPLACE FUNCTION _perf.as_of() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT as_of FROM _perf.params $$;

-- A count at the current scale, never below `floor_`.
CREATE OR REPLACE FUNCTION _perf.n(base numeric, floor_ int DEFAULT 1) RETURNS int
LANGUAGE sql STABLE AS $$
    SELECT greatest(floor_, round(base * (SELECT scale FROM _perf.params)))::int
$$;

-- A stable uuid for the n-th record of a kind.
CREATE OR REPLACE FUNCTION _perf.u(kind text, n bigint) RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT md5('perf:' || kind || ':' || n)::uuid
$$;

-- A uniform value in [0, 1) for the n-th draw of a kind.
CREATE OR REPLACE FUNCTION _perf.r(kind text, n bigint) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT ('x' || substr(md5('r:' || kind || ':' || n), 1, 8))::bit(32)::bigint
           / 4294967296.0
$$;

-- An integer in [lo, hi].
CREATE OR REPLACE FUNCTION _perf.ri(kind text, n bigint, lo int, hi int) RETURNS int
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT lo + floor(_perf.r(kind, n) * (hi - lo + 1))::int
$$;

-- An integer in [1, hi], skewed toward 1: power > 1 makes small values common
-- and large ones rare — a few big customers and projects, many small ones.
CREATE OR REPLACE FUNCTION _perf.skew(kind text, n bigint, hi int, power double precision DEFAULT 3)
RETURNS int
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT 1 + floor(power(_perf.r(kind, n), power) * hi)::int
$$;

-- One element of an array.
CREATE OR REPLACE FUNCTION _perf.pick(arr anyarray, kind text, n bigint) RETURNS anyelement
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT arr[1 + floor(_perf.r(kind, n) * array_length(arr, 1))::int]
$$;

-- A date `days` back from as_of, uniformly within that window.
CREATE OR REPLACE FUNCTION _perf.day_within(kind text, n bigint, days int) RETURNS date
LANGUAGE sql STABLE AS $$
    SELECT _perf.as_of() - floor(_perf.r(kind, n) * days)::int
$$;

-- An instant during office hours on a given day.
CREATE OR REPLACE FUNCTION _perf.at(d date, kind text, n bigint) RETURNS timestamptz
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT (d + make_interval(hours => 8 + floor(_perf.r(kind, n) * 10)::int,
                              mins  => floor(_perf.r(kind || ':m', n) * 60)::int))
           AT TIME ZONE 'UTC'
$$;

CREATE OR REPLACE FUNCTION _perf.first_names() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
    'Aarav','Abigail','Adwoa','Aiko','Alejandro','Amara','Anika','Arjun','Astrid','Ayesha',
    'Bao','Beatriz','Benjamin','Camila','Chen','Chiara','Daniel','Diego','Divya','Elena',
    'Elif','Emeka','Emma','Fatima','Felix','Freya','Gabriel','Hana','Hiroshi','Ibrahim',
    'Ines','Isabel','Ivan','Jakob','Jamal','Jia','Johanna','Jose','Kavya','Kenji',
    'Lars','Leila','Liam','Lina','Lucas','Maja','Marco','Maria','Mateo','Mei',
    'Mohammed','Nadia','Nikhil','Noah','Nora','Olivia','Omar','Priya','Rafael','Rahul',
    'Ravi','Rosa','Sakura','Samuel','Sara','Sebastian','Sofia','Sunita','Tariq','Thomas',
    'Valentina','Vikram','Wei','Yara','Yusuf','Zainab','Zoe','Anders','Bianca','Carlos']
$$;

CREATE OR REPLACE FUNCTION _perf.last_names() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
    'Adeyemi','Agarwal','Andersen','Bauer','Becker','Bianchi','Brown','Castro','Chen','Cohen',
    'Costa','Das','Dubois','Fischer','Fernandez','Garcia','Gupta','Hansen','Hoffmann','Huang',
    'Ivanova','Iyer','Jensen','Johnson','Kaur','Khan','Kim','Klein','Kowalski','Kumar',
    'Lee','Lopez','Martin','Mehta','Meyer','Moreau','Muller','Nakamura','Nguyen','Novak',
    'Okafor','Olsen','Patel','Pereira','Petrov','Rao','Reddy','Richter','Rossi','Santos',
    'Schmidt','Schneider','Sharma','Silva','Singh','Smith','Suzuki','Tanaka','Taylor','Thomas',
    'Wagner','Walker','Wang','Weber','Williams','Wilson','Wong','Yamamoto','Young','Zhang']
$$;

CREATE OR REPLACE FUNCTION _perf.full_name(kind text, n bigint) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT _perf.pick(_perf.first_names(), kind || ':f', n) || ' '
        || _perf.pick(_perf.last_names(), kind || ':l', n)
$$;

-- Plausible business words, for company names, deal names and subjects.
CREATE OR REPLACE FUNCTION _perf.words() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
    'Apex','Atlas','Beacon','Blue','Bright','Cedar','Clear','Coastal','Crest','Delta',
    'Eastern','Ember','Evergreen','First','Forge','Granite','Harbor','Horizon','Iron','Keystone',
    'Lakeside','Liberty','Lumen','Meridian','Metro','North','Nova','Oak','Orbit','Pacific',
    'Peak','Pioneer','Prime','Quantum','Redwood','River','Silver','Summit','Sterling','Union',
    'Vertex','Vista','West','Willow','Zenith','Alpine','Copper','Falcon','Harvest','Maple']
$$;

CREATE OR REPLACE FUNCTION _perf.company(n bigint) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT _perf.pick(_perf.words(), 'co:a', n) || ' '
        || _perf.pick(_perf.words(), 'co:b', n) || ' '
        || _perf.pick(ARRAY['Group','Holdings','Industries','Logistics','Health','Retail',
                            'Energy','Systems','Partners','Labs','Manufacturing','Foods',
                            'Capital','Media','Analytics','Logistics'], 'co:c', n)
$$;
