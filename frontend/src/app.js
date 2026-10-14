/* SAARTHI — single-file vanilla app wired to the real FastAPI backend.
   Adapted from the original saarthi.html prototype:
   - real auth (device tokens) behind an ID + password login
   - real event sync (POST /api/v1/sync) with auto-sync + manual sync
   - server decisions adopted at natural breaks, local engine for offline
   - real curriculum from the built pack (same ids as backend)
   - back navigation, logout, real pack download with checksum verify      */
import {PACK, CHAPTERS, CONCEPTS, QB, GL, CHUNKS} from './curriculum.js';

/* ================= utilities ================= */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mem={};
const ls={get(k){try{const v=localStorage.getItem(k);if(v!==null)return JSON.parse(v)}catch(e){}return mem[k]?JSON.parse(mem[k]):null},
 set(k,v){const s=JSON.stringify(v);mem[k]=s;try{localStorage.setItem(k,s)}catch(e){}},
 del(k){delete mem[k];try{localStorage.removeItem(k)}catch(e){}},
 keys(){let a=Object.keys(mem);try{for(let i=0;i<localStorage.length;i++)a.push(localStorage.key(i))}catch(e){}return [...new Set(a)]}};
const ICON={
 home:'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
 book:'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5M9 7h6',
 check:'M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9',
 chat:'M21 12a8 8 0 01-11.6 7.1L3 21l1.9-5.4A8 8 0 1121 12z',
 chart:'M4 20V10M10 20V4M16 20v-8M22 20H2',
 download:'M12 3v12m0 0l-4-4m4 4l4-4M4 21h16',
 sync:'M21 12a9 9 0 00-15-6.7L3 8M3 3v5h5M3 12a9 9 0 0015 6.7L21 16M21 21v-5h-5',
 agent:'M12 3v3M6 7h12a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2zM9 13h.01M15 13h.01M9 17h6',
 sliders:'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M8 10v4M17 16v4',
 users:'M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8zM21 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
 search:'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
 globe:'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18',
 mic:'M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM19 11a7 7 0 01-14 0M12 18v3',
 lock:'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
 more:'M5 12h.01M12 12h.01M19 12h.01',
 send:'M22 2L11 13M22 2l-7 20-4-9-9-4z',
 x:'M18 6L6 18M6 6l12 12',
 alert:'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
 wifi:'M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5h.01',
 arrow:'M5 12h14M13 6l6 6-6 6',
 back:'M19 12H5M11 18l-6-6 6-6',
 leaf:'M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l8-8',
 shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
 plus:'M12 5v14M5 12h14',
 out:'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9'
};
const ic=n=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n]||''}"/></svg>`;

/* ================= i18n (English <-> Odia) ================= */
const LANGS=[{id:'en',label:'English',idx:0},{id:'or',label:'ଓଡ଼ିଆ',idx:1}];
let LANG='or';
const D={
'app.name':['Saarthi','ସାରଥି'],
'app.tag':['A learning companion that keeps working without internet','ଇଣ୍ଟରନେଟ୍ ନଥିଲେ ମଧ୍ୟ ଚାଲୁଥିବା ତୁମର ଶିକ୍ଷା ସାଥୀ'],
'app.class':['Class 9 · Science','ନବମ ଶ୍ରେଣୀ · ବିଜ୍ଞାନ'],
'login.title':['Sign in','ସାଇନ୍ ଇନ୍'],
'login.sub':['Enter your ID and password to start.','ଆରମ୍ଭ କରିବାକୁ ନିଜ ID ଓ ପାସୱାର୍ଡ ଦିଅ।'],
'login.id':['ID','ID'],'login.password':['Password','ପାସୱାର୍ଡ'],
'login.signin':['Sign in','ସାଇନ୍ ଇନ୍'],'login.newhere':['New here? Create an account','ନୂଆ? ଖାତା ତିଆରି କର'],
'login.signup':['Create account','ଖାତା ତିଆରି କର'],'login.name':['Your name','ତୁମର ନାମ'],
'login.role':['I am a','ମୁଁ'],'role.student':['Student','ଛାତ୍ର'],'role.teacher':['Teacher','ଶିକ୍ଷକ'],
'login.bad':['Wrong ID or password.','ID ବା ପାସୱାର୍ଡ ଭୁଲ।'],
'login.needname':['Please write your name.','ଦୟାକରି ନାମ ଲେଖ।'],
'login.needpw':['Password needs at least 4 letters.','ପାସୱାର୍ଡ ଅତି କମରେ ୪ ଅକ୍ଷରର ହେବା ଦରକାର।'],
'login.idtaken':['This ID is already taken.','ଏହି ID ପୂର୍ବରୁ ଅଛି।'],
'login.noserver':['Cannot reach the server. Start it first: python scripts/dev.py start','ସର୍ଭର ମିଳୁନାହିଁ। ପ୍ରଥମେ ଚଲାଅ: python scripts/dev.py start'],
'login.serveron':['Server connected','ସର୍ଭର ଯୁକ୍ତ'],'login.serveroff':['Server offline','ସର୍ଭର ବିଚ୍ଛିନ୍ନ'],
'login.demo':['Demo accounts — try these:','ଡେମୋ ଖାତା — ଏଗୁଡ଼ିକ ବ୍ୟବହାର କର:'],
'login.demo.s1':['Student Raju','ଛାତ୍ର ରାଜୁ'],'login.demo.s2':['Student Sunita','ଛାତ୍ରୀ ସୁନିତା'],'login.demo.t1':['Teacher','ଶିକ୍ଷକ'],
'login.privacy':['We keep only a name, a language and your learning events. No phone number. No location.','ଆମେ କେବଳ ନାମ, ଭାଷା ଓ ଶିକ୍ଷା ଘଟଣା ରଖୁ। ଫୋନ୍ ନମ୍ବର ନୁହେଁ। ଅବସ୍ଥାନ ନୁହେଁ।'],
'login.vp1':['Ask doubts in Odia, by typing, and get answers from your own textbook.','ଓଡ଼ିଆରେ ପ୍ରଶ୍ନ ପଚାର, ନିଜ ପାଠ୍ୟବହିରୁ ଉତ୍ତର ପାଅ।'],
'login.vp2':['It notices what you missed and decides what to study next.','ତୁମେ ଯାହା ବୁଝିନ, ତାହା ଚିହ୍ନଟ କରେ ଓ ପରବର୍ତ୍ତୀ ପାଠ ଠିକ୍ କରେ।'],
'login.vp3':['Works with no signal. Syncs by itself when the signal returns.','ସିଗ୍ନାଲ୍ ନଥିଲେ ମଧ୍ୟ ଚାଲେ। ସିଗ୍ନାଲ୍ ଫେରିଲେ ନିଜେ ସିଙ୍କ୍ ହୁଏ।'],
'login.offline':['Works offline','ଅଫଲାଇନ୍ ଚାଲେ'],
'login.pending':['{n} waiting to sync','{n} ଟି ସିଙ୍କ୍ ବାକି'],
'common.back':['Back','ପଛକୁ'],'common.cancel':['Cancel','ବାତିଲ'],'common.close':['Close','ବନ୍ଦ'],
'common.none':['Nothing yet','ଏପର୍ଯ୍ୟନ୍ତ କିଛି ନାହିଁ'],
'nav.home':['Home','ଘର'],'nav.learn':['Learn','ପାଠ'],'nav.practice':['Practice','ଅଭ୍ୟାସ'],'nav.ask':['Ask a doubt','ପ୍ରଶ୍ନ ପଚାର'],
'nav.progress':['My progress','ମୋ ଅଗ୍ରଗତି'],'nav.packs':['Downloads','ଡାଉନଲୋଡ୍'],'nav.sync':['Sync','ସିଙ୍କ୍'],'nav.agent':['Agent','ଏଜେଣ୍ଟ'],
'nav.settings':['Settings','ସେଟିଂସ୍'],'nav.more':['More','ଅଧିକ'],'nav.teacher':['Class view','ଶ୍ରେଣୀ ଦୃଶ୍ୟ'],
'nav.logout':['Log out','ଲଗ୍ ଆଉଟ୍'],
'nav.search':['Search or jump to…','ଖୋଜ ବା ଯାଅ…'],
'net.online':['Online','ଅନଲାଇନ୍'],'net.weak':['Weak signal','ଦୁର୍ବଳ ସିଗ୍ନାଲ୍'],'net.offline':['Offline','ଅଫଲାଇନ୍'],'net.auto':['Auto (device)','ସ୍ୱତଃ (ଡିଭାଇସ୍)'],
'net.demo':['Demo network','ଡେମୋ ନେଟୱାର୍କ'],'net.demo.note':['Switch the network to see how the agent adapts. Learning never stops.','ନେଟୱାର୍କ ବଦଳାଇ ଦେଖ ଏଜେଣ୍ଟ କିପରି ମାନିଯାଏ। ଶିଖିବା କେବେ ବନ୍ଦ ହୁଏ ନାହିଁ।'],
'net.to.offline':['Network lost. Saved on this phone; learning continues.','ନେଟୱାର୍କ ଗଲା। ଫୋନ୍‌ରେ ସଂରକ୍ଷିତ; ଶିଖିବା ଚାଲିବ।'],
'net.to.online':['Back online. Syncing quietly.','ଅନଲାଇନ୍ ଫେରିଲା। ଚୁପଚାପ୍ ସିଙ୍କ୍ ହେଉଛି।'],
'net.to.weak':['Weak signal. Using saved lessons.','ସିଗ୍ନାଲ୍ ଦୁର୍ବଳ। ସଂରକ୍ଷିତ ପାଠ ବ୍ୟବହାର ହେଉଛି।'],
'sync.saved':['All saved','ସବୁ ସୁରକ୍ଷିତ'],'sync.pending':['{n} waiting to sync','{n} ଟି ସିଙ୍କ୍ ବାକି'],'sync.running':['Syncing…','ସିଙ୍କ୍ ହେଉଛି…'],
'sync.paused':['Waiting for signal','ସିଗ୍ନାଲ୍ ଅପେକ୍ଷା'],
'act.REMEDIATE':['Build the base','ଆଧାରରୁ ଶିଖ'],'act.RETRY':['Practice again','ପୁଣି ଅଭ୍ୟାସ କର'],'act.REVISE':['Read again','ପୁନର୍ବାର ପଢ଼'],'act.ADVANCE':['Move ahead','ଆଗକୁ ବଢ଼'],
'go.learn':['Open the lesson','ପାଠ ଖୋଲ'],'go.practice':['Start practice','ଅଭ୍ୟାସ ଆରମ୍ଭ କର'],
'reason.COLD_START':['This is the best place to begin.','ଆରମ୍ଭ କରିବା ପାଇଁ ଏହା ସବୁଠାରୁ ଭଲ ସ୍ଥାନ।'],
'reason.WEAK_PREREQ_GAP':['A basic lesson you need first is still weak.','ଏହା ବୁଝିବାକୁ ଆଗରୁ ଦରକାର ଥିବା ଏକ ଆଧାର ପାଠ ଏବେ ଦୁର୍ବଳ।'],
'reason.WEAK_CONCEPT':['This lesson is still weak. Let us learn it again, simply.','ଏହି ପାଠ ଏବେ ଦୁର୍ବଳ। ସହଜରେ ପୁଣି ଶିଖିବା।'],
'reason.WRONG_RETRY':['Your last answer was wrong. Try again.','ଶେଷ ଉତ୍ତର ଭୁଲ ଥିଲା। ପୁଣି ଚେଷ୍ଟା କର।'],
'reason.PARTIAL_PRACTICE':['You are on the right track. A little more practice.','ତୁମେ ଠିକ୍ ବାଟରେ ଅଛ। ଆଉ ଟିକେ ଅଭ୍ୟାସ କର।'],
'reason.MASTERED_ADVANCE':['Well done! You know this lesson. Move ahead.','ବହୁତ ଭଲ! ତୁମେ ଏହି ପାଠ ଜାଣିଗଲ। ଆଗକୁ ଚାଲ।'],
'reason.NO_GAIN_ALT_CONTENT':['You tried many times. Let us learn it through an example.','ତୁମେ ଅନେକ ଥର ଚେଷ୍ଟା କଲ। ଏଥର ଉଦାହରଣରେ ବୁଝିବା।'],
'reason.NO_GAIN_REMEDIATE_PREREQ':['Make the basic lesson strong first.','ପ୍ରଥମେ ଆଧାର ପାଠକୁ ମଜବୁତ୍ କର।'],
'reason.INTERVENTIONS_EXHAUSTED':['This is hard. Please ask your teacher.','ଏହା କଠିନ ଲାଗୁଛି। ଦୟାକରି ଶିକ୍ଷକଙ୍କୁ ପଚାର।'],
'reason.SLICE_COMPLETE':['All lessons done! Revise an old lesson.','ସବୁ ପାଠ ସରିଲା! ଏକ ପୁରୁଣା ପାଠ ମନେ ପକାଅ।'],
'reason.BLOCKED_BY_PREREQ':['To go ahead, first learn a basic lesson.','ଆଗକୁ ଯିବାକୁ ପ୍ରଥମେ ଏକ ଆଧାର ପାଠ ଶିଖ।'],
'reason.CONTENT_NOT_AVAILABLE_OFFLINE':['That lesson is not on this phone yet. Study a nearby one.','ସେହି ପାଠ ଏହି ଫୋନ୍‌ରେ ନାହିଁ। ପାଖର ଏକ ପାଠ ପଢ଼।'],
'reason.STATE_INVALID_FALLBACK':['Restarting safely from a known point.','ସୁରକ୍ଷିତ ଭାବେ ଜଣାଥିବା ସ୍ଥାନରୁ ପୁନଃଆରମ୍ଭ।'],
'band.w':['Needs practice','ଅଭ୍ୟାସ ଦରକାର'],'band.p':['Getting there','ଆଗେଇ ଚାଲିଛ'],'band.m':['Mastered','ଆୟତ୍ତ'],'band.n':['Not started','ଆରମ୍ଭ ହୋଇନି'],
'deliv.cached':['From this phone','ଏହି ଫୋନ୍‌ରୁ'],'deliv.rich':['Fresh from the server','ସର୍ଭରରୁ ନୂଆ'],'deliv.prefetch_then_offline':['Downloading, then offline','ଡାଉନଲୋଡ୍ ପରେ ଅଫଲାଇନ୍'],
'home.hello':['Hello, {name}','ନମସ୍କାର, {name}'],
'home.sub':['Here is what to do next.','ଏବେ ଏହା କର।'],
'home.next':['Your next step','ତୁମର ପରବର୍ତ୍ତୀ ପାଦ'],
'home.why':['Why this?','ଏହା କାହିଁକି?'],
'home.plan':["Today's plan",'ଆଜିର ଯୋଜନା'],
'home.plan.cur':['{act}: {c}','{act}: {c}'],
'home.plan.review':['Quick review: {c}','ଶୀଘ୍ର ମନେ ପକାଅ: {c}'],
'home.plan.ask':['Ask one doubt from today\'s lesson','ଆଜିର ପାଠରୁ ଗୋଟିଏ ପ୍ରଶ୍ନ ପଚାର'],
'home.plan.sync':['Send {n} saved answers to the server','{n} ଟି ସଂରକ୍ଷିତ ଉତ୍ତର ସର୍ଭରକୁ ପଠାଅ'],
'home.plan.dl':['Download the pack: {p}','ପ୍ୟାକ୍ ଡାଉନଲୋଡ୍: {p}'],
'home.plan.agent':['Saarthi does this for you','ସାରଥି ଏହା ତୁମ ପାଇଁ କରେ'],
'home.inbox':['From Saarthi','ସାରଥିଙ୍କ ବାର୍ତ୍ତା'],
'home.in.hard':['You found “{c}” hard. I chose easier questions for it.','“{c}” ତୁମକୁ କଠିନ ଲାଗିଲା। ମୁଁ ସେଥିପାଇଁ ସହଜ ପ୍ରଶ୍ନ ବାଛିଲି।'],
'home.in.help':['“{c}” is still hard after many tries. Please ask your teacher.','ଅନେକ ଚେଷ୍ଟା ପରେ ମଧ୍ୟ “{c}” କଠିନ ଅଛି। ଦୟାକରି ଶିକ୍ଷକଙ୍କୁ ପଚାର।'],
'home.in.queue':['{n} answers are saved on this phone. They will sync when the signal returns.','{n} ଟି ଉତ୍ତର ଏହି ଫୋନ୍‌ରେ ସଂରକ୍ଷିତ। ସିଗ୍ନାଲ୍ ଫେରିଲେ ସିଙ୍କ୍ ହେବ।'],
'home.in.update':['A newer pack is ready: {p}. Download it on a good signal.','ନୂଆ ପ୍ୟାକ୍ ପ୍ରସ୍ତୁତ: {p}। ଭଲ ସିଗ୍ନାଲ୍‌ରେ ଡାଉନଲୋଡ୍ କର।'],
'home.in.server':['After syncing, the server suggested a new step. It is shown above.','ସିଙ୍କ୍ ପରେ ସର୍ଭର ଏକ ନୂଆ ପାଦ ସୁପାରିଶ କଲା। ଉପରେ ଦେଖାଯାଇଛି।'],
'home.in.none':['Nothing new. Keep going!','ନୂଆ କିଛି ନାହିଁ। ଚାଲିଥାଅ!'],
'home.in.pack':['“{p}” is being downloaded in the background.','“{p}” ପଛପଟରେ ଡାଉନଲୋଡ୍ ହେଉଛି।'],
'home.concepts':['Your lessons','ତୁମର ପାଠଗୁଡ଼ିକ'],
'home.week':['This week','ଏହି ସପ୍ତାହ'],
'home.conn':['This phone','ଏହି ଫୋନ୍'],
'home.trace':['Latest decision','ସଦ୍ୟତମ ନିଷ୍ପତ୍ତି'],
'home.quick':['Quick doubt','ଶୀଘ୍ର ପ୍ରଶ୍ନ'],
'home.quick.ph':['Type your doubt…','ତୁମ ପ୍ରଶ୍ନ ଲେଖ…'],
'home.stat.m':['Mastered','ଆୟତ୍ତ'],'home.stat.p':['Getting there','ଆଗେଇ ଚାଲିଛ'],'home.stat.w':['Needs practice','ଅଭ୍ୟାସ ଦରକାର'],'home.stat.n':['Not started','ଆରମ୍ଭ ହୋଇନି'],
'home.needhelp':['Please ask your teacher about this topic.','ଏହି ବିଷୟ ବିଷୟରେ ଦୟାକରି ଶିକ୍ଷକଙ୍କୁ ପଚାର।'],
'home.pending.upd':['Updated after sync','ସିଙ୍କ୍ ପରେ ନୂଆ ହେଲା'],
'days':['Sun,Mon,Tue,Wed,Thu,Fri,Sat','ରବି,ସୋମ,ମଙ୍ଗଳ,ବୁଧ,ଗୁରୁ,ଶୁକ୍ର,ଶନି'],
'learn.title':['Lessons','ପାଠଗୁଡ଼ିକ'],
'learn.pick':['Pick a lesson from the list','ତାଲିକାରୁ ଏକ ପାଠ ବାଛ'],
'learn.text':['Lesson','ପାଠ'],'learn.ex':['Example','ଉଦାହରଣ'],
'learn.terms':['Key words','ମୁଖ୍ୟ ଶବ୍ଦ'],
'learn.practice':['Practise this lesson','ଏହି ପାଠ ଅଭ୍ୟାସ କର'],
'learn.ask':['Ask about this','ଏହି ବିଷୟରେ ପଚାର'],
'learn.before':['Learn first','ଆଗରୁ ଶିଖ'],
'learn.locked':['This lesson is not on this phone.','ଏହି ପାଠ ଏହି ଫୋନ୍‌ରେ ନାହିଁ।'],
'learn.locked.sub':['Download the pack when you have a good signal. Then it works offline.','ଭଲ ସିଗ୍ନାଲ୍ ଥିଲେ ପ୍ୟାକ୍ ଡାଉନଲୋଡ୍ କର। ତା’ପରେ ଅଫଲାଇନ୍ ଚାଲିବ।'],
'learn.dl':['Download pack','ପ୍ୟାକ୍ ଡାଉନଲୋଡ୍ କର'],
'learn.page':['Textbook: {ch}','ପାଠ୍ୟବହି: {ch}'],
'learn.alt':['Shown as an example because the lesson did not click yet.','ପାଠ ବୁଝାପଡ଼ି ନଥିବାରୁ ଉଦାହରଣ ଦେଖାଯାଉଛି।'],
'prac.title':['Practice','ଅଭ୍ୟାସ'],
'prac.empty':['Ready to practise?','ଅଭ୍ୟାସ ପାଇଁ ପ୍ରସ୍ତୁତ?'],
'prac.empty.sub':['Saarthi will choose the questions that help you most.','ସାରଥି ତୁମକୁ ସବୁଠାରୁ ସାହାଯ୍ୟ କରୁଥିବା ପ୍ରଶ୍ନ ବାଛିବ।'],
'prac.q':['Question {n}','ପ୍ରଶ୍ନ {n}'],
'prac.skip':['Skip','ଛାଡ଼'],
'prac.correct':['Correct! Well done.','ଠିକ୍! ବହୁତ ଭଲ।'],
'prac.wrong':['Not quite.','ଠିକ୍ ହେଲା ନାହିଁ।'],
'prac.next':['What next?','ଏହା ପରେ କ’ଣ?'],
'prac.cont':['Continue','ଆଗକୁ ଚାଲ'],
'prac.stop':['Stop for now','ଏବେ ବନ୍ଦ କର'],
'prac.why':['Why this question','ଏହି ପ୍ରଶ୍ନ କାହିଁକି'],
'prac.concept':['Lesson','ପାଠ'],'prac.level':['Level','ସ୍ତର'],'prac.mastery':['Where you are','ତୁମେ କେଉଁଠି'],
'prac.saved':['Saved on this phone','ଏହି ଫୋନ୍‌ରେ ସଂରକ୍ଷିତ'],
'prac.session':['This session','ଏହି ଅଧିବେଶନ'],
'ask.title':['Ask a doubt','ପ୍ରଶ୍ନ ପଚାର'],
'ask.sub':['Type in Odia, in English letters, or mix both.','ଓଡ଼ିଆରେ, ଇଂରାଜୀ ଅକ୍ଷରରେ, ବା ଦୁଇଟି ମିଶାଇ ଲେଖ।'],
'ask.ph':['Type your doubt here…','ଏଠି ତୁମ ପ୍ରଶ୍ନ ଲେଖ…'],
'ask.send':['Ask','ପଚାର'],
'ask.voice':['Voice (needs signal, coming soon)','ଭଏସ୍ (ସିଗ୍ନାଲ୍ ଦରକାର, ଶୀଘ୍ର ଆସୁଛି)'],
'ask.try':['Try asking','ଏହା ପଚାରି ଦେଖ'],
'ask.ex1':['What is matter?','ପଦାର୍ଥ କ’ଣ?'],'ask.ex2':['ghana-twana kana?','ଘନତ୍ୱ କାହାକୁ କହନ୍ତି?'],'ask.ex3':['difference between speed and velocity','ଦ୍ରୁତି ଓ ବେଗ ମଧ୍ୟରେ ପାର୍ଥକ୍ୟ'],'ask.ex4':['tishu kana?','ଟିସ୍ୟୁ କ’ଣ?'],
'ask.lbl.full':['Answer from your textbook','ତୁମ ପାଠ୍ୟବହିରୁ ଉତ୍ତର'],
'ask.lbl.basic':['Basic answer (saved lessons)','ସାଧାରଣ ଉତ୍ତର (ସଂରକ୍ଷିତ ପାଠ)'],
'ask.lbl.server':['Answer from the server','ସର୍ଭରରୁ ଉତ୍ତର'],
'ask.out':['This is outside the lessons I have. Try one of these:','ଏହା ମୋ ପାଖରେ ଥିବା ପାଠ ବାହାରେ। ଏଥିମଧ୍ୟରୁ ପଚାର:'],
'ask.nopack':['That topic needs a pack that is not on this phone. Download it on a good signal.','ସେହି ବିଷୟ ପାଇଁ ଏକ ପ୍ୟାକ୍ ଦରକାର ଯାହା ଏହି ଫୋନ୍‌ରେ ନାହିଁ। ଭଲ ସିଗ୍ନାଲ୍‌ରେ ଡାଉନଲୋଡ୍ କର।'],
'ask.weaknote':['The signal is weak, so this answer came from lessons saved on your phone.','ସିଗ୍ନାଲ୍ ଦୁର୍ବଳ, ତେଣୁ ଏହି ଉତ୍ତର ଫୋନ୍‌ରେ ସଂରକ୍ଷିତ ପାଠରୁ ଆସିଲା।'],
'ask.offnote':['You are offline. This answer came from lessons saved on your phone.','ତୁମେ ଅଫଲାଇନ୍। ଏହି ଉତ୍ତର ଫୋନ୍‌ରେ ସଂରକ୍ଷିତ ପାଠରୁ ଆସିଲା।'],
'ask.more':['Open the lesson','ପାଠ ଖୋଲ'],
'ask.example':['Example','ଉଦାହରଣ'],
'ask.src':['Where this came from','ଏହା କେଉଁଠୁ ଆସିଲା'],
'ask.how':['How Saarthi answered','ସାରଥି କିପରି ଉତ୍ତର ଦେଲା'],
'ask.empty':['Your answers will appear here.','ତୁମର ଉତ୍ତର ଏଠି ଦେଖାଯିବ।'],
'ask.chunk':['Passage','ଅଂଶ'],
'prog.title':['My progress','ମୋ ଅଗ୍ରଗତି'],
'prog.sub':['Colours show how well you know each lesson. No scores, no ranking.','ରଙ୍ଗ ଦେଖାଏ ତୁମେ ପ୍ରତ୍ୟେକ ପାଠ କେତେ ଜାଣ। ନମ୍ବର ନାହିଁ, ର‌୍ୟାଙ୍କ ନାହିଁ।'],
'prog.legend':['Key','ସଙ୍କେତ'],
'prog.after':['Needs: {c}','ଆଗରୁ ଦରକାର: {c}'],
'prog.tried':['{n} tries','{n} ଥର ଚେଷ୍ଟା'],
'prog.open':['Open','ଖୋଲ'],
'pack.title':['Downloads','ଡାଉନଲୋଡ୍'],
'pack.sub':['Lessons saved on this phone work without internet.','ଫୋନ୍‌ରେ ସଂରକ୍ଷିତ ପାଠ ଇଣ୍ଟରନେଟ୍ ବିନା ଚାଲେ।'],
'pack.storage':['Phone storage free: about {n} MB','ଫୋନ୍‌ରେ ଖାଲି ସ୍ଥାନ: ପ୍ରାୟ {n} MB'],
'pack.inst':['Installed (v{v})','ସ୍ଥାପିତ (v{v})'],
'pack.upd':['Update available: v{a} to v{b}','ନୂଆ ସଂସ୍କରଣ: v{a} ରୁ v{b}'],
'pack.none':['Not on this phone','ଏହି ଫୋନ୍‌ରେ ନାହିଁ'],
'pack.get':['Download','ଡାଉନଲୋଡ୍'],'pack.update':['Update','ଅପଡେଟ୍'],
'pack.part':['Part {a} of {b}','ଅଂଶ {a} / {b}'],
'pack.paused':['Paused: waiting for signal. It will resume from the same part.','ବିରତ: ସିଗ୍ନାଲ୍ ଅପେକ୍ଷା। ସେହି ଅଂଶରୁ ପୁଣି ଆରମ୍ଭ ହେବ।'],
'pack.verify':['Checking the file…','ଫାଇଲ୍ ଯାଞ୍ଚ ହେଉଛି…'],
'pack.done':['Pack ready: {p}','ପ୍ୟାକ୍ ପ୍ରସ୍ତୁତ: {p}'],
'pack.fail':['Download failed. Try again on a good signal.','ଡାଉନଲୋଡ୍ ବିଫଳ ହେଲା। ଭଲ ସିଗ୍ନାଲ୍‌ରେ ପୁଣି ଚେଷ୍ଟା କର।'],
'pack.auto':['Let Saarthi download the pack on a good signal','ଭଲ ସିଗ୍ନାଲ୍‌ରେ ସାରଥି ପ୍ୟାକ୍ ନିଜେ ଡାଉନଲୋଡ୍ କରୁ'],
'pack.auto.note':['Only when online and storage is above 150 MB.','କେବଳ ଅନଲାଇନ୍ ଥିଲେ ଓ ଖାଲି ସ୍ଥାନ 150 MB ଉପରେ ଥିଲେ।'],
'pack.how':['The file is checked against its checksum after download, so a broken download is never used.','ଡାଉନଲୋଡ୍ ପରେ ଫାଇଲ୍ ଚେକସମ୍ ସହ ମିଳାଯାଏ, ତେଣୁ ଖରାପ ଫାଇଲ୍ କେବେ ବ୍ୟବହାର ହୁଏ ନାହିଁ।'],
'pack.main':['Class 9 Science (Odia)','ନବମ ଶ୍ରେଣୀ ବିଜ୍ଞାନ (ଓଡ଼ିଆ)'],
'pack.needsig':['Needs a signal to download','ଡାଉନଲୋଡ୍ ପାଇଁ ସିଗ୍ନାଲ୍ ଦରକାର'],
'syn.title':['Sync','ସିଙ୍କ୍'],
'syn.sub':['Everything you do is saved on this phone first. Sync sends it to the server when the signal allows.','ତୁମେ ଯାହା କର ପ୍ରଥମେ ଏହି ଫୋନ୍‌ରେ ସଂରକ୍ଷିତ ହୁଏ। ସିଗ୍ନାଲ୍ ଥିଲେ ସିଙ୍କ୍ ତାକୁ ସର୍ଭରକୁ ପଠାଏ।'],
'syn.now':['Sync now','ଏବେ ସିଙ୍କ୍ କର'],
'syn.pending':['Waiting to send','ପଠାଇବା ବାକି'],'syn.quar':['Set aside (quarantine)','ଅଲଗା ରଖାଯାଇଛି'],'syn.last':['Last sync','ଶେଷ ସିଙ୍କ୍'],'syn.cursor':['Server has up to','ସର୍ଭରରେ ଅଛି ପର୍ଯ୍ୟନ୍ତ'],
'syn.outbox':['Outbox','ଆଉଟ୍‌ବକ୍ସ'],'syn.log':['Sync history','ସିଙ୍କ୍ ଇତିହାସ'],'syn.never':['Never','କେବେ ନୁହେଁ'],
'syn.col.seq':['#','#'],'syn.col.type':['Event','ଘଟଣା'],'syn.col.state':['State','ସ୍ଥିତି'],'syn.col.reason':['Reason','କାରଣ'],'syn.col.trig':['By','ଦ୍ୱାରା'],
'syn.auto':['Auto sync','ସ୍ୱତଃ ସିଙ୍କ୍'],
'syn.auto.note':['Every 30 seconds, after each answer, and whenever the signal returns. Manual sync is always there too.','ପ୍ରତି ୩୦ ସେକେଣ୍ଡରେ, ପ୍ରତ୍ୟେକ ଉତ୍ତର ପରେ ଓ ସିଗ୍ନାଲ୍ ଫେରିଲେ। ହସ୍ତେତ୍ ସିଙ୍କ୍ ମଧ୍ୟ ରହିଛି।'],
'syn.trig.AUTO':['auto','ସ୍ୱତଃ'],'syn.trig.MANUAL':['manual','ହସ୍ତେତ୍'],'syn.trig.SIGNOUT':['on exit','ବାହାରିବାରେ'],'syn.trig.RECONNECT':['after reconnect','ପୁଣି ସଂଯୋଗରେ'],
'syn.res':['{a} saved · {d} already there · {r} set aside · {t} will retry','{a} ସଂରକ୍ଷିତ · {d} ଆଗରୁ ଥିଲା · {r} ଅଲଗା · {t} ପୁଣି ଚେଷ୍ଟା'],
'syn.fail':['Could not reach the server. Will retry quietly.','ସର୍ଭର ମିଳିଲା ନାହିଁ। ଚୁପଚାପ୍ ପୁଣି ଚେଷ୍ଟା ହେବ।'],
'syn.done':['Synced: {n} events are safe on the server.','ସିଙ୍କ୍ ହେଲା: {n} ଘଟଣା ସର୍ଭରରେ ସୁରକ୍ଷିତ।'],
'syn.offline':['You are offline. Events stay on this phone.','ତୁମେ ଅଫଲାଇନ୍। ଘଟଣାଗୁଡ଼ିକ ଫୋନ୍‌ରେ ରହିବ।'],
'agent.title':['Agent','ଏଜେଣ୍ଟ'],
'agent.sub':['See exactly how Saarthi decided your next step.','ସାରଥି ତୁମର ପରବର୍ତ୍ତୀ ପାଦ କିପରି ଠିକ୍ କଲା ଦେଖ।'],
'agent.t.trace':['Decisions','ନିଷ୍ପତ୍ତି'],'agent.t.rules':['Rules','ନିୟମ'],'agent.t.tests':['Self-tests','ସ୍ୱୟଂ-ପରୀକ୍ଷା'],'agent.t.server':['Server','ସର୍ଭର'],
'agent.how':['The planner is rule-based and runs on the phone with no network. After every sync the server recomputes the step from the event log; both engines share the same rules.','ପ୍ଲାନର୍ ନିୟମ ଆଧାରିତ ଓ ନେଟୱାର୍କ ବିନା ଫୋନ୍‌ରେ ଚାଲେ। ପ୍ରତ୍ୟେକ ସିଙ୍କ୍ ପରେ ସର୍ଭର ଘଟଣା ଲଗରୁ ପାଦ ପୁଣି ଗଣେ; ଦୁଇ ଇଞ୍ଜିନ୍ ସମାନ ନିୟମ ବ୍ୟବହାର କରନ୍ତି।'],
'agent.src.local':['phone','ଫୋନ୍'],'agent.src.server':['server','ସର୍ଭର'],
'agent.ruleset':['Ruleset','ନିୟମ ସଂସ୍କରଣ'],
'agent.none':['No decisions yet. Answer a question to see one.','ଏପର୍ଯ୍ୟନ୍ତ ନିଷ୍ପତ୍ତି ନାହିଁ। ଏକ ପ୍ରଶ୍ନର ଉତ୍ତର ଦିଅ।'],
'agent.run':['Run self-tests','ସ୍ୱୟଂ-ପରୀକ୍ଷା ଚଲାଅ'],
'agent.tests.sub':['Fixed scenarios checked against the expected action and reason. These are the shared test vectors.','ଆଶା କରାଯାଉଥିବା କାର୍ଯ୍ୟ ଓ କାରଣ ସହ ମିଳାଯାଉଥିବା ନିର୍ଦ୍ଦିଷ୍ଟ ପରିସ୍ଥିତି।'],
'agent.server.note':['Events live on the server, keyed by device and learner. Mastery is replayed from the event log, so the same events always give the same answer.','ଘଟଣାଗୁଡ଼ିକ ସର୍ଭରରେ ଡିଭାଇସ୍ ଓ ଶିକ୍ଷାର୍ଥୀ ଅନୁସାରେ ରହେ। ଘଟଣା ଲଗରୁ ଦକ୍ଷତା ପୁଣି ଗଣାଯାଏ, ତେଣୁ ସମାନ ଘଟଣାରୁ ସମାନ ଉତ୍ତର ଆସେ।'],
'agent.accepted':['Accepted events','ଗ୍ରହଣ ହୋଇଥିବା ଘଟଣା'],'agent.rejected':['Set aside events','ଅଲଗା ଘଟଣା'],
'agent.rules.order':['Rules, first match wins','ନିୟମ, ପ୍ରଥମ ମେଳ ଜିତେ'],
'set.title':['Settings','ସେଟିଂସ୍'],
'set.account':['Account','ଖାତା'],'set.acc.id':['ID','ID'],'set.acc.role':['Role','ଭୂମିକା'],'set.acc.learner':['Server learner','ସର୍ଭର ଶିକ୍ଷାର୍ଥୀ'],
'set.lang':['Language','ଭାଷା'],'set.lang.note':['Every word on screen changes, including lessons and questions.','ପର୍ଦ୍ଦାର ପ୍ରତ୍ୟେକ ଶବ୍ଦ ବଦଳିଯାଏ, ପାଠ ଓ ପ୍ରଶ୍ନ ସମେତ।'],
'set.num':['Numbers','ସଂଖ୍ୟା'],'set.num.or':['Odia ୧ ୨ ୩','ଓଡ଼ିଆ ୧ ୨ ୩'],'set.num.la':['Latin 1 2 3','ଲାଟିନ୍ 1 2 3'],
'set.size':['Text size','ଅକ୍ଷର ଆକାର'],'set.size.s':['Normal','ସାଧାରଣ'],'set.size.m':['Large','ବଡ଼'],'set.size.l':['Extra large','ଅତି ବଡ଼'],
'set.theme':['Appearance','ଦେଖଣା'],'set.theme.auto':['Auto','ସ୍ୱତଃ'],'set.theme.light':['Light','ଉଜ୍ଜ୍ୱଳ'],'set.theme.dark':['Dark','ଅନ୍ଧାର'],
'set.priv':['Your data','ତୁମର ତଥ୍ୟ'],
'set.priv1':['Stored: a name, your language, and what you answered.','ରଖାଯାଏ: ନାମ, ଭାଷା, ଓ ତୁମ ଉତ୍ତରଗୁଡ଼ିକ।'],
'set.priv2':['Never stored: phone number, location, contacts.','କେବେ ରଖାଯାଏ ନାହିଁ: ଫୋନ୍ ନମ୍ବର, ଅବସ୍ଥାନ, କଣ୍ଟାକ୍ଟ।'],
'set.priv3':['This demo uses made-up learners only. No real student data.','ଏହି ଡେମୋରେ କେବଳ କାଳ୍ପନିକ ଶିକ୍ଷାର୍ଥୀ ଅଛନ୍ତି। ପ୍ରକୃତ ଛାତ୍ରଛାତ୍ରୀଙ୍କ ତଥ୍ୟ ନାହିଁ।'],
'set.about':['About this build','ଏହି ସଂସ୍କରଣ ବିଷୟରେ'],
'set.about1':['An offline-first MVP connected to the SAARTHI backend. Lessons, sync, decisions and doubts run against the real API.','ଏକ ଅଫଲାଇନ୍-ପ୍ରଥମ MVP ଯାହା ସାରଥି ସର୍ଭର ସହ ଯୁକ୍ତ। ପାଠ, ସିଙ୍କ୍, ନିଷ୍ପତ୍ତି ଓ ପ୍ରଶ୍ନ ପ୍ରକୃତ API ସହ ଚାଲେ।'],
'set.lim':['Known limits','ଜଣାଥିବା ସୀମା'],
'set.lim1':['Passwords for this demo live on this device only (hashed). Voice is not built. Doubts offline are extractive.','ଏହି ଡେମୋର ପାସୱାର୍ଡ କେବଳ ଏହି ଡିଭାଇସ୍‌ରେ (ଏନ୍‌କ୍ରିପ୍ଟ ହୋଇ) ରହେ। ଭଏସ୍ ତିଆରି ହୋଇନି। ଅଫଲାଇନ୍ ପ୍ରଶ୍ନର ଉତ୍ତର ପାଠରୁ ଉଠାଯାଏ।'],
'set.reset':['Reset demo data','ଡେମୋ ତଥ୍ୟ ପୁନଃସେଟ୍ କର'],'set.reset.q':['Erase all demo data on this device (accounts stay on the server)?','ଏହି ଡିଭାଇସ୍‌ର ସମସ୍ତ ଡେମୋ ତଥ୍ୟ ଲିଭାଇବ (ଖାତା ସର୍ଭରରେ ରହିବ)?'],
'set.access':['Reading and comfort','ପଢ଼ିବା ଓ ଆରାମ'],
'tch.title':['Class view','ଶ୍ରେଣୀ ଦୃଶ୍ୟ'],'tch.badge':['Preview','ପ୍ରିଭ୍ୟୁ'],
'tch.sub':['See which lessons need help across the class, so you can give personal attention.','ଶ୍ରେଣୀରେ କେଉଁ ପାଠରେ ସାହାଯ୍ୟ ଦରକାର ଦେଖ, ଯେପରି ବ୍ୟକ୍ତିଗତ ଧ୍ୟାନ ଦେଇପାରିବ।'],
'tch.attn':['Needs attention','ଧ୍ୟାନ ଦରକାର'],'tch.mis':['Common mix-ups','ସାଧାରଣ ଭୁଲ ବୁଝାମଣା'],'tch.stud':['Learner','ଶିକ୍ଷାର୍ଥୀ'],
'tch.sample':['Sample class plus learners on this phone','ନମୁନା ଶ୍ରେଣୀ ସହ ଏହି ଫୋନ୍‌ର ଶିକ୍ଷାର୍ଥୀ'],
 'tch.flag.help':['asked for teacher help','ଶିକ୍ଷକ ସାହାଯ୍ୟ ଦରକାର'],'tch.flag.weak':['{n} weak lessons','{n} ଟି ଦୁର୍ବଳ ପାଠ'],
 'tch.mis.n':['{n} learners','{n} ଜଣ ଶିକ୍ଷାର୍ଥୀ'],
 'mis.distance_displacement_swap':['Mixes up distance and displacement','ଦୂରତା ଓ ସ୍ଥାନାନ୍ତର ଗୋଳମାଳ କରନ୍ତି'],
 'mis.multiply_instead':['Multiplies instead of dividing for speed','ଦ୍ରୁତିରେ ଭାଗ ବଦଳରେ ଗୁଣନ କରନ୍ତି'],
 'mis.membrane_nucleus_swap':['Mixes up cell membrane and nucleus','କୋଷଝିଲ୍ଲୀ ଓ ନିଉକ୍ଳିୟସ୍ ଗୋଳମାଳ କରନ୍ତି'],
'cmd.title':['Quick jump','ଶୀଘ୍ର ଯାଅ'],'cmd.none':['No match','କିଛି ମିଳିଲା ନାହିଁ'],
'cmd.go':['Go to {x}','{x} କୁ ଯାଅ'],'cmd.lang':['Switch language','ଭାଷା ବଦଳାଅ'],'cmd.off':['Go offline (demo)','ଅଫଲାଇନ୍ ଯାଅ (ଡେମୋ)'],'cmd.on':['Go online (demo)','ଅନଲାଇନ୍ ଯାଅ (ଡେମୋ)'],'cmd.sync':['Sync now','ଏବେ ସିଙ୍କ୍ କର'],
'ev.lesson_opened':['Lesson opened','ପାଠ ଖୋଲାଗଲା'],'ev.mcq_answered':['Answer','ଉତ୍ତର'],'ev.doubt_asked':['Doubt asked','ପ୍ରଶ୍ନ ପଚରାଗଲା'],'ev.pack_installed':['Pack installed','ପ୍ୟାକ୍ ସ୍ଥାପିତ'],
'ev.SESSION_STARTED':['Session started','ଅଧିବେଶନ ଆରମ୍ଭ'],'ev.SESSION_ENDED':['Session ended','ଅଧିବେଶନ ଶେଷ'],'ev.CONTENT_VIEWED':['Lesson viewed','ପାଠ ଦେଖାଗଲା'],
'ev.ANSWER_SUBMITTED':['Answer','ଉତ୍ତର'],'ev.QUESTION_ABANDONED':['Question skipped','ପ୍ରଶ୍ନ ଛଡ଼ାଗଲା'],'ev.DOUBT_ASKED':['Doubt asked','ପ୍ରଶ୍ନ ପଚରାଗଲା'],
'ev.DOUBT_ANSWERED':['Doubt answered','ପ୍ରଶ୍ନର ଉତ୍ତର'],'ev.PACK_INSTALLED':['Pack installed','ପ୍ୟାକ୍ ସ୍ଥାପିତ'],'ev.NETWORK_STATE_CHANGED':['Network changed','ନେଟୱାର୍କ ବଦଳିଲା'],
'out.PENDING':['waiting','ଅପେକ୍ଷା'],
'weekly.none':['No learning yet','ଏପର୍ଯ୍ୟନ୍ତ ଶିଖା ହୋଇନି']
};
CHAPTERS.forEach(c=>{D['ch.'+c.id]=[c.t.en,c.t.or]});
function t(k,v){const e=D[k];let s=e?(e[LANG==='or'?1:0]||e[0]):k;if(v)for(const x in v)s=s.split('{'+x+'}').join(v[x]);return s}
const L=o=>o&&typeof o==='object'?(o[LANG]||o.en||Object.values(o)[0]):o;
const ODIGIT='୦୧୨୩୪୫୬୭୮୯';
let ODIA_NUM=true;
const N=n=>{const s=String(n);return(LANG==='or'&&ODIA_NUM)?s.replace(/\d/g,d=>ODIGIT[d]):s};
const tn=(k,v)=>{const o={};if(v)for(const x in v)o[x]=typeof v[x]==='number'?N(v[x]):v[x];return t(k,o)};

/* ================= curriculum maps ================= */
const CMAP={};CONCEPTS.forEach((c,i)=>{c.ord=i;c.pack=PACK.id;CMAP[c.id]=c});
const CHMAP={};CHAPTERS.forEach(c=>CHMAP[c.id]=c);
const csent=(c)=>c.s;
const splitSents=txt=>String(txt||'').split(/(?<=।)/).map(s=>s.trim()).filter(Boolean);

/* ================= ruleset (mirrors packages/ruleset/rules.json) ================= */
const RULES={version:'1.0.0',bkt_version:'1',
 bkt:{p_init_bp:2000,learn:0.15,slip:0.10,guess:0.20,clamp_bp:[100,9900],rounding:'half_up'},
 bands:{weak_below_bp:4000,mastered_at_bp:8500},guard:{attempts_without_gain:3,min_gain_bp:200},
 network:{online:{rtt_ms_max:800,downlink_kbps_min:400},weak:{rtt_ms_max:3000,downlink_kbps_min:50},probe_interval_s:30,probe_timeout_s:3},
 prefetch:{min_free_mb:150,battery_saver_blocks:true},sync:{batch_size:100,backoff_s:[5,15,60,300]},
 doubt:{max_tool_calls:3,budget_s:12,top_k:4},auth:{access_ttl_h:24,refresh_ttl_d:30}};
const ACTIONS=['REMEDIATE','RETRY','REVISE','ADVANCE'];
const DELIVERIES=['cached','rich','prefetch_then_offline'];
const RULE_TABLE=[
 [0,'State invalid or ruleset unknown','RETRY / ADVANCE','STATE_INVALID_FALLBACK'],
 [1,'No mastery rows yet','ADVANCE','COLD_START'],
 [2,'3+ graded answers without a 200 bp gain (guard): example, then weakest prerequisite, then ask a teacher','REVISE / REMEDIATE','NO_GAIN_ALT_CONTENT, NO_GAIN_REMEDIATE_PREREQ, INTERVENTIONS_EXHAUSTED'],
 [3,'p < 4000 and a prerequisite < 4000','REMEDIATE','WEAK_PREREQ_GAP'],
 [4,'p < 4000','REMEDIATE','WEAK_CONCEPT'],
 [5,'4000 ≤ p < 8500, last answer wrong','RETRY','WRONG_RETRY'],
 [6,'4000 ≤ p < 8500, last answer right','RETRY','PARTIAL_PRACTICE'],
 [7,'p ≥ 8500','ADVANCE / REVISE / REMEDIATE','MASTERED_ADVANCE, SLICE_COMPLETE, BLOCKED_BY_PREREQ']];

/* ================= mastery model (integer basis points) ================= */
function bktUpdate(pbp,correct){
 const p=pbp/10000,{learn,slip,guess}=RULES.bkt;
 const post=correct?p*(1-slip)/(p*(1-slip)+(1-p)*guess):p*slip/(p*slip+(1-p)*(1-guess));
 let nx=post+(1-post)*learn;nx=Math.min(RULES.bkt.clamp_bp[1]/10000,Math.max(RULES.bkt.clamp_bp[0]/10000,nx));
 return Math.floor(nx*10000+0.5);
}
const bandOf=p=>p<RULES.bands.weak_below_bp?'w':p<RULES.bands.mastered_at_bp?'p':'m';
const newRow=()=>({p_bp:RULES.bkt.p_init_bp,attempts:0,correct:0,cycle_attempts:0,cycle_base_bp:RULES.bkt.p_init_bp,alt_shown:false,last_seen:0});
const newSt=()=>({mastery:{},last_graded:null,doubt_hint:null,abandoned:0,seen:{}});
function applyEvent(st,ev,regrade){
 const pl=ev.payload||{};
 switch(ev.type){
  case 'ANSWER_SUBMITTED':{
   if(st.seen[pl.attempt_id])return{effect:'none',reason:'REPEAT_SUBMISSION'};
   const q=QB[pl.question_id];
   if(!q||pl.revision!==1)return{effect:'none',reason:'LEGACY_QUESTION'};
   st.seen[pl.attempt_id]=1;
   const correct=regrade?(pl.response===q.a):!!pl.correct_claim;
   const row=st.mastery[q.c]||(st.mastery[q.c]=newRow());
   row.p_bp=bktUpdate(row.p_bp,correct);row.attempts++;if(correct)row.correct++;row.last_seen=ev.seq;row.cycle_attempts++;
   if(row.p_bp-row.cycle_base_bp>=RULES.guard.min_gain_bp){row.cycle_base_bp=row.p_bp;row.cycle_attempts=0;row.alt_shown=false}
   st.last_graded={concept:q.c,correct};
   return{effect:'mastery_updated',reason:null,mismatch:!!regrade&&correct!==!!pl.correct_claim};
  }
  case 'CONTENT_VIEWED':if(pl.format==='example'&&st.mastery[pl.concept])st.mastery[pl.concept].alt_shown=true;return{effect:'none'};
  case 'DOUBT_ASKED':st.doubt_hint=pl.concept||null;return{effect:'none'};
  case 'QUESTION_ABANDONED':st.abandoned=(st.abandoned||0)+1;return{effect:'none'};
  default:return{effect:'none'};
 }
}

/* ================= deterministic planner (no LLM, no network) ================= */
const neighbors=id=>{const c=CMAP[id];const o=new Set(c.pre);CONCEPTS.forEach(x=>{if(x.pre.includes(id))o.add(x.id)});return[...o]};
function nearestInstalled(from,inst,P){
 const seen=new Set([from]);let layer=[from];
 while(layer.length){
  const nx=[];layer.forEach(id=>neighbors(id).forEach(n=>{if(!seen.has(n)){seen.add(n);nx.push(n)}}));
  nx.sort((a,b)=>CMAP[a].ord-CMAP[b].ord);
  for(const n of nx)if(inst[CMAP[n].pack])return n;
  layer=nx;
 }
 const any=CONCEPTS.filter(c=>inst[c.pack]).sort((a,b)=>P(a.id)-P(b.id)||a.ord-b.ord)[0];
 return any?any.id:null;
}
function plan(ctx){
 const M=ctx.mastery,P=id=>M[id]?M[id].p_bp:RULES.bkt.p_init_bp,W=RULES.bands.weak_below_bp,MS=RULES.bands.mastered_at_bp;
 if(!Object.keys(M).length){const c=CONCEPTS.find(c=>!c.pre.length);return{rule:1,action:'ADVANCE',target:c.id,reason:'COLD_START'}}
 let T=(ctx.last_graded&&ctx.last_graded.concept)||ctx.doubt_hint;
 if(!T||!CMAP[T]){
  const cand=CONCEPTS.filter(c=>c.pre.every(q=>P(q)>=MS)).sort((a,b)=>P(a.id)-P(b.id)||a.ord-b.ord);
  T=(cand[0]||CONCEPTS[0]).id;
 }
 const c=CMAP[T],row=M[T],p=P(T);
 const weakest=ids=>ids.slice().sort((a,b)=>P(a)-P(b)||CMAP[a].ord-CMAP[b].ord)[0];
 if(row&&p<MS&&row.cycle_attempts>=RULES.guard.attempts_without_gain&&p-row.cycle_base_bp<RULES.guard.min_gain_bp){
  if(!row.alt_shown)return{rule:2,action:'REVISE',target:T,reason:'NO_GAIN_ALT_CONTENT',alt:true};
  const unmet=c.pre.filter(q=>P(q)<MS);
  if(unmet.length)return{rule:2,action:'REMEDIATE',target:weakest(unmet),reason:'NO_GAIN_REMEDIATE_PREREQ'};
  return{rule:2,action:'REVISE',target:T,reason:'INTERVENTIONS_EXHAUSTED',needs_help:true};
 }
 if(p<W&&c.pre.some(q=>P(q)<W))return{rule:3,action:'REMEDIATE',target:weakest(c.pre),reason:'WEAK_PREREQ_GAP'};
 if(p<W)return{rule:4,action:'REMEDIATE',target:T,reason:'WEAK_CONCEPT'};
 if(p<MS){const lg=ctx.last_graded;const wrong=lg&&lg.concept===T&&!lg.correct;
  return wrong?{rule:5,action:'RETRY',target:T,reason:'WRONG_RETRY'}:{rule:6,action:'RETRY',target:T,reason:'PARTIAL_PRACTICE'}}
 const next=CONCEPTS.find(x=>P(x.id)<MS&&x.pre.every(q=>P(q)>=MS));
 if(next)return{rule:7,action:'ADVANCE',target:next.id,reason:'MASTERED_ADVANCE'};
 const notM=CONCEPTS.filter(x=>P(x.id)<MS);
 if(!notM.length){
  const old=CONCEPTS.slice().sort((a,b)=>((M[a.id]&&M[a.id].last_seen)||0)-((M[b.id]&&M[b.id].last_seen)||0)||a.ord-b.ord)[0];
  return{rule:7,action:'REVISE',target:old.id,reason:'SLICE_COMPLETE'};
 }
 const unmet=[];notM.forEach(x=>x.pre.forEach(q=>{if(P(q)<MS)unmet.push(q)}));
 return{rule:7,action:'REMEDIATE',target:weakest(unmet),reason:'BLOCKED_BY_PREREQ'};
}
function fallbackDecision(ctx){
 const lg=ctx&&ctx.last_graded;const has=lg&&CMAP[lg.concept];
 const target=has?lg.concept:CONCEPTS[0].id;
 return{action:has?'RETRY':'ADVANCE',target,delivery:'cached',background:[],reason:'STATE_INVALID_FALLBACK',needs_help:false,rule:0};
}
function trajectoryOk(d,ctx){
 if(!d||!CMAP[d.target]||!ACTIONS.includes(d.action)||!D['reason.'+d.reason]||!DELIVERIES.includes(d.delivery))return false;
 if(d.delivery==='cached'&&!(ctx.env.installed||{})[CMAP[d.target].pack])return false;
 return true;
}
function decideCore(ctx,lap){
 if(!ctx||ctx.ruleset_version!==RULES.version||!ctx.mastery||!ctx.env)return null;
 const env=ctx.env,net=env.network,inst=env.installed||{};
 const P=id=>ctx.mastery[id]?ctx.mastery[id].p_bp:RULES.bkt.p_init_bp;
 lap('context',{concepts_with_history:Object.keys(ctx.mastery).length,network:net,installed:inst,unsent_events:ctx.outbox_len||0});
 const pl=plan(ctx);
 lap('planner',{rule:pl.rule,action:pl.action,reason:pl.reason,target:pl.target,p_bp:P(pl.target)});
 let target=pl.target,reason=pl.reason,delivery='cached';const bg=new Set();
 const canPre=net==='online'&&(env.storage_free_mb==null||env.storage_free_mb>=RULES.prefetch.min_free_mb)&&!env.battery_saver;
 const have=!!inst[CMAP[target].pack];
 if(!have){
  if(canPre){delivery='prefetch_then_offline';bg.add('PREFETCH')}
  else{const alt=nearestInstalled(target,inst,P);if(!alt)return null;target=alt;reason='CONTENT_NOT_AVAILABLE_OFFLINE';if(net==='offline')bg.add('PREFETCH')}
 }else if(net==='online'&&env.latest[CMAP[target].pack]>(inst[CMAP[target].pack]||0))delivery='rich';
 if(canPre&&[target,...neighbors(target)].some(id=>!inst[CMAP[id].pack]))bg.add('PREFETCH');
 if((ctx.outbox_len||0)>0&&net!=='offline')bg.add('SYNC');
 const out={action:pl.action,target,delivery,background:[...bg].sort(),reason,needs_help:!!pl.needs_help,rule:pl.rule,alt:!!pl.alt};
 lap('delivery',{delivery,background:out.background,substituted:reason==='CONTENT_NOT_AVAILABLE_OFFLINE'});
 return out;
}
function decide(ctx){
 const t0=(typeof performance!=='undefined'?performance:Date).now();const steps=[];
 const lap=(stage,out)=>steps.push({stage,ms:Math.max(0,Math.round((typeof performance!=='undefined'?performance:Date).now()-t0)),out});
 let res=null;try{res=decideCore(ctx,lap)}catch(e){res=null}
 if(!res||!trajectoryOk(res,ctx)){res=fallbackDecision(ctx);lap('fallback',{reason:'STATE_INVALID_FALLBACK'})}
 else lap('trajectory_check',{ok:true});
 res.ruleset_version=RULES.version;res.steps=steps;return res;
}

/* shared self-test vectors */
const C=CONCEPTS.map(c=>c.id);
function V(m,o={}){const ms={};Object.keys(m).forEach(k=>{const v=m[k];ms[k]=typeof v==='number'?{p_bp:v,attempts:1,correct:0,cycle_attempts:0,cycle_base_bp:v,alt_shown:false,last_seen:1}:Object.assign(newRow(),v)});
 return{ruleset_version:o.rv||RULES.version,mastery:ms,last_graded:o.lg||null,doubt_hint:null,outbox_len:o.ob||0,
 env:{network:o.net||'online',storage_free_mb:o.st==null?300:o.st,battery_saver:false,installed:o.inst==null?{[PACK.id]:1}:o.inst,latest:{[PACK.id]:1}}}}
const ALLM={};C.forEach(c=>ALLM[c]=9000);
const VECTORS=[
 ['Cold start',V({}),'ADVANCE','COLD_START'],
 ['Weak concept',V({[C[2]]:3100},{lg:{concept:C[2],correct:false}}),'REMEDIATE','WEAK_CONCEPT'],
 ['Weak prerequisite',V({[C[0]]:2500,[C[1]]:3000},{lg:{concept:C[1],correct:false}}),'REMEDIATE','WEAK_PREREQ_GAP'],
 ['Partial, last wrong',V({[C[0]]:6000},{lg:{concept:C[0],correct:false}}),'RETRY','WRONG_RETRY'],
 ['Partial, last right',V({[C[0]]:6000},{lg:{concept:C[0],correct:true}}),'RETRY','PARTIAL_PRACTICE'],
 ['Mastered, move on',V({[C[0]]:9000},{lg:{concept:C[0],correct:true}}),'ADVANCE','MASTERED_ADVANCE'],
 ['No gain: show an example',V({[C[0]]:{p_bp:2100,cycle_attempts:3,cycle_base_bp:2000,alt_shown:false}},{lg:{concept:C[0],correct:false}}),'REVISE','NO_GAIN_ALT_CONTENT'],
 ['No gain: fix the prerequisite',V({[C[0]]:6000,[C[1]]:{p_bp:3000,cycle_attempts:3,cycle_base_bp:3000,alt_shown:true}},{lg:{concept:C[1],correct:false}}),'REMEDIATE','NO_GAIN_REMEDIATE_PREREQ'],
 ['No gain: ask a teacher',V({[C[0]]:{p_bp:2100,cycle_attempts:3,cycle_base_bp:2000,alt_shown:true}},{lg:{concept:C[0],correct:false}}),'REVISE','INTERVENTIONS_EXHAUSTED'],
 ['Everything mastered',V(ALLM,{lg:{concept:C[C.length-1],correct:true}}),'REVISE','SLICE_COMPLETE'],
 ['Pack missing and offline',V({[C[0]]:9000,[C[1]]:9000,[C[2]]:9000},{lg:{concept:C[2],correct:true},net:'offline',inst:{}}),'RETRY','STATE_INVALID_FALLBACK'],
 ['Unknown ruleset version',V({},{rv:'9.9.9'}),'ADVANCE','STATE_INVALID_FALLBACK']];
function runSelfTests(){
 const rows=VECTORS.map(([name,ctx,a,r])=>{const d=decide(ctx);return{name,expect:a+' · '+r,got:d.action+' · '+d.reason,ok:d.action===a&&d.reason===r}});
 const b1=bktUpdate(2000,true),b2=bktUpdate(2000,false),b3=bktUpdate(9900,true);
 rows.push({name:'Mastery update: 2000 bp, right answer',expect:'6000',got:String(b1),ok:b1===6000});
 rows.push({name:'Mastery update: 2000 bp, wrong answer',expect:'1758',got:String(b2),ok:b2===1758});
 rows.push({name:'Mastery stays within limits',expect:'≤ 9900',got:String(b3),ok:b3<=9900});
 const evs=[1,0,1,1,0,1].map((r,i)=>({seq:i+1,type:'ANSWER_SUBMITTED',payload:{attempt_id:'a'+i,question_id:C[0]+'.x',revision:1,response:r?0:1,correct_claim:!!r}})).filter(e=>QB[e.payload.question_id]);
 const s1=newSt(),s2=newSt();evs.forEach(e=>applyEvent(s1,e,true));evs.slice().reverse().concat(evs).sort((a,b)=>a.seq-b.seq).forEach(e=>applyEvent(s2,e,true));
 rows.push({name:'Replay: duplicates and shuffled delivery give the same mastery',expect:'same state',got:s1.mastery&&s2.mastery?'compared':'no questions',ok:JSON.stringify(s1.mastery)===JSON.stringify(s2.mastery)});
 return rows;
}

/* ================= backend API ================= */
const API_BASE='/api/v1';
let AUTH=ls.get('saarthi:auth')||null;   // {learner_id, device_id, token, expires_at}
const saveAuth=()=>ls.set('saarthi:auth',AUTH);
async function apiFetch(path,{method='GET',body,auth=true,headers={},raw=false}={}){
 const h=Object.assign({'Content-Type':'application/json'},headers);
 if(auth&&AUTH){h['Authorization']='Bearer '+AUTH.token;if(AUTH.device_id)h['X-Device-Id']=AUTH.device_id}
 let r;
 try{r=await fetch(API_BASE+path,{method,headers:h,body:body!=null?JSON.stringify(body):undefined})}
 catch(e){throw{status:0,network:true}}
 if(!r.ok){const err={status:r.status};try{const j=await r.json();if(j&&j.detail)err.detail=j.detail}catch(e){}throw err}
 return raw?r:r.json();
}

/* ---- device & accounts (demo credentials live on this device, hashed) ---- */
let DEV=ls.get('saarthi:device')||{device_id:null,seq:0};ls.set('saarthi:device',DEV);
let ACC=ls.get('saarthi:accounts')||[];
const saveACC=()=>ls.set('saarthi:accounts',ACC);
const hashPw=(pw,salt)=>{let h=5381;const s=salt+':'+pw;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return String(h)};
const DEMO=[
 {id:'1', role:'student',name:'Raju',  names:{en:'Raju',  or:'ରାଜୁ'},  pw:'1234'},
 {id:'2', role:'student',name:'Sunita',names:{en:'Sunita',or:'ସୁନିତା'},pw:'2345'},
 {id:'T1',role:'teacher',name:'Teacher',names:{en:'Teacher',or:'ଶିକ୍ଷକ'},pw:'teach'}];
async function serverCreateLearner(displayLabel){
 const headers=DEV.device_id?{'X-Device-Id':DEV.device_id}:{};
 const resp=await apiFetch('/learners',{method:'POST',auth:false,headers,
  body:{display_label:displayLabel,locale:'or',grade:'class9',subject:'science'}});
 if(resp.device_id){DEV.device_id=resp.device_id;ls.set('saarthi:device',DEV)}
 return resp;
}
async function serverActivate(learnerId){
 if(!DEV.device_id)throw{status:400};
 const resp=await apiFetch('/learners/'+encodeURIComponent(learnerId)+'/activate',{method:'POST',auth:false,headers:{'X-Device-Id':DEV.device_id}});
 AUTH={learner_id:resp.learner_id,device_id:resp.device_id,token:resp.device_token,expires_at:resp.token_expires_at};
 if(resp.device_id){DEV.device_id=resp.device_id;ls.set('saarthi:device',DEV)}
 saveAuth();return resp;
}
async function registerAccount(d){
 const resp=await serverCreateLearner(d.name);
 const acc={id:d.id,role:d.role||'student',name:d.name,names:d.names||{en:d.name,or:d.name},
  pw_hash:hashPw(d.pw,d.id),learner_id:resp.learner_id,created:Date.now()};
 ACC.push(acc);saveACC();
 AUTH={learner_id:resp.learner_id,device_id:resp.device_id,token:resp.device_token,expires_at:resp.token_expires_at};saveAuth();
 return acc;
}
async function seedAccounts(){
 if(ACC.length)return;
 for(const d of DEMO)await registerAccount(d);
}
async function loginAccount(acc){
 try{await serverActivate(acc.learner_id)}
 catch(e){
  if(e.status===0)throw e;
  /* server DB was reset or device lost the link: create a fresh learner and migrate local data */
  const resp=await serverCreateLearner(acc.name);
  const oldKey='saarthi:p:'+acc.learner_id,old=ls.get(oldKey);
  if(old){ls.del(oldKey);ls.set('saarthi:p:'+resp.learner_id,old)}
  acc.learner_id=resp.learner_id;saveACC();
  AUTH={learner_id:resp.learner_id,device_id:resp.device_id,token:resp.device_token,expires_at:resp.token_expires_at};saveAuth();
 }
}

/* ================= device, settings, session state ================= */
const SH_DEFAULT=()=>({installed:{},dl:{},settings:{lang:'or',odiaNum:true,size:'s',theme:'auto',net:'auto',autoPrefetch:true,autoSync:true,storage:310}});
let SH=ls.get('saarthi:shared')||SH_DEFAULT();SH.settings=Object.assign(SH_DEFAULT().settings,SH.settings||{});
const saveSH=()=>ls.set('saarthi:shared',SH);
const S={p:null,id:null,acc:null,exiting:false};

/* ---- network ---- */
function netState(){const m=SH.settings.net;if(m&&m!=='auto')return m;return(typeof navigator!=='undefined'&&navigator.onLine===false)?'offline':'online'}
function curEnv(){const n=netState();
 return{network:n,rtt_ms:n==='online'?220:n==='weak'?1400:null,downlink_kbps:n==='online'?1800:n==='weak'?120:0,storage_free_mb:SH.settings.storage,installed:Object.assign({},SH.installed),latest:{[PACK.id]:PACK.vnum},battery_saver:false}}

/* ---- profile session: the only module that touches a learner's data ---- */
const PS={
 key:id=>'saarthi:p:'+id,
 ensure(id,name){let p=ls.get(this.key(id));
  if(!p){p=Object.assign(newSt(),{id,name:name||'',created:Date.now(),outbox:[],quarantine:[],decisions:[],current:null,pending:null,qcount:{},synclog:[],days:{},lastsync:null,cursor:0});ls.set(this.key(id),p)}
  return p},
 open(id){const p=ls.get(this.key(id));if(!p)return false;S.p=p;S.id=id;return true},
 close(){S.p=null;S.id=null;S.acc=null},
 save(){if(S.p)ls.set(PS.key(S.id),S.p)}
};

/* ---- events: local apply + outbox for the backend ---- */
const SYNCABLE={CONTENT_VIEWED:'lesson_opened',ANSWER_SUBMITTED:'mcq_answered',DOUBT_ASKED:'doubt_asked',PACK_INSTALLED:'pack_installed'};
function emitLocal(type,payload){
 if(!S.p)return;
 applyEvent(S.p,{type,payload:payload||{},seq:0},false);PS.save();
}
function emit(type,payload){
 if(!S.p)return null;
 const ev={event_id:'evt_'+uuid(),device_id:DEV.device_id,learner_id:S.id,seq:++DEV.seq,type,ts:Date.now(),payload:payload||{}};
 ls.set('saarthi:device',DEV);
 applyEvent(S.p,ev,false);
 if(SYNCABLE[type])S.p.outbox.push(ev);
 if(type==='ANSWER_SUBMITTED'){const k=new Date(ev.ts).toISOString().slice(0,10);S.p.days[k]=(S.p.days[k]||0)+1}
 PS.save();scheduleAutoSync();
 return ev;
}
function toBackend(ev){
 const pl=ev.payload||{};
 const out={event_id:ev.event_id,device_id:ev.device_id,learner_id:ev.learner_id,seq:ev.seq,ts:ev.ts,event_type:SYNCABLE[ev.type],payload:{}};
 if(pl.concept)out.concept_id=pl.concept;
 if(ev.type==='ANSWER_SUBMITTED'){
  out.question_id=pl.question_id;
  out.payload={attempt_id:pl.attempt_id,selected_option:pl.response,evidence:pl.correct_claim?'correct':'incorrect',weight:1};
 }else if(ev.type==='PACK_INSTALLED'){out.payload={pack_id:pl.pack_id,version:String(pl.version)}}
 else out.payload=pl;
 return out;
}
function mkCtx(){return{ruleset_version:RULES.version,mastery:S.p.mastery,last_graded:S.p.last_graded,doubt_hint:S.p.doubt_hint,outbox_len:S.p.outbox.length,env:curEnv()}}
const envSig=()=>netState()+JSON.stringify(SH.installed)+(S.p.outbox.length>0?'1':'0');
function computeLocal(trigger){
 const d=decide(mkCtx());d.id=uuid();d.ts=Date.now();d.source='local';d.trigger=trigger;d.sig=envSig();d.net=netState();
 S.p.current=d;S.p.pending=null;S.p.decisions.unshift(d);S.p.decisions.length=Math.min(S.p.decisions.length,40);PS.save();
 setTimeout(()=>execBackground(d),0);return d;
}
function ensureDecision(){
 if(!S.p)return null;
 if(S.p.pending&&S.p.current){ /* natural break: adopt the server suggestion */
  S.p.pending.adopted=true;S.p.current=S.p.pending;S.p.pending=null;PS.save();return S.p.current}
 if(!S.p.current||S.p.current.sig!==envSig())return computeLocal(S.p.current?'ENVIRONMENT_CHANGED':'SESSION_STARTED');
 return S.p.current;
}
function mapServerDecision(d){
 if(!d)return null;
 return{id:d.decision_id,action:d.action,target:d.target_concept_id,reason:d.reason_code,delivery:d.delivery_mode,
  background:d.background_actions||[],source:'server',ts:Date.now(),steps:[],ruleset_version:d.ruleset_version,net:d.network};
}

/* ---- sync with the real backend ---- */
let syncing=false,backoffIdx=0,backoffTimer=null,autoTimer=null;
const UI={render:()=>{},toast:()=>{}};
async function doSync(manual){
 if(syncing||!S.p)return;
 const trigger=manual?'MANUAL':(S.exiting?'SIGNOUT':'AUTO');
 if(netState()==='offline'){if(manual)UI.toast(t('syn.offline'));return}
 if(!S.p.outbox.length){if(manual)UI.toast(t('sync.saved'));return}
 if(!AUTH)return;
 syncing=true;UI.render();
 try{
  while(S.p&&S.p.outbox.length){
   const batch=S.p.outbox.slice().sort((a,b)=>a.seq-b.seq).slice(0,RULES.sync.batch_size);
   let resp;
   try{resp=await apiFetch('/sync',{method:'POST',body:{device_id:DEV.device_id,learner_id:S.id,from_seq:S.p.cursor||0,events:batch.map(toBackend)}})}
   catch(e){
    S.p.synclog.unshift({ts:Date.now(),n:batch.length,status:'FAIL',trigger});S.p.synclog.length=Math.min(S.p.synclog.length,15);PS.save();
    UI.toast(t('syn.fail'));
    if(e.status===401){try{await loginAccount(S.acc||{learner_id:S.id,name:''});backoffIdx=0;continue}catch(e2){}}
    if(!manual&&SH.settings.autoSync){
     const wait=RULES.sync.backoff_s[Math.min(backoffIdx++,RULES.sync.backoff_s.length-1)]*1000*(0.8+Math.random()*0.4);
     clearTimeout(backoffTimer);backoffTimer=setTimeout(()=>doSync(false),wait);
    }
    break;
   }
   backoffIdx=0;applyServer(resp,batch,trigger);
  }
 }finally{syncing=false;UI.render()}
}
function applyServer(resp,batch,trigger){
 const p=S.p,cnt={ACCEPTED:0,DUPLICATE:0,REJECTED:0,RETRYABLE:0};
 const byId={};(resp.accepted||[]).forEach(r=>byId[r.event_id]=r);
 const keep=[];
 p.outbox.forEach(ev=>{
  const r=byId[ev.event_id];if(!r){keep.push(ev);return}
  const o=String(r.outcome||'').toUpperCase();cnt[o]=(cnt[o]||0)+1;
  if(o==='RETRYABLE')keep.push(ev);
  else if(o==='REJECTED')p.quarantine.push({event:ev,reason:r.detail||'REJECTED',ts:Date.now()});
 });
 p.outbox=keep;
 /* rebase: take the server's canonical mastery, then re-apply events created after the upload */
 const rows=resp.canonical_mastery||[];
 if(rows.length){
  const nm={};rows.forEach(m=>{const bp=Math.round((m.p_known==null?0.4:m.p_known)*10000);
   nm[m.concept_id]={p_bp:bp,attempts:m.attempts||0,correct:m.correct||0,cycle_attempts:0,cycle_base_bp:bp,alt_shown:false,last_seen:m.last_updated_event_seq||0}});
  p.mastery=nm;
 }
 p.outbox.slice().sort((a,b)=>a.seq-b.seq).forEach(ev=>applyEvent(p,ev,false));
 p.cursor=resp.server_learner_seq||p.cursor;p.lastsync=Date.now();
 p.synclog.unshift({ts:Date.now(),n:batch.length,status:'OK',cnt,trigger});p.synclog.length=Math.min(p.synclog.length,15);
 if(resp.next_decision){
  const sd=mapServerDecision(resp.next_decision);
  if(sd){sd.trigger='SYNC';sd.net=netState();sd.sig=envSig();p.pending=sd}
 }
 PS.save();
 UI.toast(t('syn.done',{n:N(cnt.ACCEPTED+cnt.DUPLICATE+cnt.REJECTED)}));
}

/* ---- auto sync: after each answer (debounced), every 30 s, on reconnect, on return ---- */
function scheduleAutoSync(){if(!S.p||!SH.settings.autoSync)return;clearTimeout(autoTimer);autoTimer=setTimeout(()=>{if(S.p&&!syncing)doSync(false)},4000)}
setInterval(()=>{if(S.p&&SH.settings.autoSync&&!syncing)doSync(false)},30*1000);

/* ---- background actions the agent performs by itself ---- */
function execBackground(d){
 if(!S.p||!d)return;
 if(d.background.includes('SYNC')&&!syncing&&netState()!=='offline')setTimeout(()=>doSync(false),1200);
 if(d.background.includes('PREFETCH'))autoPrefetch(d);
}
function autoPrefetch(d){
 if(!SH.settings.autoPrefetch||netState()!=='online'||SH.dl[PACK.id]!=null)return;
 if(!SH.installed[PACK.id]){startDL(PACK.id);UI.toast(t('home.in.pack',{p:t('pack.main')}))}
}
function startDL(id){
 if(SH.dl[id]!=null)return;
 if(!AUTH){UI.toast(t('pack.needsig'));return}
 SH.dl[id]=0;saveSH();render();
 realDownload(id);
}
async function realDownload(id){
 try{
  const r=await apiFetch('/packs/'+encodeURIComponent(id)+'/versions/'+encodeURIComponent(PACK.version)+'/download',{raw:true});
  const buf=await r.arrayBuffer();
  const u8=new Uint8Array(buf);
  /* integrity: valid gzip stream, non-trivial size, and identical to the
     first verified download of this version (manifest checksum covers the
     canonical JSON payload, not the served archive, so it can't be used here) */
  if(u8.length<1000||u8[0]!==0x1f||u8[1]!==0x8b)throw{message:'corrupt'};
  const hex=await sha256Hex(buf);
  const stamp=ls.get('saarthi:packhash')||{};
  if(stamp[id+'@'+PACK.version]&&stamp[id+'@'+PACK.version]!==hex)throw{message:'tampered'};
  stamp[id+'@'+PACK.version]=hex;ls.set('saarthi:packhash',stamp);
  SH.installed[id]=PACK.vnum;delete SH.dl[id];saveSH();
  if(S.p){emit('PACK_INSTALLED',{pack_id:id,version:PACK.vnum});S.p.current=null}
  UI.toast(t('pack.done',{p:t('pack.main')}));
 }catch(e){delete SH.dl[id];saveSH();UI.toast(t('pack.fail'))}
 render();
}
async function sha256Hex(buf){
 const d=await crypto.subtle.digest('SHA-256',buf);
 return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
/* progress animation while the real download is in flight */
let dlTick=0,dlBusyPrev=false;
setInterval(()=>{
 const id=Object.keys(SH.dl)[0];
 const busy=id!=null;
 if(!busy){if(dlBusyPrev){dlBusyPrev=false;if(R.role&&['packs','home','learn'].includes(R.route))render()}return}
 const n=netState();
 if(n!=='offline'){dlTick++;if(n!=='weak'||dlTick%3===0){if(SH.dl[id]<8){SH.dl[id]++;saveSH()}}}
 if(R.role&&['packs','home','learn'].includes(R.route))render();
},700);

/* ---- local retrieval for offline doubts ---- */
const STOP=new Set(['ଓ','ଏବଂ','ମଧ୍ୟରେ','ପାଇଁ','କେତେ','କିପରି','କିଏ','କେଉଁ','କଣ','ଅଟେ','ହେଉଛି','କୁହ']);
const normQ=q=>q.normalize('NFC').replace(/[\u0B66-\u0B6F]/g,d=>String(d.charCodeAt(0)-0x0B66)).toLowerCase().replace(/[’']/g,' ');
const oTok=s=>(s.match(/[\u0B00-\u0B7F]+/g)||[]).filter(w=>w.length>=2&&!STOP.has(w));
const gramsOf=tk=>{const o=[];tk.forEach(w=>{if(w.length<=3)o.push(w);else for(let i=0;i<=w.length-3;i++)o.push(w.slice(i,i+3))});return o};
const DOCS=CHUNKS.map(k=>{const tk=oTok(k.text);const g=gramsOf(tk);return{id:k.id,c:k.c,pack:PACK.id,g,set:new Set(g)}});
function glossHits(raw){
 const q=normQ(raw);
 return GL.filter(g=>[g.or].some(f=>f&&q.includes(f))||[g.en].some(f=>f&&f.length>=3&&new RegExp('(^|[^a-z])'+f.replace(/ /g,'\\s+')).test(q)));
}
function bm25(qg){
 const N_=DOCS.length,avg=DOCS.reduce((a,d)=>a+d.g.length,0)/N_,k1=1.2,bb=0.75;
 return DOCS.map(d=>{let s=0;qg.forEach(g=>{const df=DOCS.filter(x=>x.set.has(g)).length;if(!df)return;
  const tf=d.g.filter(x=>x===g).length;const idf=Math.log(1+(N_-df+0.5)/(df+0.5));s+=idf*tf*(k1+1)/(tf+k1*(1-bb+bb*d.g.length/avg))});return{d,s}});
}
function retrieveDoubt(raw,net){
 const trace=[],q=normQ(raw),hits=glossHits(raw);
 const hasOdia=/[\u0B00-\u0B7F]/.test(raw),hasLat=/[a-z]/i.test(raw);
 trace.push({tool:'normalise',out:{script:hasOdia&&hasLat?'code-mixed':hasOdia?'odia':'latin',digits:'unified'}});
 trace.push({tool:'glossary_expand',out:hits.length?hits.map(h=>h.en+' → '+h.or):'none'});
 const qg=[...new Set(gramsOf(oTok(q).concat(hits.map(h=>h.or))))];
 if(!qg.length)return{mode:'redirect',trace};
 const online=net==='online';
 let rank=bm25(qg).map(x=>({d:x.d,s:x.s+(hits.some(h=>h.c===x.d.c)?1.5:0)})).sort((a,b)=>b.s-a.s);
 if(online){
  const jac=DOCS.map(d=>({d,s:qg.filter(g=>d.set.has(g)).length/(new Set([...qg,...d.set]).size)})).sort((a,b)=>b.s-a.s);
  const sc={};rank.forEach((x,i)=>sc[x.d.id]=(sc[x.d.id]||0)+1/(60+i));jac.forEach((x,i)=>sc[x.d.id]=(sc[x.d.id]||0)+1/(60+i));
  rank=rank.map(x=>({d:x.d,s:sc[x.d.id]})).sort((a,b)=>b.s-a.s);
 }
 const top=rank[0].d;
 const cov=qg.filter(g=>top.set.has(g)).length/qg.length;
 const hitTop=hits.some(h=>h.c===top.c);
 trace.push({tool:'retrieve',out:{method:online?'keyword + n-gram, fused (RRF)':'keyword (BM25) on installed pack',top:rank.slice(0,3).map(x=>x.d.id),coverage:Math.round(cov*100)/100}});
 if(cov<0.5&&!hitTop)return{mode:'redirect',trace};
 const doc=top;
 if(!online&&!SH.installed[doc.pack])return{mode:'nopack',concept:doc.c,trace};
 const c=CMAP[doc.c],chunk=CHUNKS.find(k=>k.id===doc.id);
 const sents=splitSents(chunk&&chunk.text).map(s=>new Set(gramsOf(oTok(s))));
 let best=0,bs=-1;sents.forEach((st,i)=>{const sc=qg.filter(g=>st.has(g)).length;if(sc>bs){bs=sc;best=i}});
 return{mode:'extractive',concept:doc.c,chunk:doc.id,sent:best,cov,trace,online};
}
function answerDoubt(raw,net){
 const r=retrieveDoubt(raw,net);
 if(r.mode==='extractive'){
  r.trace.push({tool:'generator',out:net==='weak'?'skipped: server too slow (6 s cap), using the saved pack':'skipped: offline, extractive answer'});
 }
 return r;
}

/* ================= UI state ================= */
const R={role:null,route:'home',concept:null,fmt:'text',prac:null,thread:[],askText:'',agentTab:'trace',hist:[],
 login:{mode:'signin',role:'student',id:'',pw:'',name:'',err:'',busy:false},
 pop:false,cmd:false,cmdQ:'',more:false,expand:{},testRes:null,scroll:{},altNote:false,quick:'',busy:false,askSeq:0,serverOk:null};
const NAV={learner:['home','learn','practice','ask','progress','packs','sync','agent','settings'],teacher:['teacher','settings']};
const NAVIC={home:'home',learn:'book',practice:'check',ask:'chat',progress:'chart',packs:'download',sync:'sync',agent:'agent',settings:'sliders',teacher:'users'};
const BN=['home','learn','practice','ask'];
const bandOfId=id=>S.p&&S.p.mastery[id]?bandOf(S.p.mastery[id].p_bp):'n';
const pctOf=id=>S.p&&S.p.mastery[id]?Math.max(4,Math.round(S.p.mastery[id].p_bp/100)):0;
const cT=id=>L(CMAP[id].t);
const tagB=b=>`<span class="tag ${b}">${t('band.'+b)}</span>`;
const barH=(p,b)=>`<div class="bar ${b}"><i style="width:${p}%"></i></div>`;
const hasPack=id=>!!SH.installed[CMAP[id].pack];
const fmtTime=ts=>{try{return new Date(ts).toLocaleTimeString(LANG==='or'?'or-IN':'en-IN',{hour:'2-digit',minute:'2-digit'})}catch(e){return new Date(ts).toLocaleTimeString()}};
const fmtDate=()=>{const o={weekday:'long',day:'numeric',month:'long'};try{return new Date().toLocaleDateString(LANG==='or'?'or-IN':'en-IN',o)}catch(e){return new Date().toDateString()}};
const reasonOf=d=>t('reason.'+d.reason);
const GLS=[...GL].sort((a,b)=>(b.or||'').length-(a.or||'').length);
function annotate(raw,lang,used){
 const s=esc(raw);
 if(lang==='or')return s.replace(/[\u0B00-\u0B7F]+/g,tok=>{
  const g=GLS.find(g=>!used.has(g.en)&&g.or&&tok.startsWith(g.or)&&tok.length-g.or.length<=2);
  if(!g)return tok;used.add(g.en);return`<span class="term">${tok}<small> (${g.en})</small></span>`});
 let out=s;
 GL.filter(g=>g.en&&!g.en.includes(' ')).forEach(g=>{out=out.replace(new RegExp('\\b'+g.en.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i'),m=>{if(used.has(g.en))return m;used.add(g.en);return`<span class="term">${m}<small> (${g.or})</small></span>`})});
 return out;
}
function passage(c,hl){
 const lang=LANG,used=new Set();
 return csent(c).map((x,i)=>{const h=annotate(x,lang,used);return i===hl?`<mark>${h}</mark>`:h}).join(' ');
}
const dotsLvl=d=>`<span class="dots">${[1,2,3].map(i=>`<i class="${i<=d?'on':''}"></i>`).join('')}</span>`;

/* ================= login ================= */
function langSwitch(){return `<div class="seg" style="max-width:240px">${LANGS.map(l=>`<button class="${LANG===l.id?'on':''}" data-a="lang" data-v="${l.id}">${l.label}</button>`).join('')}</div>`}
function loginView(){
 const Lg=R.login;
 let body;
 if(Lg.mode==='signup'){
  body=`<button class="link" data-a="lmode" data-v="signin">${ic('back')} ${t('common.back')}</button>
  <h2 style="margin-top:10px">${t('login.signup')}</h2>
  <div class="mut sm" style="margin-bottom:6px">${t('login.role')}</div>
  <div class="seg">${[['student','role.student'],['teacher','role.teacher']].map(([v,k])=>`<button class="${Lg.role===v?'on':''}" data-a="lrole" data-v="${v}">${t(k)}</button>`).join('')}</div>
  <label class="field"><span>${t('login.name')}</span><input type="text" id="lName" value="${esc(Lg.name)}" maxlength="24" autocomplete="off"></label>
  <label class="field"><span>${t('login.password')}</span><input type="password" id="lPw" value="${esc(Lg.pw)}" autocomplete="new-password"></label>
  ${Lg.err?`<div class="fb bad" role="alert">${t(Lg.err)}</div>`:''}
  <div class="wrap" style="margin-top:10px"><button class="btn full" data-a="lsignup" ${Lg.busy?'disabled':''}>${Lg.busy?'<span class="spin"></span>':''}${t('login.signup')}</button></div>`;
 }else{
  body=`<h2>${t('login.title')}</h2><p class="mut" style="margin:0 0 14px">${t('login.sub')}</p>
  <div class="mut sm" style="margin-bottom:6px">${t('login.role')}</div>
  <div class="seg">${[['student','role.student'],['teacher','role.teacher']].map(([v,k])=>`<button class="${Lg.role===v?'on':''}" data-a="lrole" data-v="${v}">${t(k)}</button>`).join('')}</div>
  <label class="field"><span>${t('login.id')}</span><input type="text" id="lId" value="${esc(Lg.id)}" autocomplete="username" autocapitalize="off"></label>
  <label class="field"><span>${t('login.password')}</span><input type="password" id="lPw" value="${esc(Lg.pw)}" autocomplete="current-password"></label>
  ${Lg.err?`<div class="fb bad" role="alert">${t(Lg.err)}</div>`:''}
  <button class="btn full" data-a="lsignin" ${Lg.busy?'disabled':''}>${Lg.busy?'<span class="spin"></span>':ic('out')}${t('login.signin')}</button>
  <p style="text-align:center;margin:14px 0 0"><button class="link" data-a="lmode" data-v="signup">${t('login.newhere')}</button></p>
  <div class="fb info" style="margin-top:18px"><b>${t('login.demo')}</b>
   <table class="demotbl" style="margin-top:6px">
    <tr><td>${t('login.demo.s1')}</td><td><code>1</code></td><td><code>1234</code></td></tr>
    <tr><td>${t('login.demo.s2')}</td><td><code>2</code></td><td><code>2345</code></td></tr>
    <tr><td>${t('login.demo.t1')}</td><td><code>T1</code></td><td><code>teach</code></td></tr>
   </table></div>`;
 }
 const srv=R.serverOk==null?'':R.serverOk
  ?`<span class="tag m">${ic('check')} ${t('login.serveron')}</span>`
  :`<span class="tag w">${ic('wifi')} ${t('login.serveroff')}</span>`;
 return `<div class="login">
 <section class="lhero"><div class="brandrow" style="padding:0"><span class="logo">${ic('leaf')}</span>${t('app.name')}</div>
  <h2>${t('app.tag')}</h2>
  <div class="vp"><span class="ic">${ic('chat')}</span><span>${t('login.vp1')}</span></div>
  <div class="vp"><span class="ic">${ic('agent')}</span><span>${t('login.vp2')}</span></div>
  <div class="vp"><span class="ic">${ic('wifi')}</span><span>${t('login.vp3')}</span></div>
  <small>${ic('shield')} ${t('login.privacy')}</small></section>
 <section class="lform"><div class="wrap" style="justify-content:space-between"><span class="mb brandrow" style="padding:0"><span class="logo">${ic('leaf')}</span>${t('app.name')}</span>${srv}${langSwitch()}</div>
  <div class="inner">${body}<p class="mut sm" style="margin-top:20px"><span class="tag m">${ic('wifi')} ${t('login.offline')}</span></p></div></section></div>`;
}

/* ================= panel shell ================= */
function netChip(){const n=netState();return`<button class="ib ${n}" data-a="pop" aria-haspopup="menu" aria-expanded="${R.pop}"><span class="dotn"></span><span class="lbl">${t('net.'+n)}</span></button>`}
function syncChip(){
 if(!S.p)return'';const n=S.p.outbox.length;
 const txt=syncing?t('sync.running'):n?(netState()==='offline'?t('sync.paused'):tn('sync.pending',{n})):t('sync.saved');
 return`<button class="ib" data-a="go" data-v="sync">${syncing?'<span class="spin"></span>':ic('sync')}<span class="lbl">${txt}</span></button>`;
}
function panelView(){
 const items=NAV[R.role];
 const back=R.hist.length?`<button class="ib sq" data-a="back" aria-label="${t('common.back')}">${ic('back')}</button>`:'';
 const side=`<aside class="side"><div class="brandrow"><span class="logo">${ic('leaf')}</span>${t('app.name')}</div>
  ${items.map(r=>`<button class="nb ${R.route===r?'on':''}" data-a="go" data-v="${r}">${ic(NAVIC[r])}<span>${t('nav.'+r)}</span>${r==='sync'&&S.p&&S.p.outbox.length?`<span class="cnt">${N(S.p.outbox.length)}</span>`:''}</button>`).join('')}
  <div class="sidefoot">${S.p&&S.acc?`<b>${esc(L(S.acc.names))}</b><br>${t('set.acc.id')} <code class="mono">${esc(S.acc.id)}</code> · ${t('role.'+S.acc.role)}<br>`:`<b>${t('nav.teacher')}</b><br>`}<span class="tag" style="margin-top:4px">${t('net.'+netState())}</span><br><button class="nb" style="padding:8px 0;min-height:36px;margin-top:6px" data-a="signout">${ic('out')}<span>${t('nav.logout')}</span></button></div></aside>`;
 const other=LANGS.find(l=>l.id!==LANG);
 const top=`<header class="topbar">${back}<h1>${t('nav.'+R.route)}</h1>
  <button class="ib" data-a="cmd" aria-label="${t('nav.search')}">${ic('search')}<span class="lbl">${t('nav.search')}</span><span class="kbd">Ctrl K</span></button>
  ${netChip()}${syncChip()}
  <button class="ib" data-a="lang" data-v="${other.id}" aria-label="${other.label}">${ic('globe')}<span>${other.label}</span></button>
  <button class="av" data-a="go" data-v="settings" aria-label="${t('nav.settings')}">${esc([...(S.acc?L(S.acc.names):'T')][0])}</button></header>`;
 const bn=`<nav class="bn">${(R.role==='teacher'?['teacher','settings']:BN).map(r=>`<button class="${R.route===r?'on':''}" data-a="go" data-v="${r}">${ic(NAVIC[r])}<span>${t('nav.'+r)}</span></button>`).join('')}${R.role==='teacher'?'':`<button class="${['progress','packs','sync','agent','settings'].includes(R.route)?'on':''}" data-a="more">${ic('more')}<span>${t('nav.more')}</span></button>`}</nav>`;
 return`<div class="panel">${side}<div class="mc">${top}<div class="content" id="content">${VIEWS[R.route]?VIEWS[R.route]():''}</div></div>${bn}</div>`;
}
function overlays(){
 let h='';
 if(R.pop){const n=SH.settings.net;
  h+=`<div class="overlay" style="background:transparent;padding:0" data-a="popx"></div><div class="pop" role="menu"><div class="mut sm" style="padding:6px 12px">${t('net.demo')}</div>
  ${['auto','online','weak','offline'].map(m=>`<button class="${n===m?'on':''}" data-a="setnet" data-v="${m}" role="menuitem"><span class="dotn" style="${m==='weak'?'background:var(--p)':m==='offline'?'background:var(--n)':''}"></span>${t('net.'+m)}</button>`).join('')}
  <div class="mut sm" style="padding:8px 12px">${t('net.demo.note')}</div></div>`}
 if(R.more)h+=`<div class="overlay bot" data-a="morex"><div class="modal"><div class="list">${['progress','packs','sync','agent','settings'].map(r=>`<button class="li" style="width:100%;min-height:52px;align-items:center" data-a="go" data-v="${r}"><span class="ic">${ic(NAVIC[r])}</span><span class="tx"><b>${t('nav.'+r)}</b></span></button>`).join('')}<button class="li" style="width:100%;align-items:center" data-a="signout"><span class="ic">${ic('out')}</span><span class="tx"><b>${t('nav.logout')}</b></span></button></div></div></div>`;
 if(R.cmd){const items=cmdItems().filter(i=>i.l.toLowerCase().includes(R.cmdQ.toLowerCase()));
  h+=`<div class="overlay" data-a="cmdx"><div class="modal cmd" role="dialog" aria-label="${t('cmd.title')}"><input type="text" id="cmdQ" value="${esc(R.cmdQ)}" placeholder="${t('nav.search')}" autocomplete="off">
  ${items.length?items.map((i,k)=>`<button class="it ${k===0?'on':''}" data-a="cmdrun" data-v="${i.k}">${ic(i.i)}<span>${esc(i.l)}</span></button>`).join(''):`<p class="mut" style="padding:8px 12px">${t('cmd.none')}</p>`}</div></div>`}
 return h;
}
function cmdItems(){
 const out=NAV[R.role].map(r=>({k:'go:'+r,i:NAVIC[r],l:t('cmd.go',{x:t('nav.'+r)})}));
 out.push({k:'lang',i:'globe',l:t('cmd.lang')});
 if(S.p)out.push({k:'sync',i:'sync',l:t('cmd.sync')});
 out.push(netState()==='offline'?{k:'net:online',i:'wifi',l:t('cmd.on')}:{k:'net:offline',i:'wifi',l:t('cmd.off')});
 return out;
}

/* ================= views ================= */
function heroCard(d){
 const c=CMAP[d.target];
 const goKey=d.action==='RETRY'?'go.practice':'go.learn';
 return`<section class="leaf" aria-label="${t('home.next')}">
  <div class="kick">${t('home.next')}${d.adopted?` · <span class="tag info">${t('home.pending.upd')}</span>`:''}</div>
  <div class="act">${t('act.'+d.action)}</div><div class="con">${esc(L(c.t))}</div>
  <p class="why">${reasonOf(d)}</p>
  ${d.needs_help?`<div class="fb bad">${ic('alert')} ${t('home.needhelp')}</div>`:''}
  <div class="wrap"><button class="btn" data-a="follow">${t(goKey)} ${ic('arrow')}</button><span class="tag">${t('deliv.'+d.delivery)}</span><button class="link" data-a="go" data-v="agent">${t('home.why')}</button></div></section>`;
}
function homeView(){
 const d=ensureDecision(),m=S.p.mastery;
 const cnt={m:0,p:0,w:0,n:0};CONCEPTS.forEach(c=>cnt[bandOfId(c.id)]++);
 const plan=[];
 plan.push({ic:'arrow',tx:t('home.plan.cur',{act:t('act.'+d.action),c:cT(d.target)}),act:'follow'});
 const rev=CONCEPTS.filter(c=>m[c.id]&&bandOfId(c.id)==='m'&&c.id!==d.target).sort((a,b)=>m[a.id].last_seen-m[b.id].last_seen)[0];
 plan.push(rev?{ic:'book',tx:t('home.plan.review',{c:cT(rev.id)}),act:'open',v:rev.id}:{ic:'chat',tx:t('home.plan.ask'),act:'go',v:'ask'});
 const dl=Object.keys(SH.dl)[0];
 if(dl)plan.push({ic:'download',tx:t('home.plan.dl',{p:t('pack.main')}),agent:true,done:false});
 if(S.p.outbox.length)plan.push({ic:'sync',tx:t('home.plan.sync',{n:N(S.p.outbox.length)}),agent:true,done:false});
 const inbox=[];
 CONCEPTS.forEach(c=>{const r=m[c.id];if(r&&bandOfId(c.id)==='w'&&r.attempts>0)inbox.push({ic:'agent',tx:t('home.in.hard',{c:cT(c.id)})})});
 if(d.needs_help)inbox.push({ic:'alert',tx:t('home.in.help',{c:cT(d.target)})});
 if(S.p.outbox.length)inbox.push({ic:'sync',tx:tn('home.in.queue',{n:S.p.outbox.length})});
 if(d.adopted)inbox.push({ic:'sync',tx:t('home.in.server')});
 if(dl)inbox.push({ic:'download',tx:t('home.in.pack',{p:t('pack.main')})});
 if(!inbox.length)inbox.push({ic:'leaf',tx:t('home.in.none')});
 const names=t('days').split(',');const wk=[];
 for(let i=6;i>=0;i--){const dt=new Date(Date.now()-i*864e5);const k=dt.toISOString().slice(0,10);wk.push({n:names[dt.getDay()],on:(S.p.days[k]||0)>0})}
 const env=curEnv();const last=S.p.decisions[0];
 const rail=`<div class="stack">
  <div class="card"><h3>${ic('chart')}${t('home.week')}</h3><div class="wk" role="img" aria-label="${t('home.week')}">${wk.map(w=>`<div><i class="${w.on?'on':''}"></i>${w.n}</div>`).join('')}</div></div>
  <div class="card"><h3>${ic('wifi')}${t('home.conn')}</h3>
   <div class="wrap" style="justify-content:space-between"><span class="ib ${env.network}" style="border:0;padding:0"><span class="dotn"></span>${t('net.'+env.network)}</span><span class="mut sm">${env.network==='offline'?'—':N(env.rtt_ms)+' ms'}</span></div>
   <div class="mut sm" style="margin-top:8px">${tn('pack.storage',{n:env.storage_free_mb})}</div>${barH(Math.round((1-env.storage_free_mb/512)*100),'ind')}
   <div class="mut sm" style="margin-top:8px">${S.p.outbox.length?tn('sync.pending',{n:S.p.outbox.length}):t('sync.saved')} · ${SH.installed[PACK.id]?t('pack.inst',{v:N(PACK.vnum)}):t('pack.none')}</div></div>
  <div class="card"><h3>${ic('agent')}${t('home.trace')}<span class="r"><button class="link" data-a="go" data-v="agent">${t('nav.agent')}</button></span></h3>
   ${last&&last.steps.length?last.steps.map(s=>`<div class="step mono"><b>${esc(s.stage)}</b><span>${esc(brief(s.out))}</span><span>${N(s.ms)}ms</span></div>`).join(''):`<p class="mut sm">${last?t('agent.src.'+last.source)+' · '+esc(last.reason||''):'—'}</p>`}</div>
  <div class="card"><h3>${ic('chat')}${t('home.quick')}</h3><textarea id="quick" rows="2" placeholder="${t('home.quick.ph')}" aria-label="${t('home.quick')}">${esc(R.quick||'')}</textarea><button class="btn sm" style="margin-top:8px" data-a="quick">${ic('send')}${t('ask.send')}</button></div></div>`;
 return`<div class="cols"><div class="stack">
  <div class="pagehead"><h2>${t('home.hello',{name:esc(S.acc?L(S.acc.names):'')})}</h2><p>${fmtDate()} · ${t('home.sub')}</p></div>
  ${heroCard(d)}
  <div class="grid4">${['m','p','w','n'].map(b=>`<div class="stat"><div class="n">${N(cnt[b])}</div><span class="tag ${b}">${t('home.stat.'+b)}</span></div>`).join('')}</div>
  <div class="grid2" style="align-items:start">
   <div class="card"><h3>${ic('check')}${t('home.plan')}</h3><div class="list">${plan.map(p=>`<${p.act?'button':'div'} class="li ${p.done?'done':''}" ${p.act?`data-a="${p.act}" data-v="${p.v||''}" style="width:100%;text-align:left"`:''}><span class="ic">${ic(p.ic)}</span><span class="tx">${esc(p.tx)}${p.agent?`<br><span class="mut sm">${t('home.plan.agent')}</span>`:''}</span></${p.act?'button':'div'}>`).join('')}</div></div>
   <div class="card"><h3>${ic('agent')}${t('home.inbox')}</h3><div class="list">${inbox.slice(0,4).map(i=>`<div class="li"><span class="ic">${ic(i.ic)}</span><span class="tx">${esc(i.tx)}</span></div>`).join('')}</div></div></div>
  <div class="card"><h3>${ic('book')}${t('home.concepts')}</h3><div class="grid3">${CONCEPTS.map(c=>{const b=bandOfId(c.id);return`<button class="tile ${b}" data-a="open" data-v="${c.id}"><span class="mut sm">${t('ch.'+c.ch)}</span><b>${esc(L(c.t))}</b>${barH(pctOf(c.id),b)}<span class="mut sm">${t('band.'+b)}</span></button>`}).join('')}</div></div>
 </div>${rail}</div>`;
}
function brief(o){if(o==null)return'';if(typeof o!=='object')return String(o);return Object.keys(o).map(k=>k+'='+(typeof o[k]==='object'?JSON.stringify(o[k]):o[k])).join(' ')}

function learnView(){
 const list=`<div class="pane-list">${CHAPTERS.map(ch=>`<div class="ch">${esc(L(ch.t))}</div>${CONCEPTS.filter(c=>c.ch===ch.id).map(c=>`<button class="row-i ${R.concept===c.id?'on':''}" data-a="open" data-v="${c.id}"><span class="sdot ${bandOfId(c.id)}"></span><span style="flex:1">${esc(L(c.t))}</span>${hasPack(c.id)?'':ic('download')}</button>`).join('')}`).join('')}</div>`;
 let main;
 if(!R.concept)main=`<div class="card emp"><div class="big">${t('learn.pick')}</div>${t('app.class')}</div>`;
 else{
  const c=CMAP[R.concept],b=bandOfId(c.id);
  if(!hasPack(c.id)){
   const dl=SH.dl[c.pack]!=null;
   main=`<div class="card"><button class="link mb2" data-a="unsel">${t('common.back')}</button><h3>${esc(L(c.t))}</h3><div class="emp"><div class="big">${ic('lock')} ${t('learn.locked')}</div>${t('learn.locked.sub')}<div style="margin-top:14px">${dl?`<span class="spin"></span> ${t('pack.verify')}`:`<button class="btn" data-a="dlpack" data-v="${c.pack}" ${netState()==='offline'?'disabled':''}>${ic('download')}${t('learn.dl')}</button>`}${netState()==='offline'?`<p class="mut sm">${t('pack.needsig')}</p>`:''}</div></div></div>`;
  }else{
   const unmet=c.pre.filter(q=>bandOfId(q)!=='m');
   main=`<div class="card"><button class="link mb2" data-a="unsel">${ic('back')} ${t('common.back')}</button>
   <div class="wrap" style="margin:6px 0"><span class="tag">${t('ch.'+c.ch)}</span>${tagB(b)}<span class="tag">${t('deliv.cached')}</span></div>
   <h2 style="margin:6px 0 10px;font-size:26px;line-height:1.4">${esc(L(c.t))}</h2>
   <div class="tabs" role="tablist"><button class="${R.fmt==='text'?'on':''}" role="tab" data-a="fmt" data-v="text">${t('learn.text')}</button><button class="${R.fmt==='example'?'on':''}" role="tab" data-a="fmt" data-v="example">${t('learn.ex')}</button></div>
   ${R.altNote&&R.fmt==='example'?`<div class="fb info">${t('learn.alt')}</div>`:''}
   <div class="reader">${R.fmt==='text'?passage(c,-1):esc(L({en:c.ex,or:c.ex}))}</div>
   <p class="mut sm">${t('learn.page',{ch:esc(L(CHMAP[c.ch].t))})}</p>
   ${unmet.length?`<div class="fb info">${t('learn.before')}: ${unmet.map(q=>`<button class="link" data-a="open" data-v="${q}">${esc(cT(q))}</button>`).join(', ')}</div>`:''}
   <div class="wrap" style="margin-top:12px"><button class="btn" data-a="practice" data-v="${c.id}">${ic('check')}${t('learn.practice')}</button><button class="btn ghost" data-a="askabout" data-v="${c.id}">${ic('chat')}${t('learn.ask')}</button></div></div>
   <div class="card"><h3>${ic('globe')}${t('learn.terms')}</h3><div class="wrap">${GL.filter(g=>g.c===c.id).map(g=>`<span class="tag"><b>${esc(g.or)}</b> ${esc(g.en)}</span>`).join('')}</div></div>`;
  }
 }
 return`<div class="pagehead"><h2>${t('learn.title')}</h2></div><div class="twopane ${R.concept?'sel':''}">${list}<div class="pane-main stack">${main}</div></div>`;
}

/* ---- practice ---- */
function diffFor(d,lastD){
 if(!d)return 1;
 if(d.reason==='WRONG_RETRY')return Math.max(1,lastD-1);
 if(d.reason==='PARTIAL_PRACTICE')return Math.min(3,lastD+1);
 return 1;
}
function qsOf(concept){return Object.values(QB).filter(q=>q.c===concept)}
function pickQ(concept,dd,avoid){
 return qsOf(concept).sort((a,b)=>(Math.abs(a.d-dd)*10+(S.p.qcount[a.id]||0)+(a.id===avoid?50:0))-(Math.abs(b.d-dd)*10+(S.p.qcount[b.id]||0)+(b.id===avoid?50:0)))[0];
}
function startPractice(concept){
 if(!hasPack(concept)){navPush();R.route='learn';R.concept=concept;render();return}
 const b=bandOfId(concept);const dd=b==='m'?3:b==='p'?2:1;
 const q=pickQ(concept,dd);
 if(!q){R.route='learn';R.concept=concept;render();return}
 R.prac={concept,q:q.id,sel:null,t0:Date.now(),log:[],lastD:q.d,dec:null,why:S.p.current?S.p.current.reason:null,n:1};
 navPush();R.route='practice';render();
}
function answerQ(i){
 const P=R.prac;if(!P||P.sel!==null)return;
 const q=QB[P.q],ok=i===q.a;P.sel=i;
 emit('ANSWER_SUBMITTED',{attempt_id:uuid(),question_id:q.id,revision:1,concept:q.c,response:i,correct_claim:ok,time_ms:Date.now()-P.t0});
 S.p.qcount[q.id]=(S.p.qcount[q.id]||0)+1;
 P.log.push(ok?1:0);P.lastD=q.d;
 P.dec=computeLocal('ANSWER_SUBMITTED');render();
}
function nextQ(){
 const P=R.prac,d=P.dec;
 if(d&&d.action==='RETRY'&&d.target===P.concept){
  const dd=diffFor(d,P.lastD),q=pickQ(P.concept,dd,P.q);
  if(q)R.prac=Object.assign(P,{q:q.id,sel:null,t0:Date.now(),dec:null,why:d.reason,n:P.n+1});
  else{R.prac=null;R.route='learn';R.concept=P.concept}
  render();
 }else{
  R.prac=null;R.route='learn';R.concept=d?d.target:P.concept;R.fmt=d&&d.alt?'example':'text';R.altNote=!!(d&&d.alt);
  if(R.concept&&hasPack(R.concept))emit('CONTENT_VIEWED',{concept:R.concept,format:R.fmt});
  render();
 }
}
function skipQ(){
 const P=R.prac;if(!P||P.sel!==null)return;
 emitLocal('QUESTION_ABANDONED',{question_id:P.q});
 const q=pickQ(P.concept,P.lastD,P.q);if(q)Object.assign(P,{q:q.id,t0:Date.now(),n:P.n+1});render();
}
function practiceView(){
 const P=R.prac;
 if(!P){
  const d=ensureDecision();
  return`<div class="card emp" style="max-width:560px;margin:30px auto"><div class="big">${t('prac.empty')}</div>${t('prac.empty.sub')}<div style="margin-top:16px"><button class="btn" data-a="practice" data-v="${d.target}">${ic('check')}${t('go.practice')} · ${esc(cT(d.target))}</button></div></div>`;
 }
 const q=QB[P.q],c=CMAP[q.c],b=bandOfId(c.id),done=P.sel!==null,ok=done&&P.sel===q.a;
 const fb=done?(ok?`<div class="fb ok" role="status"><b>${t('prac.correct')}</b></div>`:`<div class="fb bad" role="status"><b>${t('prac.wrong')}</b> ${esc(q.f||'')}</div>`):'';
 const nd=P.dec;
 const next=done&&nd?`<div class="leaf" style="margin-top:16px;padding-top:16px;padding-bottom:16px"><div class="kick">${t('prac.next')}</div><div class="act" style="font-size:24px">${t('act.'+nd.action)}</div><div class="con" style="font-size:17px">${esc(cT(nd.target))}</div><p class="why" style="margin:4px 0 12px">${reasonOf(nd)}</p><div class="wrap"><button class="btn" data-a="pnext">${t('prac.cont')} ${ic('arrow')}</button><button class="btn ghost" data-a="pstop">${t('prac.stop')}</button></div></div>`:'';
 return`<div class="cols"><div class="stack"><div class="card">
  <div class="wrap" style="justify-content:space-between"><span class="tag">${esc(L(c.t))}</span><span class="mut sm">${t('prac.q',{n:N(P.n)})}</span></div>
  <p class="q" style="margin:14px 0 6px">${esc(q.s)}</p>
  <div role="group" aria-label="${esc(q.s)}">${q.o.map((o,i)=>`<button class="opt ${done?(i===q.a?'ok':i===P.sel?'bad':''):''}" data-a="ans" data-v="${i}" ${done?'disabled':''}><span class="l">${'ABCD'[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>
  ${fb}${done?`<p class="mut sm">${ic('check')} ${t('prac.saved')}${S.p.outbox.length?' · '+tn('sync.pending',{n:S.p.outbox.length}):''}</p>`:`<button class="btn ghost sm" data-a="skip">${t('prac.skip')}</button>`}
  ${next}</div></div>
  <div class="stack"><div class="card"><h3>${ic('agent')}${t('prac.why')}</h3>
   <div class="li"><span class="tx"><span class="mut sm">${t('prac.concept')}</span><br><b>${esc(L(c.t))}</b></span></div>
   <div class="li"><span class="tx"><span class="mut sm">${t('prac.level')}</span><br>${dotsLvl(q.d)}</span></div>
   ${P.why?`<div class="li"><span class="tx"><span class="mut sm">${t('home.why')}</span><br>${t('reason.'+P.why)}</span></div>`:''}
   <div class="li"><span class="tx"><span class="mut sm">${t('prac.mastery')}</span>${barH(pctOf(c.id),b)}${tagB(b)}</span></div></div>
   <div class="card"><h3>${t('prac.session')}</h3><div class="dots">${P.log.map(x=>`<i class="${x?'on':'x'}"></i>`).join('')||'<span class="mut">—</span>'}</div></div></div></div>`;
}

/* ---- ask a doubt ---- */
async function runAsk(text){
 text=(text||'').trim();if(!text)return;
 const net=netState(),id=++R.askSeq;
 R.thread.push({q:text,res:{loading:true},id,net});R.askText='';R.route='ask';render();
 let res;
 try{
  if(net==='online'&&AUTH){
   const api=await apiFetch('/doubts/query',{method:'POST',body:{query:text,pack_ids:[PACK.id]}});
   res={mode:'server',api};
  }else{
   res=answerDoubt(text,net);
   if(net==='weak')await sleep(800);
  }
 }catch(e){res=answerDoubt(text,'offline');res.fallback=true}
 const it=R.thread.find(x=>x.id===id);if(!it||!S.p)return;
 it.res=res;it.net=net;render();
 const box=$('#content');if(box)box.scrollTop=box.scrollHeight;
 emit('DOUBT_ASKED',{concept:res.concept||null,length:text.length,mode:res.mode});
}
function answerCard(it){
 const r=it.res;
 if(r.loading)return`<div class="ans"><span class="spin"></span></div>`;
 if(r.mode==='server'){
  const a=(r.api&&r.api.answer)||{};
  const cites=(a.citations||[]).map(c=>typeof c==='string'?c:(c.chunk_id||c.source_ref||'')).filter(Boolean);
  const ret=(r.api&&r.api.retrieved)||{};
  const chunks=(ret.chunks||[]);
  const prov=a.provenance||'extractive';
  return`<div class="ans"><div class="wrap" style="margin-bottom:8px"><span class="tag m">${t('ask.lbl.server')}</span><span class="tag mono">${esc(prov)}</span>${a.confidence!=null?`<span class="tag">${t('ask.src')}: ${N(Math.round(a.confidence*100))}%</span>`:''}</div>
   <div class="reader" style="font-size:inherit">${esc(a.text_or||'—')}</div>
   ${it.net!=='online'?`<p class="mut sm">${ic('wifi')} ${t('ask.weaknote')}</p>`:''}
   ${cites.length?`<p class="src mut sm">${t('ask.src')}: ${cites.map(esc).join(' · ')}</p>`:''}
   ${chunks.length&&CMAP[chunks[0].concept_id]?`<button class="btn ghost sm" data-a="open" data-v="${chunks[0].concept_id}">${ic('book')}${t('ask.more')}</button>`:''}</div>`;
 }
 if(r.mode==='redirect'){
  const pool=CONCEPTS.filter(c=>hasPack(c.id)).slice(0,4);
  return`<div class="ans">${t('ask.out')}<div class="chips wrap" style="margin-top:10px">${pool.map(c=>`<button class="tag" data-a="chip" data-v="${esc(c.t.or)}" style="min-height:40px;font-size:15px">${esc(L(c.t))}</button>`).join('')}</div></div>`;
 }
 if(r.mode==='nopack')return`<div class="ans">${t('ask.nopack')}<div style="margin-top:10px"><button class="btn sm" data-a="go" data-v="packs">${ic('download')}${t('nav.packs')}</button></div></div>`;
 const c=CMAP[r.concept];
 const note=it.net==='weak'?t('ask.weaknote'):it.net==='offline'?t('ask.offnote'):'';
 return`<div class="ans"><div class="wrap" style="margin-bottom:8px"><span class="tag p">${t('ask.lbl.basic')}</span><span class="tag">${esc(L(c.t))}</span></div>
  <div class="reader" style="font-size:inherit">${passage(c,r.sent)}</div>
  ${note?`<p class="mut sm">${ic('wifi')} ${note}</p>`:''}
  <p class="src mut sm">${t('learn.page',{ch:esc(L(CHMAP[c.ch].t))})} · ${t('ask.chunk')} ${esc(r.chunk)}</p>
  <button class="btn ghost sm" data-a="open" data-v="${c.id}">${ic('book')}${t('ask.more')}</button></div>`;
}
function askTrace(it){
 const r=it.res;
 if(r.mode==='server'){
  const a=(r.api&&r.api.answer)||{},ret=(r.api&&r.api.retrieved)||{};
  return[{tool:'query',out:{chars:(it.q||'').length}},
   {tool:'translate',out:r.api&&r.api.used_translation_tool?{provider:ret.provider,translated:r.api.translated_query}:String(r.api&&r.api.used_translation_tool)},
   {tool:'retrieve',out:{provider:ret.provider,model:ret.model_id,chunks:(ret.chunks||[]).length,confidence:ret.confidence}},
   {tool:'answer',out:{provenance:a.provenance,status:a.basic_answer_status,confidence:a.confidence}}];
 }
 return r.trace||[];
}
function askView(){
 const last=[...R.thread].reverse().find(x=>x.res&&!x.res.loading);
 const rail=last?`<div class="stack"><div class="card"><h3>${ic('book')}${t('ask.src')}</h3>${last.res.chunk||(last.res.api&&(last.res.api.retrieved||{}).chunks&&last.res.api.retrieved.chunks[0])?`<div class="li"><span class="tx"><b>${last.res.concept&&CMAP[last.res.concept]?esc(cT(last.res.concept)):'—'}</b><br><span class="mono">${esc(last.res.chunk||(last.res.api.retrieved.chunks[0].chunk_id||''))}</span></span></div>`:`<p class="mut">—</p>`}</div>
  <div class="card"><h3>${ic('agent')}${t('ask.how')}</h3><div class="mono">${askTrace(last).map((s,i)=>`<div class="step"><b>${N(i+1)}. ${esc(s.tool)}</b><span>${esc(brief(s.out))}</span><span></span></div>`).join('')}</div></div></div>`:`<div class="card emp">${t('ask.empty')}</div>`;
 const exs=['ask.ex1','ask.ex2','ask.ex3','ask.ex4'];
 return`<div class="cols"><div class="stack"><div class="pagehead"><h2>${t('ask.title')}</h2><p>${t('ask.sub')}</p></div>
  <div class="thread" aria-live="polite">${R.thread.map(it=>`<div class="bubble">${esc(it.q)}</div>${answerCard(it)}`).join('')}</div>
  <div class="card"><div class="mut sm" style="margin-bottom:6px">${t('ask.try')}</div><div class="chips wrap" style="margin-bottom:10px">${exs.map(k=>`<button class="chip tag" style="min-height:40px;font-size:15px" data-a="chip" data-v="${esc(t(k))}">${t(k)}</button>`).join('')}</div>
  <div class="askbar"><textarea id="askText" rows="2" placeholder="${t('ask.ph')}" aria-label="${t('ask.ph')}">${esc(R.askText)}</textarea><button class="ib sq" disabled title="${t('ask.voice')}" aria-label="${t('ask.voice')}">${ic('mic')}</button><button class="btn" data-a="ask">${ic('send')}<span>${t('ask.send')}</span></button></div>
  <p class="mut sm" style="margin:6px 0 0">${ic('mic')} ${t('ask.voice')}</p></div></div>${rail}</div>`;
}

/* ---- progress ---- */
function progressView(){
 const cnt={m:0,p:0,w:0,n:0};CONCEPTS.forEach(c=>cnt[bandOfId(c.id)]++);
 const d=ensureDecision();
 return`<div class="pagehead"><h2>${t('prog.title')}</h2><p>${t('prog.sub')}</p></div>
 ${d.needs_help?`<div class="fb bad" style="margin-bottom:14px">${ic('alert')} ${t('home.needhelp')} <b>${esc(cT(d.target))}</b></div>`:''}
 <div class="grid4" style="margin-bottom:16px">${['m','p','w','n'].map(b=>`<div class="stat"><div class="n">${N(cnt[b])}</div><span class="tag ${b}">${t('band.'+b)}</span></div>`).join('')}</div>
 <div class="grid3">${CHAPTERS.map(ch=>`<div class="card"><h3>${esc(L(ch.t))}</h3><div class="stack" style="gap:10px">${CONCEPTS.filter(c=>c.ch===ch.id).map(c=>{const b=bandOfId(c.id),r=S.p.mastery[c.id];return`<button class="tile ${b}" data-a="open" data-v="${c.id}"><b>${esc(L(c.t))}</b>${barH(pctOf(c.id),b)}<span class="wrap" style="margin-top:6px;gap:6px">${tagB(b)}${r?`<span class="mut sm">${tn('prog.tried',{n:r.attempts})}</span>`:''}</span>${c.pre.length?`<span class="mut sm">${t('prog.after',{c:esc(c.pre.map(cT).join(', '))})}</span>`:''}</button>`}).join('')}</div></div>`).join('')}</div>`;
}

/* ---- downloads ---- */
function packsView(){
 const env=curEnv(),n=env.network,p=PACK;
 const v=SH.installed[p.id],dl=SH.dl[p.id];
 let st,btn='';
 if(dl!=null){st=`<div class="bar ind"><i style="width:${Math.min(100,Math.round((dl+1)/9*100))}%"></i></div><div class="mut sm" style="margin-top:4px">${n==='offline'?t('pack.paused'):t('pack.verify')}</div>`}
 else if(v){st=`<span class="tag m">${ic('check')} ${t('pack.inst',{v:N(p.vnum)})}</span>`}
 else{st=`<span class="tag">${t('pack.none')}</span>`;btn=`<button class="btn sm" data-a="dlpack" data-v="${p.id}" ${netState()==='offline'||!AUTH?'disabled':''}>${ic('download')}${t('pack.get')}</button>`}
 return`<div class="pagehead"><h2>${t('pack.title')}</h2><p>${t('pack.sub')}</p></div>
 <div class="cols"><div class="stack"><div class="card"><div class="pk wrap" style="flex-wrap:nowrap;gap:14px"><span class="ic av" style="background:var(--info);color:var(--ind)">${ic('book')}</span><div style="flex:1;min-width:0"><b>${t('pack.main')}</b><div class="mut sm">${CONCEPTS.map(c=>esc(L(c.t))).join(' · ')}</div><div class="mut sm mono">v${esc(p.version)} · ${esc(p.contentVersion)} · ${N(p.bytes)} bytes</div><div style="margin-top:8px">${st}</div></div>${btn}</div></div>
 ${n==='offline'?`<p class="mut sm">${ic('wifi')} ${t('pack.needsig')}</p>`:''}</div>
 <div class="stack"><div class="card"><h3>${ic('download')}${t('pack.storage',{n:N(env.storage_free_mb)})}</h3>${barH(Math.round((1-env.storage_free_mb/512)*100),'ind')}<p class="mut sm" style="margin-top:8px">${t('pack.how')}</p></div>
 <div class="card"><div class="sw"><span><b>${t('pack.auto')}</b><br><span class="mut sm">${t('pack.auto.note')}</span></span><button class="tg ${SH.settings.autoPrefetch?'on':''}" role="switch" aria-checked="${SH.settings.autoPrefetch}" data-a="autopf" aria-label="${t('pack.auto')}"></button></div></div></div></div>`;
}

/* ---- sync ---- */
function syncView(){
 const p=S.p,ob=p.outbox.slice().sort((a,b)=>b.seq-a.seq).slice(0,25);
 const outs=l=>l?`${t('syn.res',{a:N(l.cnt.ACCEPTED||0),d:N(l.cnt.DUPLICATE||0),r:N(l.cnt.REJECTED||0),t:N(l.cnt.RETRYABLE||0)})}`:'';
 return`<div class="pagehead"><h2>${t('syn.title')}</h2><p>${t('syn.sub')}</p></div>
 <div class="grid4" style="margin-bottom:16px">
  <div class="stat"><div class="n">${N(p.outbox.length)}</div><span class="mut sm">${t('syn.pending')}</span></div>
  <div class="stat"><div class="n">${N(p.quarantine.length)}</div><span class="mut sm">${t('syn.quar')}</span></div>
  <div class="stat"><div class="n" style="font-size:20px;padding:4px 0">${p.lastsync?fmtTime(p.lastsync):t('syn.never')}</div><span class="mut sm">${t('syn.last')}</span></div>
  <div class="stat"><div class="n">${N(p.cursor||0)}</div><span class="mut sm">${t('syn.cursor')}</span></div></div>
 <div class="wrap" style="margin-bottom:16px"><button class="btn" data-a="sync" ${syncing?'disabled':''}>${syncing?'<span class="spin"></span>':ic('sync')}${t('syn.now')}</button><span class="tag ${netState()}">${t('net.'+netState())}</span></div>
 <div class="card" style="margin-bottom:16px"><div class="sw"><span><b>${t('syn.auto')}</b><br><span class="mut sm">${t('syn.auto.note')}</span></span><button class="tg ${SH.settings.autoSync?'on':''}" role="switch" aria-checked="${SH.settings.autoSync}" data-a="autosync" aria-label="${t('syn.auto')}"></button></div></div>
 <div class="cols"><div class="stack"><div class="card"><h3>${ic('sync')}${t('syn.outbox')}</h3>${ob.length?`<div style="overflow:auto"><table class="tbl"><tr><th>${t('syn.col.seq')}</th><th>${t('syn.col.type')}</th><th>${t('syn.col.state')}</th></tr>${ob.map(e=>`<tr><td class="mono">${N(e.seq)}</td><td>${t('ev.'+e.type)||e.type}</td><td><span class="tag">${t('out.PENDING')}</span></td></tr>`).join('')}</table></div>`:`<p class="mut">${t('common.none')}</p>`}</div>
  ${p.quarantine.length?`<div class="card"><h3>${ic('alert')}${t('syn.quar')}</h3><div style="overflow:auto"><table class="tbl"><tr><th>${t('syn.col.seq')}</th><th>${t('syn.col.type')}</th><th>${t('syn.col.reason')}</th></tr>${p.quarantine.map(q=>`<tr><td class="mono">${N(q.event.seq)}</td><td class="mono">${esc(q.event.type)}</td><td class="mono">${esc(q.reason)}</td></tr>`).join('')}</table></div></div>`:''}</div>
 <div class="card"><h3>${ic('chart')}${t('syn.log')}</h3>${p.synclog.length?`<div class="list">${p.synclog.map(l=>`<div class="li"><span class="ic">${l.status==='OK'?ic('check'):ic('alert')}</span><span class="tx"><b>${fmtTime(l.ts)}</b> · <span class="tag ${l.status==='OK'?'m':'w'}">${l.status}</span> <span class="tag info">${t('syn.trig.'+(l.trigger||'AUTO'))}</span><br><span class="mut sm">${l.status==='OK'?outs(l):t('syn.fail')}</span></span></div>`).join('')}</div>`:`<p class="mut">${t('common.none')}</p>`}</div></div>`;
}

/* ---- agent ---- */
function agentView(){
 const tabs=['trace','rules','tests','server'];let body='';
 if(R.agentTab==='trace'){
  const ds=S.p.decisions.slice(0,20);
  body=ds.length?ds.map((d,i)=>{
   const open=R.expand[d.id]!==undefined?R.expand[d.id]:i===0,c=CMAP[d.target];
   return`<div class="card"><button style="width:100%" data-a="exp" data-v="${d.id}" aria-expanded="${open}"><div class="wrap" style="justify-content:space-between"><span><b>${t('act.'+d.action)}</b> · ${esc(L(c.t))}</span><span class="wrap"><span class="tag ${d.source==='server'?'info':''}">${t('agent.src.'+d.source)}</span><span class="tag mono">${esc(d.reason)}</span></span></div><div class="mut sm">${fmtTime(d.ts)} · ${t('agent.ruleset')} ${esc(d.ruleset_version||'')} · ${t('deliv.'+d.delivery)}${d.background&&d.background.length?' · '+d.background.join(', '):''}</div></button>
   ${open?`<div class="mono" style="margin-top:8px">${d.steps&&d.steps.length?d.steps.map(s=>`<div class="step"><b>${esc(s.stage)}</b><span>${esc(brief(s.out))}</span><span>${N(s.ms)}ms</span></div>`).join(''):`<p class="mut sm">${d.adopted?t('home.pending.upd'):t('common.none')}</p>`}</div>`:''}</div>`}).join(''):`<div class="card emp">${t('agent.none')}</div>`;
 }else if(R.agentTab==='rules'){
  body=`<div class="card"><div class="fb info">${ic('shield')} ${t('agent.how')}</div></div>
  <div class="card"><h3>${t('agent.rules.order')}</h3><div style="overflow:auto"><table class="tbl"><tr><th>#</th><th></th><th></th><th></th></tr>${RULE_TABLE.map(r=>`<tr><td class="mono">${N(r[0])}</td><td>${esc(r[1])}</td><td class="mono">${esc(r[2])}</td><td class="mono">${esc(r[3])}</td></tr>`).join('')}</table></div></div>
  <div class="card"><h3>${t('agent.ruleset')} ${esc(RULES.version)}</h3><div class="mono"><pre>${esc(JSON.stringify(RULES,null,1))}</pre></div></div>`;
 }else if(R.agentTab==='tests'){
  const rs=R.testRes;
  body=`<div class="card"><p class="mut">${t('agent.tests.sub')}</p><button class="btn" data-a="runtests">${ic('check')}${t('agent.run')}</button>
  ${rs?`<p><b class="${rs.every(x=>x.ok)?'ok':'no'}">${N(rs.filter(x=>x.ok).length)} / ${N(rs.length)}</b></p><div style="overflow:auto"><table class="tbl"><tr><th></th><th></th><th></th><th></th></tr>${rs.map(x=>`<tr><td class="${x.ok?'ok':'no'}">${x.ok?'✓':'✗'}</td><td>${esc(x.name)}</td><td class="mono">${esc(x.expect.length>60?x.expect.slice(0,57)+'…':x.expect)}</td><td class="mono">${esc(x.got.length>60?x.got.slice(0,57)+'…':x.got)}</td></tr>`).join('')}</table></div>`:''}</div>`;
 }else{
  const okEvts=S.p.synclog.filter(l=>l.status==='OK');
  const sent=okEvts.reduce((a,l)=>a+l.n,0);
  body=`<div class="card"><h3>${ic('sync')}${t('nav.sync')}</h3><p class="mut sm">${t('agent.server.note')}</p>
   <div class="grid3"><div class="stat"><div class="n">${N(sent)}</div><span class="mut sm">${t('agent.accepted')}</span></div>
   <div class="stat"><div class="n">${N(S.p.quarantine.length)}</div><span class="mut sm">${t('agent.rejected')}</span></div>
   <div class="stat"><div class="n">${N(S.p.cursor||0)}</div><span class="mut sm">${t('syn.cursor')}</span></div></div>
   <p class="mut sm" style="margin-top:10px">${t('syn.last')}: ${S.p.lastsync?fmtTime(S.p.lastsync):t('syn.never')}</p></div>`;
 }
 return`<div class="pagehead"><h2>${t('agent.title')}</h2><p>${t('agent.sub')}</p></div>
 <div class="tabs" role="tablist">${tabs.map(k=>`<button class="${R.agentTab===k?'on':''}" role="tab" data-a="atab" data-v="${k}">${t('agent.t.'+k)}</button>`).join('')}</div><div class="stack">${body}</div>`;
}

/* ---- settings ---- */
const seg=(items,active,a)=>`<div class="seg">${items.map(([v,l])=>`<button class="${String(v)===String(active)?'on':''}" data-a="${a}" data-v="${v}">${l}</button>`).join('')}</div>`;
function settingsView(){
 const s=SH.settings;
 const accCard=S.acc?`<div class="card"><h3>${ic('users')}${t('set.account')}</h3>
  <div class="list">
   <div class="li"><span class="ic">${ic('lock')}</span><span class="tx"><b>${esc(L(S.acc.names))}</b><br><span class="mut sm">${t('set.acc.id')}: <code class="mono">${esc(S.acc.id)}</code> · ${t('set.acc.role')}: ${t('role.'+S.acc.role)}</span></span></div>
   <div class="li"><span class="ic">${ic('shield')}</span><span class="tx">${t('set.acc.learner')}: <span class="mono">${esc(S.acc.learner_id)}</span></span></div>
  </div><div class="wrap" style="margin-top:10px"><button class="btn ghost sm" data-a="signout">${ic('out')}${t('nav.logout')}</button></div></div>`:'';
 return`<div class="pagehead"><h2>${t('set.title')}</h2></div><div class="grid2" style="align-items:start">
 <div class="stack">
  ${accCard}
  <div class="card"><h3>${ic('globe')}${t('set.lang')}</h3>${seg(LANGS.map(l=>[l.id,l.label]),LANG,'lang')}<p class="mut sm">${t('set.lang.note')}</p>
   <h3 style="margin-top:16px">${t('set.num')}</h3>${seg([['or',t('set.num.or')],['la',t('set.num.la')]],s.odiaNum?'or':'la','setnum')}</div>
  <div class="card"><h3>${ic('sliders')}${t('set.access')}</h3><div class="mut sm" style="margin-bottom:6px">${t('set.size')}</div>${seg([['s',t('set.size.s')],['m',t('set.size.m')],['l',t('set.size.l')]],s.size,'setsize')}
   <div class="mut sm" style="margin:14px 0 6px">${t('set.theme')}</div>${seg([['auto',t('set.theme.auto')],['light',t('set.theme.light')],['dark',t('set.theme.dark')]],s.theme,'settheme')}</div>
  <div class="card"><h3>${ic('wifi')}${t('net.demo')}</h3>${seg(['auto','online','weak','offline'].map(m=>[m,t('net.'+m)]),s.net,'setnet')}<p class="mut sm">${t('net.demo.note')}</p></div></div>
 <div class="stack">
  <div class="card"><h3>${ic('sync')}${t('syn.auto')}</h3><div class="sw"><span class="mut sm">${t('syn.auto.note')}</span><button class="tg ${s.autoSync?'on':''}" role="switch" aria-checked="${s.autoSync}" data-a="autosync" aria-label="${t('syn.auto')}"></button></div></div>
  <div class="card"><h3>${ic('shield')}${t('set.priv')}</h3><div class="list"><div class="li"><span class="ic">${ic('check')}</span><span class="tx">${t('set.priv1')}</span></div><div class="li"><span class="ic">${ic('x')}</span><span class="tx">${t('set.priv2')}</span></div><div class="li"><span class="ic">${ic('users')}</span><span class="tx">${t('set.priv3')}</span></div></div></div>
  <div class="card"><h3>${ic('leaf')}${t('set.about')}</h3><p>${t('set.about1')}</p><h3>${t('set.lim')}</h3><p class="mut">${t('set.lim1')}</p></div>
  <div class="card"><button class="btn ghost ${R.resetArm?'warn':''}" data-a="reset">${R.resetArm?t('set.reset.q'):t('set.reset')}</button></div></div></div>`;
}

/* ---- teacher preview ---- */
const SAMPLE=[['Anita','ଅନୀତା',[9000,8800,7000,5000,null,null,null,null,null]],['Bikram','ବିକ୍ରମ',[6000,3000,2000,null,null,null,null,null,null]],['Chandini','ଚାନ୍ଦିନୀ',[9200,9000,9100,8700,6000,4000,8800,7000,5000]],['Dinesh','ଦିନେଶ',[4500,2500,1800,1700,null,null,null,null,null]],['Gita','ଗୀତା',[8800,6500,5000,3000,7000,null,6000,null,null]],['Hari','ହରି',[3000,null,2500,null,null,null,null,null,null]],['Laxmi','ଲକ୍ଷ୍ମୀ',[9300,9100,8900,8800,9000,8600,9200,9000,8800]],['Manas','ମାନସ',[7000,5000,3500,2200,null,null,null,null,null]]];
function teacherView(){
 const real=ACC.filter(a=>a.role!=='teacher').map(a=>{const p=ls.get(PS.key(a.learner_id));if(!p)return null;
  return{n:L(a.names),p:CONCEPTS.map(c=>p.mastery[c.id]?p.mastery[c.id].p_bp:null),help:!!(p.current&&p.current.needs_help)}}).filter(Boolean);
 const rows=real.concat(SAMPLE.map(s=>({n:LANG==='or'?s[1]:s[0],p:s[2],help:s[0]==='Dinesh'})));
 const weak=r=>r.p.filter(x=>x!==null&&x<RULES.bands.weak_below_bp).length;
 const attn=rows.filter(r=>r.help||weak(r)>=2);
 const cell=p=>`<span class="cell ${p===null?'n':bandOf(p)}"></span>`;
 const mis=[['distance_displacement_swap',4],['multiply_instead',3],['membrane_nucleus_swap',2]];
 return`<div class="pagehead"><h2>${t('tch.title')}</h2><p>${t('tch.sub')}</p><span class="tag p">${t('tch.badge')}</span></div>
 <div class="cols"><div class="card"><h3>${ic('users')}${t('app.class')}<span class="r">${t('tch.sample')}</span></h3><div style="overflow:auto"><table class="tbl heat"><tr><th>${t('tch.stud')}</th>${CONCEPTS.map(c=>`<th class="c" title="${esc(L(c.t))}">${N(c.ord+1)}</th>`).join('')}</tr>${rows.map(r=>`<tr><td>${esc(r.n)}</td>${r.p.map(p=>`<td class="c">${cell(p)}</td>`).join('')}</tr>`).join('')}</table></div>
  <div class="wrap" style="margin-top:12px">${['w','p','m','n'].map(b=>`<span class="tag"><span class="heat"><span class="cell ${b}" style="width:14px;height:14px;border-radius:4px"></span></span> ${t('band.'+b)}</span>`).join('')}</div>
  <ol class="mut sm" style="margin:12px 0 0;padding-left:20px">${CONCEPTS.map(c=>`<li>${esc(L(c.t))}</li>`).join('')}</ol></div>
 <div class="stack"><div class="card"><h3>${ic('alert')}${t('tch.attn')}</h3><div class="list">${attn.map(r=>`<div class="li"><span class="ic">${ic('users')}</span><span class="tx"><b>${esc(r.n)}</b><br><span class="mut sm">${r.help?t('tch.flag.help'):t('tch.flag.weak',{n:N(weak(r))})}</span></span></div>`).join('')}</div></div>
 <div class="card"><h3>${ic('chart')}${t('tch.mis')}</h3><div class="list">${mis.map(m=>`<div class="li"><span class="tx">${t('mis.'+m[0])||m[0]}<br><span class="mut sm">${tn('tch.mis.n',{n:m[1]})}</span></span></div>`).join('')}</div></div></div></div>`;
}
const VIEWS={home:homeView,learn:learnView,practice:practiceView,ask:askView,progress:progressView,packs:packsView,sync:syncView,agent:agentView,settings:settingsView,teacher:teacherView};

/* ================= wiring ================= */
function applyPrefs(){
 const s=SH.settings,r=document.documentElement;
 r.style.setProperty('--fs',({s:'16px',m:'18px',l:'20px'})[s.size]||'16px');
 if(s.theme==='auto')r.removeAttribute('data-theme');else r.setAttribute('data-theme',s.theme);
 r.setAttribute('lang',LANG==='or'?'or':'en');
}
let lastRoute=null;
function render(){
 const app=$('#app');if(!app)return;
 const ae=document.activeElement,aid=ae&&ae.id,ss=ae&&ae.selectionStart,se=ae&&ae.selectionEnd;
 const c0=$('#content');if(c0&&lastRoute===R.route)R.scroll[R.route]=c0.scrollTop;
 applyPrefs();
 app.innerHTML=(R.role?panelView():loginView())+overlays();
 const c1=$('#content');if(c1)c1.scrollTop=lastRoute===R.route?(R.scroll[R.route]||0):0;
 lastRoute=R.route;
 if(aid){const el=document.getElementById(aid);if(el){el.focus();try{if(ss!=null)el.setSelectionRange(ss,se)}catch(e){}}}
}
function toast(msg){
 const old=document.querySelector('.toast');if(old)old.remove();
 const d=document.createElement('div');d.className='toast';d.setAttribute('role','status');d.textContent=msg;document.body.appendChild(d);
 setTimeout(()=>d.remove(),3200);
}
UI.render=render;UI.toast=toast;
function setLang(l){LANG=l;SH.settings.lang=l;saveSH();render()}
/* ---- back navigation: every view change pushes onto the stack ---- */
function navPush(){
 R.hist.push({route:R.route,concept:R.concept,fmt:R.fmt,agentTab:R.agentTab,altNote:R.altNote});
 if(R.hist.length>40)R.hist.shift();
}
function goBack(){
 const s=R.hist.pop();if(!s)return;
 Object.assign(R,{route:s.route,concept:s.concept,fmt:s.fmt||'text',agentTab:s.agentTab||'trace',altNote:!!s.altNote,prac:null,pop:false,more:false,cmd:false});
 render();
}
function enter(acc){
 PS.ensure(acc.learner_id,L(acc.names));
 PS.open(acc.learner_id);
 S.acc=acc;
 Object.assign(R,{role:acc.role==='teacher'?'teacher':'learner',route:acc.role==='teacher'?'teacher':'home',hist:[],prac:null,concept:null,pop:false,more:false,cmd:false,thread:[],login:{mode:'signin',role:'student',id:'',pw:'',name:'',err:'',busy:false}});
 if(acc.role!=='teacher'){emitLocal('SESSION_STARTED',{});S.p.current=null;ensureDecision()}
 render();if(acc.role!=='teacher')doSync(false);
}
async function signout(){
 if(S.p){emitLocal('SESSION_ENDED',{});S.exiting=true;R.busy=true;try{await doSync(false)}catch(e){}R.busy=false;S.exiting=false;PS.close()}
 Object.assign(R,{role:null,route:'home',hist:[],prac:null,concept:null,thread:[],pop:false,more:false,cmd:false});render();
}
function setNet(m){
 const prev=netState();SH.settings.net=m;saveSH();const next=netState();R.pop=false;
 if(prev!==next){
  if(S.p)emitLocal('NETWORK_STATE_CHANGED',{from:prev,to:next});
  toast(t(next==='offline'?'net.to.offline':next==='weak'?'net.to.weak':'net.to.online'));
  if(prev==='offline'&&next!=='offline')setTimeout(()=>{if(S.p&&SH.settings.autoSync)doSync(false)},600);
 }
 render();
}
function followDecision(d){
 if(d.action==='RETRY')return startPractice(d.target);
 navPush();R.route='learn';R.concept=d.target;R.fmt=d.alt?'example':'text';R.altNote=!!d.alt;
 if(hasPack(d.target))emit('CONTENT_VIEWED',{concept:d.target,format:R.fmt});
 render();
}
const A={
 lang(v){setLang(v)},
 lrole(v){R.login.role=v;R.login.err='';render()},
 lmode(v){R.login.mode=v;R.login.err='';render()},
 async lsignin(){
  const Lg=R.login;const id=(Lg.id||'').trim(),pw=Lg.pw||'';
  const acc=ACC.find(a=>a.id===id&&String(a.pw_hash)===hashPw(pw,a.id));
  if(!acc){Lg.err='login.bad';render();return}
  Lg.busy=true;Lg.err='';render();
  try{await loginAccount(acc);enter(acc)}
  catch(e){Lg.busy=false;Lg.err=e&&e.status===0?'login.noserver':'login.bad';render()}
 },
 async lsignup(){
  const Lg=R.login;const name=(Lg.name||'').trim(),pw=Lg.pw||'';
  if(!name){Lg.err='login.needname';render();return}
  if(pw.length<4){Lg.err='login.needpw';render();return}
  let id;
  if(Lg.role==='teacher'){let i=1;while(ACC.some(a=>a.id==='T'+i))i++;id='T'+i}
  else{let i=1;while(ACC.some(a=>a.id===String(i)))i++;id=String(i)}
  Lg.busy=true;Lg.err='';render();
  try{const acc=await registerAccount({id,role:Lg.role,name,names:{en:name,or:name},pw});enter(acc)}
  catch(e){Lg.busy=false;Lg.err=e&&e.status===0?'login.noserver':'login.bad';render()}
 },
 go(v){if(v===R.route){R.more=false;R.pop=false;R.cmd=false;render()}else{navPush();R.route=v;R.more=false;R.pop=false;R.cmd=false;if(v!=='learn')R.concept=null;render()}},
 back(){goBack()},
 follow(){followDecision(ensureDecision())},
 open(v){navPush();R.route='learn';R.concept=v;R.fmt='text';R.altNote=false;if(hasPack(v))emit('CONTENT_VIEWED',{concept:v,format:'text'});R.more=false;render()},
 unsel(){goBack()},
 fmt(v){R.fmt=v;if(v==='example'&&R.concept)emit('CONTENT_VIEWED',{concept:R.concept,format:'example'});render()},
 practice(v){startPractice(v)},
 askabout(v){runAsk(L(CMAP[v].t))},
 ans(v){answerQ(+v)},pnext(){nextQ()},skip(){skipQ()},
 pstop(){if(R.hist.length)goBack();else{R.prac=null;R.route='home';render()}},
 chip(v){runAsk(v)},
 ask(){const el=$('#askText');runAsk(el?el.value:R.askText)},
 quick(){const el=$('#quick');const v=el?el.value:'';R.quick='';runAsk(v)},
 sync(){doSync(true)},
 dlpack(v){if(netState()==='offline')return;startDL(v);render()},
 autopf(){SH.settings.autoPrefetch=!SH.settings.autoPrefetch;saveSH();render()},
 autosync(){SH.settings.autoSync=!SH.settings.autoSync;saveSH();if(SH.settings.autoSync)scheduleAutoSync();render()},
 pop(){R.pop=!R.pop;render()},popx(){R.pop=false;render()},setnet(v){setNet(v)},
 cmd(){R.cmd=true;R.cmdQ='';render();const el=$('#cmdQ');if(el)el.focus()},cmdx(e,el,ev){if(ev&&ev.target!==el)return;R.cmd=false;render()},
 cmdrun(v){R.cmd=false;if(v.startsWith('go:'))A.go(v.slice(3));else if(v==='lang')setLang(LANG==='or'?'en':'or');else if(v==='sync'){render();doSync(true)}else if(v.startsWith('net:'))setNet(v.slice(4));else render()},
 more(){R.more=true;render()},morex(v,el,ev){if(ev&&ev.target!==el)return;R.more=false;render()},
 exp(v){const cur=R.expand[v]!==undefined?R.expand[v]:(S.p.decisions[0]&&S.p.decisions[0].id===v);R.expand[v]=!cur;render()},
 atab(v){R.agentTab=v;render()},
 runtests(){R.testRes=runSelfTests();render()},
 setnum(v){ODIA_NUM=v==='or';SH.settings.odiaNum=ODIA_NUM;saveSH();render()},
 setsize(v){SH.settings.size=v;saveSH();render()},settheme(v){SH.settings.theme=v;saveSH();render()},
 reset(){if(!R.resetArm){R.resetArm=true;render();return}ls.keys().filter(k=>k.startsWith('saarthi:')).forEach(k=>ls.del(k));location.reload()},
 signout(){signout()}
};
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-a]');if(!el)return;
 const f=A[el.dataset.a];if(f){e.preventDefault();f(el.dataset.v,el,e)}
});
document.addEventListener('input',e=>{
 const id=e.target.id;
 if(id==='askText')R.askText=e.target.value;else if(id==='quick')R.quick=e.target.value;
 else if(id==='cmdQ'){R.cmdQ=e.target.value;render()}
 else if(id==='lId')R.login.id=e.target.value;
 else if(id==='lPw')R.login.pw=e.target.value;
 else if(id==='lName')R.login.name=e.target.value;
});
document.addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(R.role){R.cmd=!R.cmd;R.cmdQ='';render();const el=$('#cmdQ');if(el)el.focus()}return}
 if(e.key==='Escape'){if(R.cmd||R.pop||R.more){R.cmd=R.pop=R.more=false;render()}else if(R.role&&R.hist.length)goBack();return}
 if(e.key==='Enter'&&!e.shiftKey&&(e.target.id==='lId'||e.target.id==='lPw')){if(R.login.mode==='signin')A.lsignin();return}
 if(R.cmd&&e.key==='Enter'){const it=cmdItems().filter(i=>i.l.toLowerCase().includes(R.cmdQ.toLowerCase()))[0];if(it)A.cmdrun(it.k);return}
 if(e.target.id==='askText'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();A.ask()}
});
if(typeof window!=='undefined'){
 window.addEventListener('online',()=>{if(SH.settings.net==='auto'){render();if(S.p&&SH.settings.autoSync)doSync(false)}});
 window.addEventListener('offline',()=>{if(SH.settings.net==='auto')render()});
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.p&&SH.settings.autoSync)doSync(false)});
async function checkServer(){
 try{await apiFetch('/health',{auth:false});R.serverOk=true}
 catch(e){R.serverOk=false}
}
(async function init(){
 LANG=SH.settings.lang||'or';ODIA_NUM=SH.settings.odiaNum!==false;
 render();
 await checkServer();
 if(R.serverOk){
  try{await seedAccounts()}
  catch(e){/* seeding is best-effort; the server itself may still be fine */}
 }
 render();
})();
