// Repère — recherche d'e-mails sur le site d'un resto (à exécuter sur sa page d'accueil)
// Renvoie chaque e-mail avec la page où il a été trouvé et le texte qui l'entoure (pour juger s'il appartient au resto ou à l'agence web).
const RX=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BAD=/\.(png|jpe?g|webp|gif|svg)$|sentry|wixpress|example|domain\.com|godaddy|ovh\.net|@2x|cnil\.fr|o2switch|ionos|hostinger/i;
const grab=(doc,page)=>{const out=[];const txt=(doc.body?doc.body.innerText:'')||'';const html=doc.documentElement.innerHTML;
  for(const e of new Set(html.match(RX)||[])){ if(BAD.test(e))continue; const i=txt.toLowerCase().indexOf(e.toLowerCase());
    out.push({email:e.toLowerCase(),page,context:i>=0?txt.slice(Math.max(0,i-140),i+40).replace(/\s+/g,' '):''});}
  return out;};
let all=grab(document,'accueil');
const links=[...new Set([...document.querySelectorAll('a')].map(a=>a.href).filter(h=>/contact|infos|reserv|about|propos|mentions/i.test(h)&&h.startsWith(location.origin)))].slice(0,5);
for(const l of links){try{const d=new DOMParser().parseFromString(await (await fetch(l)).text(),'text/html'); all=all.concat(grab(d,/mentions/i.test(l)?'mentions-legales':'contact'));}catch(e){}}
const seen=new Set();
({domain:location.hostname.replace(/^www\./,''), checked:links,
  contactForm:!!document.querySelector('form input[type=email], form textarea'),
  social:[...new Set([...document.querySelectorAll('a')].map(a=>a.href).filter(h=>/instagram\.com|facebook\.com/.test(h)))].slice(0,3),
  emails:all.filter(o=>!seen.has(o.email)&&seen.add(o.email))})
