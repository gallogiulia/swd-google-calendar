
let CACHE={t:0,d:null,key:""};
const TTL=(Number(process.env.GCAL_CACHE_MINUTES||10))*60000;
const IDS=[
"a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com",
"1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com",
"2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com",
"08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com",
"0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com"
];

const CALENDAR_COLORS = {
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com": "#2563eb", // Club Sponsored
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com": "#7c3aed", // Other Tournaments
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com": "#dc2626", // Men's
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com": "#059669", // Women's
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com": "#f59e0b"  // PBA
};

function yearWindow(year){
  // Use UTC boundaries so all-day events remain stable.
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
  return { start, end };
}


export default async function(req,res){
 const now=Date.now();
 const year = Number(req.query.year || "");
 const days = Number(req.query.days || 180);
 const cacheKey = year ? `year:${year}` : `days:${days}`;

 if(CACHE.d && CACHE.key===cacheKey && now-CACHE.t<TTL) return res.json(CACHE.d);
 if(!process.env.GCAL_API_KEY) return res.status(500).json({error:"Missing key"});

 let min,max;
 if(year && Number.isFinite(year)){
  const w = yearWindow(year);
  min = w.start.toISOString();
  max = w.end.toISOString();
 } else {
  min=new Date().toISOString();
  max=new Date(Date.now()+days*86400000).toISOString();
 }

 let ev=[];
 for(const id of IDS){
  const u=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?key=${process.env.GCAL_API_KEY}&timeMin=${min}&timeMax=${max}&singleEvents=true&orderBy=startTime`;
  const r=await fetch(u); if(!r.ok) continue;
  const j=await r.json();
  (j.items||[]).forEach(e=>ev.push({
   id:e.id,title:e.summary||"",start:e.start.dateTime||e.start.date,
   end:e.end?.dateTime||e.end?.date,allDay:!!e.start.date,
   location:e.location||"",htmlLink:e.htmlLink||"",color: CALENDAR_COLORS[id] || "#2563eb"
  }));
 }
 ev.sort((a,b)=>new Date(a.start)-new Date(b.start));
 CACHE={t:now,d:{events:ev},key:cacheKey};
 res.json(CACHE.d);
}
