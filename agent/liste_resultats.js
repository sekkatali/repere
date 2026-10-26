// Repère — liste des restos d'une recherche Google Maps (à exécuter sur la page de résultats)
const feed=document.querySelector('div[role=feed]');
for(let i=0;i<6;i++){feed&&feed.scrollBy(0,3000); await new Promise(r=>setTimeout(r,1200));}
[...(feed||document).querySelectorAll('a.hfpxzc')].map(a=>{const c=a.closest('div.Nv2PK')||a.parentElement;
  return {name:a.getAttribute('aria-label'), rating:(c.querySelector('span.MW4etd')||{}).innerText||'',
    count:((c.querySelector('span.UY7F9')||{}).innerText||'').replace(/[()\s ]/g,''),
    info:c.innerText.split('\n').slice(1,4).join(' | '), href:a.href.split('?')[0]}})
