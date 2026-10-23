import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
export const dynamic='force-dynamic';
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})}
export async function GET(){
 const u=await getChatGPTUser();if(!u)return json({error:'Sign in required'},401);const db=env.DB!;
 const b=await db.prepare('SELECT * FROM businesses WHERE owner=? ORDER BY created').bind(u.userId).all();
 const c=await db.prepare('SELECT c.* FROM customers c JOIN businesses b ON c.business=b.id WHERE b.owner=? ORDER BY c.created DESC').bind(u.userId).all();
 const e=await db.prepare('SELECT e.*,c.name,b.name AS business_name FROM events e JOIN customers c ON e.customer=c.id JOIN businesses b ON c.business=b.id WHERE b.owner=? ORDER BY e.created DESC LIMIT 100').bind(u.userId).all();
 return json({businesses:b.results,customers:c.results,events:e.results});
}
export async function POST(req:Request){
 const u=await getChatGPTUser();if(!u)return json({error:'Sign in required'},401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Invalid origin'},403);
 const db=env.DB!;let p:any;try{p=await req.json()}catch{return json({error:'Invalid request'},400)}
 const now=new Date().toISOString();
 if(p.action==='business'){
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>80||typeof p.reward!=='string'||!p.reward.trim()||p.reward.length>160||!Number.isInteger(p.target)||p.target<1||p.target>30||!/^#[a-fA-F0-9]{6}$/.test(p.color))return json({error:'Invalid business details'},400);
  const id=crypto.randomUUID();await db.prepare('INSERT INTO businesses(id,owner,name,reward,target,color,created) VALUES(?,?,?,?,?,?,?)').bind(id,u.userId,p.name.trim(),p.reward.trim(),p.target,p.color,now).run();return json({id});
 }
 const b=await db.prepare('SELECT * FROM businesses WHERE id=? AND owner=?').bind(p.business||'',u.userId).first<any>();if(!b)return json({error:'Business not found'},404);
 if(p.action==='customer'){
  const phone=String(p.phone||'').replace(/[\s()-]/g,'');
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>80||!/^\+?[0-9]{9,15}$/.test(phone))return json({error:'Invalid name or phone'},400);
  const id=crypto.randomUUID();const token=crypto.randomUUID();
  const r=await db.prepare('INSERT OR IGNORE INTO customers(id,business,name,phone,token,stamps,target,created) VALUES(?,?,?,?,?,0,?,?)').bind(id,b.id,p.name.trim(),phone,token,b.target,now).run();if(!r.meta.changes)return json({error:'Phone already registered'},409);return json({id});
 }
 if(!['stamp','redeem'].includes(p.action)||typeof p.requestId!=='string'||!/^[0-9a-f-]{36}$/.test(p.requestId))return json({error:'Invalid action'},400);
 const c=await db.prepare('SELECT * FROM customers WHERE id=? AND business=?').bind(p.customer||'',b.id).first<any>();if(!c)return json({error:'Customer not found'},404);
 const delta=p.action==='stamp'?1:-c.target;
 const condition=p.action==='stamp'?'stamps < target':'stamps >= target';
 const result=await db.batch([
  db.prepare(`UPDATE customers SET stamps=stamps+? WHERE id=? AND business=? AND ${condition} AND NOT EXISTS(SELECT 1 FROM events WHERE id=?)`).bind(delta,c.id,b.id,p.requestId),
  db.prepare('INSERT INTO events(id,customer,actor,kind,delta,created) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(p.requestId,c.id,u.userId,p.action,delta,now)
 ]);
 if(!result[0].meta.changes){const previous=await db.prepare('SELECT id FROM events WHERE id=? AND customer=?').bind(p.requestId,c.id).first();if(!previous)return json({error:p.action==='stamp'?'Reward ready. Redeem first.':'Reward not ready'},409)}
 return json({ok:true});
}
