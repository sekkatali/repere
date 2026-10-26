// Repère — analyse d'une fiche Google Maps (à exécuter sur la page d'un lieu, langue FR)
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const q=s=>document.querySelector(s);
const name=(q('h1.DUwDvf')||{}).innerText||document.title.replace(' - Google Maps','');
const site=(q('a[data-item-id="authority"]')||{}).href||null;
const phone=((q('button[data-item-id^="phone"]')||{getAttribute:()=>''}).getAttribute('data-item-id')||'').replace('phone:tel:','')||null;
const address=((q('button[data-item-id="address"]')||{}).innerText||'').trim();
const ratingTxt=(q('div.F7nice span[aria-hidden]')||{}).innerText||'';
const closedPerm=/Fermé définitivement|Définitivement fermé/i.test(document.body.innerText.slice(0,4000));
const tab=[...document.querySelectorAll('button[role=tab]')].find(b=>/Avis/.test(b.getAttribute('aria-label')||b.innerText));
if(tab){tab.click(); await sleep(2000);}
const sortBtn=[...document.querySelectorAll('button')].find(b=>/Trier/.test(b.getAttribute('aria-label')||''));
if(sortBtn){sortBtn.click(); await sleep(1200); const it=[...document.querySelectorAll('div[role=menuitemradio]')].find(m=>/récents/i.test(m.innerText)); if(it){it.click(); await sleep(2500);}}
const pane=q('div[data-review-id]')?.closest('div.m6QErb.DxyBCb')||q('div.m6QErb.DxyBCb');
for(let i=0;i<4;i++){pane&&pane.scrollBy(0,4000); await sleep(1300);}
const seen=new Set(), R=[];
for(const d of document.querySelectorAll('div[data-review-id].jftiEf')){
  const id=d.getAttribute('data-review-id'); if(seen.has(id))continue; seen.add(id);
  const more=d.querySelector('button.w8nwRe'); if(more) more.click();
  const stars=parseInt(((d.querySelector('span[role=img]')||{getAttribute:()=>''}).getAttribute('aria-label')||'0'));
  R.push({stars, date:(d.querySelector('.rsqaWe')||{}).innerText||'', replied:/Réponse du propriétaire/.test(d.innerText), text:((d.querySelector('.wiI7pd')||{}).innerText||'').replace(/\s+/g,' ').slice(0,260)});
}
const unanswered=R.filter(r=>!r.replied);
// "jours/semaines/un mois/2 mois" = moins de ~60 jours
const recent=s=>/jour|semaine|un mois|2 mois/.test(s);
({name, address, rating:ratingTxt, site, phone, closedPerm,
  n:R.length, unanswered:unanswered.length, replied:R.length-unanswered.length,
  lastReview:R[0]?.date||null, newestReplied:(R.find(r=>r.replied)||{}).date||null,
  negUnanswered:unanswered.filter(r=>r.stars<=3&&recent(r.date)).slice(0,3),
  posUnanswered:unanswered.filter(r=>r.stars>=4&&r.text.length>40).slice(0,3)})
