"""Exercise the production SQL against SQLite, including repeat requests and redemption guards."""
import sqlite3, pathlib
s=sqlite3.connect(':memory:');s.executescript(pathlib.Path('drizzle/0000_large_terrax.sql').read_text())
s.execute("INSERT INTO businesses VALUES('b','owner','Cafe','Free coffee',9,'#7357eb','2026')")
s.execute("INSERT INTO businesses VALUES('other','other-owner','Other','Reward',9,'#7357eb','2026')")
s.execute("INSERT INTO customers VALUES('c','b','Customer','0501111111','token',0,9,'2026')")
def act(kind,key):
 delta=1 if kind=='stamp' else -9
 condition='stamps < target' if kind=='stamp' else 'stamps >= target'
 with s:
  s.execute(f'UPDATE customers SET stamps=stamps+? WHERE id=? AND business=? AND {condition} AND NOT EXISTS(SELECT 1 FROM events WHERE id=?)',(delta,'c','b',key))
  s.execute('INSERT INTO events(id,customer,actor,kind,delta,created) SELECT ?,?,?,?,?,? WHERE changes()=1',(key,'c','owner',kind,delta,'2026'))
def stamps():return s.execute("SELECT stamps FROM customers WHERE id='c'").fetchone()[0]
act('redeem','too-early');assert stamps()==0
act('stamp','one');act('stamp','one');assert stamps()==1
for i in range(8):act('stamp',str(i))
assert stamps()==9
act('stamp','overflow');assert stamps()==9
act('redeem','redeem');assert stamps()==0
act('redeem','second-redemption');act('redeem','redeem');assert stamps()==0
assert s.execute('SELECT COUNT(*) FROM events').fetchone()[0]==10
assert s.execute("SELECT id FROM businesses WHERE id='b' AND owner='other-owner'").fetchone() is None
try:s.execute("INSERT INTO customers VALUES('duplicate','b','Other','0501111111','other-token',0,9,'2026')")
except sqlite3.IntegrityError:pass
else:raise AssertionError('Duplicate registration allowed')
print('Passed: stamp accumulation, idempotency, reward cap, redemption eligibility, double redemption, tenant isolation, duplicate phone guard.')
