/* PAPYRUS — un écran pour l'agent : il écoute, la fiche se remplit, il corrige du pouce, il vérifie le ticket, il imprime.
   POC Hack the Vibe 25/09/2026 · vanilla JS · clés dans ⚙ (localStorage) · aucun backend.
   Trois couches : INCIDENT (contexte) → TRAJET (données Navitia, le JS constate) → BESOINS (le voyageur dit, l'IA détecte, le JS complète, l'agent décoche). */
'use strict';
const $ = id => document.getElementById(id);
const load = (k,d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k,v) => localStorage.setItem(k, JSON.stringify(v));
const SGPT = 'https://gpt.sncf.fr/api/gateway'; // gateway SNCF GPT, format OpenAI
let cfg = Object.assign({ provider:'sncfgpt', gptKey:'', gptModel:'mistral-medium-2508', anthropic:'', model:'claude-sonnet-5', navitia:'', heure:'', incident:true }, load('papyrus.cfg', {}));
const hasIA = () => cfg.provider==='anthropic' ? !!cfg.anthropic : !!cfg.gptKey;
const GARE = 'stop_area:SNCF:87481002'; // Nantes

const INCIDENT = { texte:'TER 14h32 → Pornic supprimé · car de substitution 14h50 · vélos refusés', car:'14:50' };
/* ---------- données embarquées autour de la gare ----------
   Sources vérifiées le 25/09/2026 : Nantes Métropole open data (véloparcs + disponibilités temps réel, vélocistes, gonfleurs),
   SNCF open data (stationnement sécurisé en gare : Nantes = 883 places au 12/2024), levoyageanantes.fr et lockin-lockers.com (consignes).
   Il n'existe PAS de consigne bagages SNCF en gare de Nantes, ni de pompe publique à la gare (les plus proches : Pirmil, Gréneraie ~2 km). */
const ODS = 'https://data.nantesmetropole.fr/api/explore/v2.1/catalog/datasets/';
const VELOPARCS = [ // n = nom exact du jeu "parking-velos-nantes-metropole-disponibilites" (pour la fusion temps réel)
  { n:'Cyclostation', d:'27 bd Stalingrad (Nord) · gratuit, libre 24h/24, non surveillé', cap:692, min:2, libre:true },
  { n:'Gare Sud Parvis', d:'50 bd de Berlin (Sud) · surveillé, prise VAE, abonnement Naolib', cap:1216, min:3 },
  { n:'Gare Nord Château n+1', d:'parking Gare-Château (Nord) · abonnés Naolib', cap:200, min:2 },
  { n:'Gare Sud 2 - Viséo 5B', d:'bd de Berlin (Sud) · surveillé, abonnés', cap:55, min:4 },
  { n:'Moutonnerie', d:'3 rue F. Ferrer · 2 consignes individuelles gratuites', cap:2, min:9, libre:true } ];
const REPARATION = [
  { n:'Ridy — atelier vélo', d:'19 quai F. Favre (Sud) · 4 min · 09 83 33 25 66' },
  { n:'Nantes Bike Solution', d:'9 rue Maréchal Joffre · 8 min · 02 28 30 72 29' } ];
const HOTELS = [ // n, détail, minutes à pied, famille ok — À VÉRIFIER SUR PLACE
  { n:'Novotel Nantes Centre Gare', d:'Bd de Stalingrad, sortie Sud', min:2, fam:true },
  { n:'ibis Nantes Centre Gare Sud', d:'Sortie Sud, budget', min:3, fam:true },
  { n:'Okko Hotels Nantes Château', d:'Quartier château', min:10, fam:false },
  { n:'Hôtel Amiral', d:'Rue Scribe, centre-ville', min:15, fam:true } ];
const LIEUX = [ // n, détail, minutes d'attente nécessaires (aller-retour + visite), famille
  { n:'Jardin des Plantes', d:'face à la sortie Nord, gratuit, aire de jeux', need:30, fam:true },
  { n:'Le Lieu Unique', d:'5 min, café, expos, ancienne biscuiterie LU', need:60, fam:false },
  { n:'Château des ducs de Bretagne', d:'10 min à pied, cour et remparts gratuits', need:75, fam:true },
  { n:'Passage Pommeraye', d:'15 min à pied, galerie du XIXe', need:90, fam:false },
  { n:'Les Machines de l\'île', d:'tram 1 dir. François Mitterrand, arrêt Chantiers Navals, ~20 min', need:150, fam:true } ];
const BAGAGES = [ // pas de consigne SNCF à Nantes : solutions en ville
  { n:'Casiers LOCKIN', d:'24 rue de Strasbourg · 15 min · 7h-24h · 15 €/24h (M), 21 € (XL) · QR code', num:true },
  { n:'Commerces partenaires Nannybag / Bounce', d:'boutiques/hôtels près de la gare · 2,50-5 €/jour · réservation en ligne', num:true },
  { n:'Casiers sacoches vélo — Château des ducs', d:'accueil du musée · 10 min · pièce 1-2 € · cyclistes uniquement', velo:true },
  { n:'Bagages volumineux ou sans téléphone', d:'voir avec l\'accueil, hall Nord' } ];
const VILLE = ['Tram 1 et busway 4 : arrêt Gare Nord, devant la sortie Nord (Naolib)', 'Tickets : bornes sur le quai du tram, ou appli Naolib', 'Centre-ville : 10 min à pied par le cours Saint-Pierre', 'Taxis : parvis Sud', 'Accueil SNCF : hall Nord'];
const HISTOIRE_SECOURS = t => `LE PETIT TRAIN DE ${t.toUpperCase()}\n\nIl était une fois un enfant qui partait pour ${t}. Dans le train, il compta les vaches, les nuages et les ponts. À chaque gare, le train disait « pssschhh » comme s'il soufflait après une course. L'enfant colla son nez à la fenêtre et vit la mer de champs devenir une mer de toits. « Prochain arrêt : ${t} ! » dit le haut-parleur. L'enfant sourit : l'aventure commençait.`;

/* Ce que l'agent dit au voyageur pour chaque besoin, et comment le bloc se déclenche */
const BLOCS = {
  hebergement:{ titre:'Pour la nuit', ticket:'POUR LA NUIT', dire:'« Il n\'y a plus de train ce soir. Je vous imprime les hôtels les plus proches. Pour la prise en charge, passez à l\'accueil avec votre billet. »', auto:'plus aucun trajet aujourd\'hui' },
  attente:    { titre:'En attendant', ticket:'EN ATTENDANT', dire:'« Vous avez du temps devant vous. Voici deux ou trois idées à moins de 15 minutes, je vous les mets sur le ticket. »', auto:'prochain départ dans plus d\'une heure' },
  histoire:   { titre:'Histoire pour les enfants', ticket:null, dire:'« Et pour les enfants, on imprime une histoire à lire dans le train ? »', auto:'des enfants sont présents' },
  garer:      { titre:'Garer le vélo', ticket:'VOTRE VELO', dire:'« Pour le vélo : le Cyclostation, 27 boulevard de Stalingrad, est gratuit et ouvert 24h/24. Si vous voulez du surveillé, le véloparc Gare Sud Parvis, avec un abonnement Naolib. »', auto:'vélo présent et trajet ou attente sans le vélo' },
  bagages:    { titre:'Bagages', ticket:'BAGAGES', dire:'« Il n\'y a pas de consigne en gare. La plus proche : les casiers LOCKIN rue de Strasbourg, 15 minutes à pied, ou une boutique partenaire Nannybag à réserver sur le téléphone. »', auto:'' },
  ville:      { titre:'Se déplacer à Nantes', ticket:'EN VILLE', dire:'« Vous ne connaissez pas Nantes ? Je vous note comment rejoindre le centre et les transports. »', auto:'' } };

/* ---------- état ---------- */
const VIDE = () => ({ de:'', vers:'', quand:'', avec:'', type:'', velo:'', num:'', resume:'', besoins:[] });
let F = VIDE(), touched = new Set(), transcript = '', sols = [], sel = -1, conseils = {}, lastVers = '', plusDeTrain = false;
let off = {}, story = null, storyBusy = false; // extras : items décochés par l'agent, histoire générée
let veloLive = null; // disponibilités véloparcs (Nantes Métropole, temps réel) fusionnées par nom
async function loadVeloparcs(){
  try{ const r=await fetch(ODS+"244400404_parking-velos-nantes-metropole-disponibilites/records?where=within_distance(geometrie%2Cgeom'POINT(-1.5423%2047.2173)'%2C900m)&limit=30");
    const j=await r.json(); veloLive={}; for(const x of j.results||[]) veloLive[x.name]=x; renderExtras(); ticket(); }
  catch(e){ veloLive=null; }
}

/* ---------- utilitaires ---------- */
function toast(m){ const t=$('toast'); t.textContent=m; t.classList.remove('hidden'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.add('hidden'),3500); }
function state(id,txt,cls=''){ const e=$(id); if(e){ e.textContent=txt; e.className='state '+cls; } }
function now(){ const d=new Date(); if(/^\d{1,2}:\d{2}$/.test(cfg.heure)){ const [h,m]=cfg.heure.split(':'); d.setHours(+h,+m,0,0); } return d; }
const p2 = n => String(n).padStart(2,'0');
const navDate = d => `${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`;
const fmt = s => s ? `${s.slice(9,11)}:${s.slice(11,13)}` : '—';
const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const debounce = (fn,ms) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
const minutesAvant = hhmm => { const m=/^(\d{2}):(\d{2})$/.exec(hhmm||''); if(!m) return null; const d=now(); return (+m[1]*60+ +m[2])-(d.getHours()*60+d.getMinutes()); };

/* ---------- APIs ---------- */
async function nav(path){
  if(!cfg.navitia) throw new Error('token Navitia manquant (⚙)');
  const r=await fetch('https://api.navitia.io/v1/coverage/sncf'+path,{ headers:{ Authorization:'Basic '+btoa(cfg.navitia+':') } });
  if(!r.ok) throw new Error('Navitia '+r.status); return r.json();
}
/* Un seul point d'entrée IA. Deux fournisseurs : SNCF GPT (format OpenAI chat/completions) ou Anthropic. */
async function llm(system,user,max=500){
  if(cfg.provider==='anthropic'){
    if(!cfg.anthropic) throw new Error('clé Anthropic manquante (⚙)');
    const r=await fetch('https://api.anthropic.com/v1/messages',{ method:'POST',
      headers:{ 'content-type':'application/json','x-api-key':cfg.anthropic,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
      body:JSON.stringify({ model:cfg.model, max_tokens:max, system, messages:[{ role:'user', content:user }] }) });
    const j=await r.json(); if(j.error) throw new Error(j.error.message);
    return (j.content||[]).map(c=>c.text||'').join('');
  }
  if(!cfg.gptKey) throw new Error('clé SGPT manquante (⚙)');
  const r=await fetch(SGPT+'/chat/completions',{ method:'POST', headers:{ 'content-type':'application/json', Authorization:'Bearer '+cfg.gptKey.replace(/^Bearer\s+/i,'') },
    body:JSON.stringify({ model:cfg.gptModel||'mistral-medium-2508', messages:[{ role:'system', content:system },{ role:'user', content:user }], max_tokens:max, temperature:0 }) });
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.error) throw new Error('SGPT '+r.status+' '+(j.error?.message||j.message||''));
  return j.choices?.[0]?.message?.content ?? '';
}
async function sgptModels(){
  const r=await fetch(SGPT+'/models',{ headers:{ Authorization:'Bearer '+cfg.gptKey.replace(/^Bearer\s+/i,'') } });
  if(!r.ok) throw new Error('SGPT '+r.status); const j=await r.json();
  return (j.data||j.models||[]).map(m=>m.id||m.name||m).filter(Boolean);
}
/* JSON balisé (<J>…</J>) avec une relance si le modèle bavarde — pattern repris de verifCDA */
async function llmJSON(system,user,max=500){
  const sys=system+'\nRéponds uniquement avec le JSON, encadré exactement ainsi : <J>{…}</J>';
  const take=t=>{ const m=t.match(/<J>\s*([\s\S]*?)\s*<\/J>/)||t.match(/(\{[\s\S]*\})/); return JSON.parse(m[1]); };
  let t=await llm(sys,user,max);
  try{ return take(t); }catch{ t=await llm(sys,user+'\n\nTa réponse précédente n\'était pas un JSON valide. Renvoie uniquement <J>{…}</J>.',max); return take(t); }
}

/* ================= 1. ÉCOUTER ================= */
let rec=null, on=false, finals='';
$('mic').onclick=()=>{
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return toast('Micro indisponible : Chrome en HTTPS requis. Complétez à la main.');
  if(on){ rec.stop(); return; }
  rec=new SR(); rec.lang='fr-FR'; rec.continuous=true; rec.interimResults=true; finals='';
  rec.onresult=e=>{ let fin='',tmp=''; for(const r of e.results) r.isFinal ? fin+=r[0].transcript+' ' : tmp+=r[0].transcript;
    if(fin!==finals){ finals=fin; comprendreDebounced(); } $('live').textContent=(transcript+' '+fin+tmp).trim(); };
  rec.onend=()=>{ on=false; $('mic').classList.remove('on'); $('micLbl').textContent='Écouter'; if(finals.trim()){ transcript=(transcript+' '+finals).trim(); finals=''; } comprendre(); };
  rec.onerror=e=>toast('Micro : '+e.error);
  rec.start(); on=true; $('mic').classList.add('on'); $('micLbl').textContent='Stop';
};
$('more').onkeydown=e=>{ if(e.key==='Enter'&&$('more').value.trim()){ transcript=(transcript+' '+$('more').value.trim()).trim(); $('more').value=''; $('live').textContent=transcript; comprendre(); } };

/* ================= 2. FICHE ================= */
const SYS = `Tu es PAPYRUS, l'assistant d'un agent en gare de Nantes. Tu lis la transcription d'un échange agent/voyageur et tu remplis une fiche. JSON strict, sans commentaire :
{"de":str,"vers":str,"quand":str,"avec":str,"type":"quotidien|touriste|famille|occasionnel|","velo":"oui|non|","num":"ok|ko|","besoins":[str],"resume":str}
"de" = d'où vient le voyageur (ville ou train d'origine), "vers" = destination (nom de ville ou gare, sans article), "quand" = contrainte horaire courte (ex. "avant 17h", "demain matin", "dans 4 h"), "avec" = ce qu'il a avec lui hors vélo (enfants avec prénom et âge si dits, bagages, personne âgée…). "num" : ok s'il est visiblement à l'aise avec un téléphone, ko s'il n'en a pas ou demande du papier, sinon vide.
"besoins" : liste parmi "hebergement" (dormir, hôtel, nuit, plus de train ce soir), "garer" (où laisser ou garer le vélo, local sécurisé, consigne vélo), "attente" (attente longue, plusieurs heures, quoi faire), "histoire" (des enfants sont présents), "bagages" (valises, consigne, bagages encombrants), "ville" (ne connaît pas Nantes, demande comment se déplacer ou où aller). Vide si rien ne l'indique.
"resume" = 1 phrase pour l'agent. Champ inconnu = chaîne vide. Rien n'est inventé.`;
function heuristique(t){
  const m=t.match(/(?:pour|vers|à|jusqu'à)\s+([A-ZÉ][\wéèêàç'-]+(?:[ -][A-ZÉ][\wéèêàç'-]+)*)/);
  const b=[]; if(/dormir|hôtel|hotel|nuit|plus de train/i.test(t)) b.push('hebergement'); if(/attendre|attente|\d ?heures/i.test(t)) b.push('attente'); if(/enfant|gamin|fille|fils/i.test(t)) b.push('histoire'); if(/bagage|valise|consigne/i.test(t)) b.push('bagages'); if(/garer|laisser (mon|le) vélo|local vélo|parking vélo/i.test(t)) b.push('garer'); if(/connais pas|première fois|comment (aller|faire)|tram|bus/i.test(t)) b.push('ville');
  return { vers:m?m[1]:'', velo:/vélo|velo/i.test(t)?'oui':'', type:/enfant|famille/i.test(t)?'famille':/touris|vacances|hôtel/i.test(t)?'touriste':/boulot|travail|tous les jours/i.test(t)?'quotidien':'', num:/pas de téléphone|papier/i.test(t)?'ko':'', quand:(t.match(/avant \d{1,2}\s?h(?:\d{2})?|demain[^,.]*|dans \d+ ?h[^,.]*/i)||[''])[0], avec:/enfant/i.test(t)?'enfants':/bagage/i.test(t)?'bagages':'', de:'', besoins:b, resume:t.slice(0,120) };
}
const BESOINS=['hebergement','garer','attente','histoire','bagages','ville'];
function addBesoin(b,why){ if(touched.has('besoins')||F.besoins.includes(b)) return false; F.besoins.push(b); if(why) toast(why); return true; }
const comprendreDebounced=debounce(comprendre,1800);
async function comprendre(){
  const t=(transcript+' '+finals).trim(); if(!t) return;
  state('stFiche','analyse…','run');
  let a;
  try{ a=await llmJSON(SYS,t,400); state('stFiche','rempli par l\'IA — vérifiez','ok'); }
  catch(e){ a=heuristique(t); state('stFiche','sans IA : '+e.message,'ko'); }
  for(const k of Object.keys(F)){ if(touched.has(k)||!a[k]) continue; if(k==='besoins'){ (a.besoins||[]).filter(x=>BESOINS.includes(x)).forEach(x=>addBesoin(x)); } else F[k]=a[k]; }
  autoBesoins();
  renderFiche(true);
  if(F.vers && F.vers!==lastVers) solutions(); else { applyExclusions(); renderSols(); renderExtras(); ticket(); }
}
/* Le JS complète les besoins quand les données l'imposent (l'agent garde la main : une pastille touchée n'est plus modifiée) */
function autoBesoins(){
  if(F.type==='famille' || /enfant|fille|fils|gamin|\d+ ?ans/i.test(F.avec)) addBesoin('histoire', 'Enfants présents : histoire proposée');
  if(plusDeTrain) addBesoin('hebergement', 'Plus de trajet aujourd\'hui : hébergement ajouté');
  if(F.velo==='oui' && ((sols[sel] && sols[sel].velo!=='oui') || F.besoins.includes('hebergement') || F.besoins.includes('attente'))) addBesoin('garer', 'Vélo à garer : véloparcs ajoutés');
  const o=sols[sel]; const min=o?minutesAvant(o.depart):null; if(min!==null && min>60) addBesoin('attente', `Prochain départ dans ${min} min : « en attendant » ajouté`);
}
function renderFiche(fromAI=false){
  for(const k of ['de','vers','quand','avec']){ const i=$('f_'+k); if(i.value!==F[k]){ i.value=F[k]; i.classList.toggle('ai',fromAI&&!!F[k]&&!touched.has(k)); } }
  document.querySelectorAll('.chips').forEach(c=>{ const k=c.dataset.k, multi=c.classList.contains('multi'); c.querySelectorAll('button').forEach(b=>{ const onB=multi?F.besoins.includes(b.dataset.v):b.dataset.v===F[k]; b.classList.toggle('on',onB); b.classList.toggle('ai',fromAI&&onB&&!touched.has(k)); }); });
}
document.querySelectorAll('.f input').forEach(i=>i.onchange=()=>{ const k=i.dataset.k; F[k]=i.value.trim(); touched.add(k); i.classList.remove('ai'); if(k==='vers') solutions(); else { autoBesoins(); renderFiche(); renderExtras(); ticket(); } });
document.querySelectorAll('.chips button').forEach(b=>b.onclick=()=>{
  const c=b.parentElement, k=c.dataset.k, v=b.dataset.v;
  if(c.classList.contains('multi')){ F.besoins=F.besoins.includes(v)?F.besoins.filter(x=>x!==v):[...F.besoins,v]; }
  else F[k]=F[k]===v?'':v;
  touched.add(k); renderFiche(); applyExclusions(); renderSols(); renderExtras(); ticket();
});

/* ================= 3. SOLUTIONS ================= */
function veloRule(modes){ const m=modes.join(' ').toLowerCase();
  if(/car|bus|coach|autocar/.test(m)) return { velo:'non', detail:'car : vélos refusés' };
  if(/tgv|inoui|ouigo/.test(m)) return { velo:'resa', detail:'TGV : réservation vélo obligatoire' };
  return { velo:'oui', detail:'TER : vélo accepté, place non garantie' }; }
function condense(jr){
  const pt=jr.sections.filter(s=>s.type==='public_transport');
  const di=s=>s.display_informations, dir=s=>(di(s).direction||'').replace(/\s*\(.*\)$/,'');
  return { jour:jr.departure_date_time.slice(0,8), depart:fmt(jr.departure_date_time), arrivee:fmt(jr.arrival_date_time), corr:jr.nb_transfers, duree:Math.round(jr.duration/60),
    source:jr.sections.some(s=>s.data_freshness==='realtime')?'temps réel':'théorique',
    titre:`${fmt(jr.departure_date_time)} → ${fmt(jr.arrival_date_time)} · ${pt.map(s=>di(s).commercial_mode||'').join(' + ')||'trajet'}`,
    etapes:pt.map(s=>`${fmt(s.departure_date_time)} ${s.from.name} → ${fmt(s.arrival_date_time)} ${s.to.name} (${di(s).commercial_mode||''} ${di(s).code||di(s).trip_short_name||''} dir. ${dir(s)})`),
    ...veloRule(pt.map(s=>di(s).commercial_mode||di(s).physical_mode||'')) };
}
function applyExclusions(){ sols.forEach(o=>{ o.ex = (F.velo==='oui' && o.velo==='non') ? 'vélos refusés' : ''; }); if(sel<0 || sols[sel]?.ex){ sel=sols.findIndex(o=>!o.ex); } }
async function solutions(){
  lastVers=F.vers; sols=[]; sel=-1; conseils={}; plusDeTrain=false; renderSols(); renderExtras(); ticket();
  if(!F.vers) return;
  state('stSols','recherche…','run');
  try{
    const pl=await nav(`/places?q=${encodeURIComponent(F.vers)}&type[]=stop_area&count=3`);
    const to=(pl.places||[])[0]; if(!to) throw new Error('destination introuvable');
    const j=await nav(`/journeys?from=${GARE}&to=${to.id}&datetime=${navDate(now())}&count=4&data_freshness=realtime`);
    const today=navDate(now()).slice(0,8), all=(j.journeys||[]).map(condense);
    sols=all.filter(o=>o.jour===today);                       // le JS constate : ce qui part encore aujourd'hui
    plusDeTrain = all.length>0 && sols.length===0;              // il y a des trajets… mais tous demain
    if(plusDeTrain){ const d=all[0]; sols=[{ ...d, titre:`Demain ${d.depart} → ${d.arrivee} · ${d.titre.split('· ')[1]||''}`, demain:true }]; }
    if(cfg.incident && /pornic/i.test(F.vers)) sols.push({ jour:today, depart:INCIDENT.car, arrivee:'~15:55', corr:0, duree:65, source:'simulé', titre:`${INCIDENT.car} → ~15:55 · Car de substitution`, etapes:[`${INCIDENT.car} Nantes → Pornic (car de substitution)`], velo:'non', detail:'car de substitution : vélos refusés' });
    sols.sort((a,b)=>(a.demain?1:0)-(b.demain?1:0) || a.arrivee.localeCompare(b.arrivee));
    state('stSols', plusDeTrain?`plus de trajet aujourd'hui · premier demain ${sols[0].depart}`:`${sols.length} trajet${sols.length>1?'s':''} · ${to.name}`, sols.length?'ok':'ko');
  }catch(e){ state('stSols',e.message,'ko'); }
  applyExclusions(); autoBesoins(); renderFiche(); renderSols(); renderExtras(); ticket();
  if(sols.length && hasIA()) conseil();
}
async function conseil(){ // une phrase par option pour le ticket, à partir des données seulement
  try{
    const r=await llmJSON('Tu es PAPYRUS. Pour chaque option (déjà calculée, horaires intouchables), écris 1 phrase de conseil concret pour le voyageur, en tenant compte de sa fiche et des points vélo fournis (ex. où laisser le vélo si l\'option le refuse, quoi faire du temps d\'attente). Pas de chiffre inventé. JSON strict : {"0":str,"1":str,...}',
      JSON.stringify({ fiche:F, options:sols.map((o,i)=>({ i, titre:o.titre, velo:o.velo, detail:o.detail, ex:o.ex, demain:!!o.demain })), points_velo:VELOPARCS.map(v=>v.n+' — '+v.d), bagages:'aucune consigne SNCF en gare ; LOCKIN rue de Strasbourg ou Nannybag' }), 400);
    conseils=r; renderSols(); ticket();
  }catch(e){ /* silencieux : le ticket reste exact sans conseil */ }
}
function renderSols(){
  const box=$('sols');
  if(!sols.length){ box.innerHTML=`<p class="muted">${F.vers?'Aucun trajet trouvé — orienter vers l\'accueil.':'Dès que la destination est connue, les trajets s\'affichent ici.'}</p>`; return; }
  const vb=o=>o.velo==='oui'?'<span class="badge ok">🚲 accepté</span>':o.velo==='non'?'<span class="badge ko">🚲 refusé</span>':'<span class="badge warn">🚲 résa</span>';
  box.innerHTML=sols.map((o,i)=>`<div class="sol ${i===sel?'on':''} ${o.ex?'ex':''}" data-i="${i}"><div><b>${esc(o.titre)}</b><small>${o.corr?o.corr+' correspondance'+(o.corr>1?'s':''):'direct'} · ${esc(o.detail)} · ${esc(o.source)}${o.ex?' · <b>écarté : '+esc(o.ex)+'</b>':''}</small>${conseils[i]?`<small>💡 ${esc(conseils[i])}</small>`:''}</div>${vb(o)}</div>`).join('');
  box.querySelectorAll('.sol').forEach(el=>el.onclick=()=>{ sel=+el.dataset.i; autoBesoins(); renderFiche(); renderSols(); renderExtras(); ticket(); });
}

/* ================= 3b. EN PLUS DU TRAJET (blocs selon besoins) ================= */
function itemsFor(b){
  const fam=F.type==='famille'||/enfant/i.test(F.avec);
  if(b==='hebergement') return [...HOTELS.filter(h=>!fam||h.fam).slice(0,3).map(h=>({ k:'h:'+h.n, t:h.n, d:`${h.min} min à pied · ${h.d}` })), { k:'h:pec', t:'Prise en charge hébergement', d:'à voir à l\'accueil (hall Nord) avec votre billet' }];
  if(b==='attente'){ const min=sols[sel]?minutesAvant(sols[sel].depart):null, dispo=min===null||sols[sel]?.demain?240:min; return LIEUX.filter(l=>l.need<=dispo&&(!fam||l.fam)).slice(0,3).map(l=>({ k:'l:'+l.n, t:l.n, d:l.d })); }
  if(b==='garer'){ const live=n=>{ const x=veloLive&&veloLive[n]; if(!x) return ''; return x.accesstype==='Accès libre' ? (x.lockertype==='Individuel'?` · ${x.availablespots}/${x.capacity} libres (temps réel)`:' · ouvert (temps réel)') : ` · ${x.status==='Disponible'?'places abonnés dispo':x.status.toLowerCase()} (temps réel)`; };
    return [...VELOPARCS.filter(v=>F.type==='quotidien'||v.libre||v.n==='Gare Sud Parvis').slice(0,4).map(v=>({ k:'vp:'+v.n, t:v.n, d:`${v.min} min · ${v.cap} places · ${v.d}${live(v.n)}` })), ...REPARATION.slice(0,1).map(r=>({ k:'rep:'+r.n, t:r.n, d:r.d }))]; }
  if(b==='bagages') return BAGAGES.filter(x=>(!x.num||F.num!=='ko')&&(!x.velo||F.velo==='oui')).map(x=>({ k:'b:'+x.n, t:x.n, d:x.d }));
  if(b==='ville') return VILLE.map((t,i)=>({ k:'v:'+i, t }));
  return [];
}
const actifs = b => itemsFor(b).filter(it=>!off[it.k]);
function renderExtras(){
  const box=$('extras'), card=$('extrasCard'); if(!box) return;
  const bs=BESOINS.filter(b=>F.besoins.includes(b));
  card.classList.toggle('hidden',!bs.length); if(!bs.length) return;
  box.innerHTML=bs.map(b=>{
    const B=BLOCS[b]; let body='';
    if(b==='histoire'){
      body = story ? `<div class="story">${esc(story)}</div><div class="row"><button class="btn" id="btnStoryPrint">🖨 Imprimer l'histoire (2e ticket)</button><button class="lnk" id="btnStoryRedo">Réécrire</button></div>`
                   : `<button class="btn" id="btnStory" ${storyBusy?'disabled':''}>${storyBusy?'écriture…':'📖 Écrire l\'histoire'}</button><p class="muted">Ticket séparé, à donner à l\'enfant. Personnalisé avec la destination${/\w+/.test(F.avec)?' et « '+esc(F.avec)+' »':''}.</p>`;
    } else body = itemsFor(b).map(it=>`<div class="xi ${off[it.k]?'off':''}" data-k="${esc(it.k)}"><div>${esc(it.t)}${it.d?`<small>${esc(it.d)}</small>`:''}</div><span>${off[it.k]?'＋':'✓'}</span></div>`).join('') || '<p class="muted">Rien à proposer avec le temps disponible.</p>';
    return `<div class="xb" data-b="${b}"><h3>${esc(B.titre)}<span>${B.ticket?'sur le ticket':'ticket séparé'}</span></h3><p class="muted">À dire : ${esc(B.dire)}</p>${body}</div>`;
  }).join('');
  box.querySelectorAll('.xi').forEach(el=>el.onclick=()=>{ off[el.dataset.k]=!off[el.dataset.k]; renderExtras(); ticket(); });
  const bS=$('btnStory'); if(bS) bS.onclick=histoire;
  const bR=$('btnStoryRedo'); if(bR) bR.onclick=()=>{ story=null; histoire(); };
  const t2=$('ticket2'); if(t2) t2.classList.toggle('hidden', !(story && F.besoins.includes('histoire')));
  const bP=$('btnStoryPrint'); if(bP){ drawLines(t2, storyLines()); bP.onclick=()=>printCanvas(t2, 'histoire'); }
  state('stExtras', bs.length+' bloc'+(bs.length>1?'s':''), 'ok');
}
async function histoire(){
  storyBusy=true; renderExtras();
  const dest=F.vers||'la mer';
  try{
    story=(await llm(`Tu écris pour un enfant de 4 à 8 ans, en français simple et chaleureux. Histoire de 10 à 14 phrases courtes. Le héros est l'enfant (utilise son prénom s'il est donné, sinon « toi »). Il voyage aujourd'hui depuis Nantes vers ${dest}${F.velo==='oui'?' avec un vélo':''}. Un petit imprévu (train qui attend, changement de quai, car, pluie…) tourne en aventure joyeuse, sans jamais faire peur. Fin heureuse à l'arrivée. Aucune marque, aucun nom réel de personne. Première ligne : un titre court EN MAJUSCULES, puis une ligne vide, puis l'histoire. Pas d'autre texte.`,
      `Fiche : ${JSON.stringify({ vers:dest, avec:F.avec, type:F.type, velo:F.velo })}`, 700)).trim();
    if(story.length<80) throw new Error('histoire trop courte');
  }catch(e){ story=HISTOIRE_SECOURS(dest); toast('Histoire de secours utilisée ('+e.message+')'); }
  storyBusy=false; renderExtras();
}

/* ================= 4. TICKET (format ticket de caisse, 32 colonnes) ================= */
const COLS=32, LH=26, FONT="20px 'Courier New', monospace";
const wrap=(t,w=COLS)=>{ const out=[]; for(const para of String(t).split('\n')){ const ind=(para.match(/^ */)||[''])[0]; let cur=''; for(const tok of para.slice(ind.length).match(/\S+ */g)||['']){ if(cur && (cur+tok).trimEnd().length>w-ind.length){ out.push(ind+cur.trimEnd()); cur=tok; } else cur+=tok; } out.push(ind+cur.trimEnd()); } return out; };
const center=t=>' '.repeat(Math.max(0,Math.floor((COLS-t.length)/2)))+t;
const HR='-'.repeat(COLS);
const W_=(t,b)=>wrap(t).map(t=>({t,b}));
function entete(sous){ const d=now(); return [{t:center('PAPYRUS'),b:1},{t:center(sous||'Gare de Nantes')},{t:center(`${p2(d.getDate())}/${p2(d.getMonth()+1)}/${d.getFullYear()}   ${p2(d.getHours())}:${p2(d.getMinutes())}`)},{t:HR}]; }
function ticketLines(){
  const o=sols[sel], d=now(), L=entete();
  if(F.de) L.push(...W_('DE    : '+F.de));
  L.push(...W_('POUR  : '+(F.vers||'—')));
  if(F.quand) L.push(...W_('QUAND : '+F.quand));
  L.push({t:'VELO  : '+(F.velo==='oui'?'oui':F.velo==='non'?'non':'—')});
  if(F.avec) L.push(...W_('AVEC  : '+F.avec));
  L.push({t:HR});
  if(o){
    L.push({t:o.demain?'VOTRE TRAJET (DEMAIN)':'VOTRE TRAJET',b:1});
    for(const e of o.etapes){ const m=e.match(/^(\S+) (.+?) → (\S+) (.+?) \((.*)\)$/); if(m){ L.push({t:`${m[1]} ${m[2]}`.slice(0,COLS),b:1},...W_('  '+m[5]),{t:`${m[3]} ${m[4]}`.slice(0,COLS),b:1}); } else L.push(...W_(e)); }
    L.push(...W_(`${o.corr?o.corr+' correspondance(s)':'Direct'} - ${o.detail}`));
    if(conseils[sel]) L.push({t:HR},{t:'CONSEIL',b:1},...W_(conseils[sel]));
  } else L.push(...W_(F.vers?'Pas de trajet dans les donnees : voir l\'accueil.':'Trajet en attente de destination.'));
  for(const b of BESOINS){ const B=BLOCS[b]; if(!F.besoins.includes(b)||!B.ticket) continue; const its=actifs(b); if(!its.length) continue;
    L.push({t:HR},{t:B.ticket,b:1}); for(const it of its){ L.push(...W_('- '+it.t)); if(it.d) L.push(...W_('  '+it.d)); } }
  if(F.besoins.includes('histoire')) L.push({t:HR},...W_('+ une histoire pour les enfants sur un ticket a part'));
  L.push({t:HR}); if(o) L.push(...W_(`Horaires ${o.source} Navitia a ${p2(d.getHours())}:${p2(d.getMinutes())}`));
  L.push(...wrap('Une question ? L\'accueil est la pour vous.').map(t=>({t:center(t)})));
  return L;
}
function storyLines(){ const L=entete('Une histoire pour la route'); for(const p of (story||'').split('\n')){ L.push(...(p.trim()?W_(p, p===p.toUpperCase()&&p.length<COLS):[{t:''}])); } L.push({t:HR},...wrap('Bon voyage !').map(t=>({t:center(t)}))); return L; }
function drawLines(c,L,qr){
  const x=c.getContext('2d'); c.height=L.length*LH+40+(qr?qr.height+20:0);
  x.fillStyle='#fff'; x.fillRect(0,0,384,c.height); x.fillStyle='#000'; x.textBaseline='top';
  let y=16; for(const l of L){ x.font=(l.b?'bold ':'')+FONT; x.fillText(l.t,16,y); y+=LH; }
  if(qr) x.drawImage(qr,(384-qr.width)/2,y+8);
  c.classList.remove('hidden');
}
function ticket(){
  const c=$('ticket'), qr=F.num==='ok'&&sols[sel]?qrCanvas():null;
  drawLines(c, ticketLines(), qr);
  const ok=sel>=0&&!!sols[sel]; $('btnPrint').disabled=!ok; state('stTick', ok?(F.num==='ok'?'avec QR (voyageur à l\'aise)':'papier'):'', ok?'ok':'');
  $('png').href=c.toDataURL('image/png');
}
function qrCanvas(){ const d=$('qrtmp'); d.innerHTML=''; if(!window.QRCode) return null; try{ new QRCode(d,{ text:ticketLines().map(l=>l.t.trim()).join('\n').slice(0,700), width:160, height:160, correctLevel:QRCode.CorrectLevel.L }); return d.querySelector('canvas'); }catch{ return null; } }

/* impression Web Bluetooth — Phomemo M02/M02S (ESC/POS raster ; non testé sans imprimante) */
function raster(c){ const W=c.width,H=c.height,d=c.getContext('2d').getImageData(0,0,W,H).data,bpl=W/8,out=[]; for(let y=0;y<H;y++) for(let bx=0;bx<bpl;bx++){ let b=0; for(let k=0;k<8;k++){ const i=(y*W+bx*8+k)*4; if((d[i]+d[i+1]+d[i+2])/3<128) b|=0x80>>k; } out.push(b); } return {out,H,bpl}; }
let btChar=null; // connexion gardée entre deux tickets (trajet puis histoire)
async function printCanvas(c, quoi='ticket'){
  if(!navigator.bluetooth) return toast('Bluetooth indisponible ici : utilisez « Enregistrer en image ».');
  try{
    state('stTick','connexion imprimante…','run');
    if(!btChar){ const dev=await navigator.bluetooth.requestDevice({ filters:[{ services:[0xff00] }], optionalServices:[0xff00] }); dev.addEventListener('gattserverdisconnected',()=>btChar=null);
      btChar=await (await (await dev.gatt.connect()).getPrimaryService(0xff00)).getCharacteristic(0xff02); }
    const {out,H,bpl}=raster(c); const cmd=[0x1b,0x40,0x1b,0x61,0x01,0x1f,0x11,0x02,0x04];
    for(let y0=0;y0<H;y0+=256){ const n=Math.min(256,H-y0); cmd.push(0x1d,0x76,0x30,0x00,bpl&255,bpl>>8,n&255,n>>8,...out.slice(y0*bpl,(y0+n)*bpl)); }
    cmd.push(0x1b,0x64,0x02,0x1b,0x64,0x02,0x1f,0x11,0x08,0x1f,0x11,0x0e,0x1f,0x11,0x07,0x1f,0x11,0x09);
    for(let i=0;i<cmd.length;i+=128){ const ck=new Uint8Array(cmd.slice(i,i+128)); btChar.writeValueWithoutResponse?await btChar.writeValueWithoutResponse(ck):await btChar.writeValue(ck); await new Promise(r=>setTimeout(r,25)); }
    state('stTick',quoi+' imprimé ✓','ok'); toast(quoi==='histoire'?'Histoire imprimée.':'Ticket imprimé.');
    if(quoi==='ticket'){ const j=load('papyrus.journal',[]); j.push({ h:`${p2(now().getHours())}:${p2(now().getMinutes())}`, ...F, option:sols[sel]?.titre }); save('papyrus.journal',j); }
  }catch(e){ btChar=null; state('stTick','impression impossible : '+e.message,'ko'); }
}
$('btnPrint').onclick=()=>printCanvas($('ticket'),'ticket');
$('btnReset').onclick=()=>{ F=VIDE(); touched=new Set(); transcript=''; finals=''; sols=[]; sel=-1; conseils={}; lastVers=''; plusDeTrain=false; off={}; story=null; storyBusy=false; $('live').textContent=''; renderFiche(); renderSols(); renderExtras(); ticket(); state('stFiche',''); state('stSols',''); window.scrollTo(0,0); };

/* ================= CONFIG ================= */
function ctx(){ const d=now(); $('ctx').textContent=`${p2(d.getHours())}:${p2(d.getMinutes())}${cfg.heure?' (simulé)':''}${cfg.incident?' · '+INCIDENT.texte+' (simulé)':''}`; }
function showProvider(){ const p=$('c_provider').value; $('cfg_sncfgpt').classList.toggle('hidden',p!=='sncfgpt'); $('cfg_anthropic').classList.toggle('hidden',p!=='anthropic'); }
function fillCfg(){
  $('c_provider').value=cfg.provider; $('c_gptKey').value=cfg.gptKey; setModel(cfg.gptModel);
  $('c_anthropic').value=cfg.anthropic; $('c_model').value=cfg.model; $('c_navitia').value=cfg.navitia; $('c_heure').value=cfg.heure; $('c_incident').checked=!!cfg.incident; showProvider(); ctx();
}
$('c_provider').onchange=showProvider;
function setModel(id){ const sel=$('c_gptModel'); if(id && ![...sel.options].some(o=>o.value===id)) sel.add(new Option(id,id)); if(id) sel.value=id; }
$('btnModeles').onclick=async()=>{
  cfg.gptKey=$('c_gptKey').value.trim(); $('modInfo').textContent='chargement…';
  try{ const ids=await sgptModels(); const sel=$('c_gptModel'), cur=sel.value; sel.innerHTML=''; ids.forEach(id=>sel.add(new Option(id,id))); setModel(ids.includes(cur)?cur:(ids.find(i=>/mistral-medium/.test(i))||ids[0])); $('modInfo').textContent=ids.length+' modèles'; }
  catch(e){ $('modInfo').textContent=e.message; }
};
$('btnCfg').onclick=()=>$('cfg').classList.remove('hidden');
$('btnCfgClose').onclick=()=>$('cfg').classList.add('hidden');
$('btnSave').onclick=async()=>{
  cfg={ provider:$('c_provider').value, gptKey:$('c_gptKey').value.trim(), gptModel:$('c_gptModel').value,
    anthropic:$('c_anthropic').value.trim(), model:$('c_model').value, navitia:$('c_navitia').value.trim(), heure:$('c_heure').value.trim(), incident:$('c_incident').checked };
  save('papyrus.cfg',cfg); fillCfg();
  const res=[], ia=cfg.provider==='anthropic'?'Claude':'SGPT '+cfg.gptModel; $('cfgInfo').textContent='test…';
  try{ await nav('/'); res.push('Navitia OK'); }catch(e){ res.push('Navitia : '+e.message); }
  try{ const t=await llm('Réponds uniquement OK.','ping',5); res.push(ia+' OK ('+t.trim().slice(0,20)+')'); }catch(e){ res.push(ia+' : '+e.message+(/failed to fetch/i.test(e.message)?' — réseau/proxy : êtes-vous sur le réseau SNCF ou VPN ?':'')); }
  $('cfgInfo').textContent=res.join(' · ');
};
$('btnClear').onclick=()=>{ if(!confirm('Effacer les clés de ce navigateur ?')) return; cfg.anthropic=''; cfg.gptKey=''; cfg.navitia=''; save('papyrus.cfg',cfg); fillCfg(); toast('Clés effacées.'); };

/* ================= init ================= */
fillCfg(); renderFiche(); renderSols(); renderExtras(); ticket(); loadVeloparcs();
if(!cfg.navitia && !hasIA()) $('cfg').classList.remove('hidden');
