#!/usr/bin/env python3
"""
Fills a LOCAL database with load-test data (never run against production).
  python3 scripts/load-seed.py <path to local .sqlite> [small businesses] [customers in the big one]
Creates one big business (many customers and months of stamps) and many small ones, each with an
owner and a staff member whose sessions are ready to use (tokens written to scripts/load-tokens.json).
"""
import base64, hashlib, json, random, sqlite3, sys, uuid
from datetime import datetime, timedelta, timezone

db_path = sys.argv[1]
SMALL = int(sys.argv[2]) if len(sys.argv) > 2 else 50
BIG = int(sys.argv[3]) if len(sys.argv) > 3 else 5000
random.seed(7)
now = datetime.now(timezone.utc)
iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000Z")
b64 = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")
sha = lambda s: b64(hashlib.sha256(s.encode()).digest())

c = sqlite3.connect(db_path)
tokens = {"big": None, "small": []}

def user(name):
    uid = str(uuid.uuid4())
    c.execute("INSERT INTO users(id,email,name,pass_hash,created) VALUES(?,?,?,?,?)", (uid, f"{uid[:8]}@load.test", name, "x", iso(now)))
    tok = b64(random.randbytes(24))
    c.execute("INSERT INTO sessions(id,user,created,expires) VALUES(?,?,?,?)", (sha(tok), uid, iso(now), iso(now + timedelta(days=2))))
    return uid, tok

def business(name, customers, months):
    owner, otok = user(f"owner {name}")
    staff, stok = user(f"staff {name}")
    bid = str(uuid.uuid4())
    c.execute("INSERT INTO businesses(id,owner,name,reward,target,color,created,join_code,reward_mode) VALUES(?,?,?,?,?,?,?,?,?)",
              (bid, owner, name, "Free coffee", 10, "#7558E8", iso(now - timedelta(days=30 * months)), uuid.uuid4().hex[:10], "bank"))
    for u, role in ((owner, "owner"), (staff, "staff")):
        c.execute("INSERT INTO memberships(id,business,user,role,created) VALUES(?,?,?,?,?)", (str(uuid.uuid4()), bid, u, role, iso(now)))
    custs = []
    for i in range(customers):
        cid = str(uuid.uuid4())
        secret = b64(random.randbytes(24))
        c.execute("INSERT INTO customers(id,business,name,phone,token,stamps,target,created,card_hash,scan_code,source) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                  (cid, bid, f"Customer {i}", f"+9725{random.randint(10000000, 99999999)}{i}", uuid.uuid4().hex, random.randint(0, 9), 10,
                   iso(now - timedelta(days=random.randint(0, 30 * months))), sha(secret), uuid.uuid4().hex, "staff"))
        custs.append((cid, secret))
        # a few visits per customer, spread over the months
        for _ in range(random.randint(1, 15)):
            when = now - timedelta(minutes=random.randint(0, 60 * 24 * 30 * months))
            c.execute("INSERT INTO events(id,customer,actor,kind,delta,created,business,actor_role) VALUES(?,?,?,?,?,?,?,?)",
                      (str(uuid.uuid4()), cid, staff, "stamp", 1, iso(when), bid, "staff"))
    return {"business": bid, "owner": otok, "staff": stok, "customers": [x[0] for x in custs[:200]], "cards": [x[1] for x in custs[:200]]}

tokens["big"] = business("Big Cafe", BIG, 6)
for n in range(SMALL):
    tokens["small"].append(business(f"Small {n}", 200, 2))
c.commit()
ev = c.execute("SELECT COUNT(*) FROM events").fetchone()[0]
cu = c.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
json.dump(tokens, open("scripts/load-tokens.json", "w"))
print(f"seeded {SMALL + 1} businesses, {cu} customers, {ev} events")
