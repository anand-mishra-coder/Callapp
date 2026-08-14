import{initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{getFirestore,collection,doc,setDoc,getDoc,addDoc,updateDoc,onSnapshot,query,where,orderBy,serverTimestamp,limit}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{firebaseConfig}from"./firebase-config.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),provider=new GoogleAuthProvider();
const $=id=>document.getElementById(id); let me=null,people=[],view="chats",selected=null,unPeople=null,unMsgs=null,unCalls=null,unIncoming=null;
let pc=null,localStream=null,activeCall=null,candidateUnsubs=[]; const rtc={iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]};
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const avatar=u=>u.photoURL||`https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName||"User")}&background=111827&color=fff`;
function toast(x){$("toast").textContent=x;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2500)}
$("googleLogin").onclick=async()=>{try{await signInWithPopup(auth,provider)}catch(e){toast(e.message)}};
$("logout").onclick=()=>signOut(auth);

onAuthStateChanged(auth,async u=>{
 if(!u){$("login").classList.remove("hidden");$("app").classList.add("hidden");return}
 me=u;$("login").classList.add("hidden");$("app").classList.remove("hidden");
 $("meName").textContent=u.displayName||"Google User";$("meEmail").textContent=u.email||"";$("mePhoto").src=avatar(u);
 await setDoc(doc(db,"users",u.uid),{uid:u.uid,displayName:u.displayName||"Google User",email:u.email||"",photoURL:u.photoURL||"",online:true,lastSeen:serverTimestamp(),createdAt:serverTimestamp()},{merge:true});
 subscribePeople();subscribeIncoming();subscribeCalls();
});
function subscribePeople(){unPeople?.();unPeople=onSnapshot(query(collection(db,"users"),orderBy("displayName")),s=>{people=s.docs.map(x=>x.data()).filter(x=>x.uid!==me.uid);render()})}
function subscribeIncoming(){unIncoming?.();unIncoming=onSnapshot(query(collection(db,"calls"),where("calleeId","==",me.uid),where("status","==","ringing"),limit(1)),s=>{if(!activeCall&&!s.empty)incoming({id:s.docs[0].id,...s.docs[0].data()})})}
function subscribeCalls(){unCalls?.();unCalls=onSnapshot(query(collection(db,"calls"),where("participants","array-contains",me.uid),orderBy("createdAt","desc"),limit(50)),s=>{if(view==="calls")render()})}
function render(){
 const q=($("search").value||"").toLowerCase(); let list=people.filter(p=>(p.displayName||"").toLowerCase().includes(q)||(p.email||"").toLowerCase().includes(q));
 if(view==="chats")$("list").innerHTML=list.map(p=>person(p)).join("")||`<p class="muted" style="padding:16px">No other signed-in users.</p>`;
 else if(view==="status")$("list").innerHTML=`<div class="status-title">Recent status</div>`+people.map(p=>`<div class="status-row"><img src="${avatar(p)}"><div class="person-info"><strong>${esc(p.displayName)}</strong><small>${p.online?"Online":"Last seen recently"}</small></div></div>`).join("");
 else $("list").innerHTML=`<div class="status-title">Call history</div>`+`<div class="muted" style="padding:16px">Your recent calls are loaded here when available.</div>`;
 document.querySelectorAll("[data-chat]").forEach(b=>b.onclick=()=>openChat(find(b.dataset.chat)));
 document.querySelectorAll("[data-audio]").forEach(b=>b.onclick=e=>{e.stopPropagation();startCall(find(b.dataset.audio),false)});
 document.querySelectorAll("[data-video]").forEach(b=>b.onclick=e=>{e.stopPropagation();startCall(find(b.dataset.video),true)});
}
function person(p){return `<div class="person" data-chat="${p.uid}"><img src="${avatar(p)}"><div class="person-info"><strong>${esc(p.displayName)}</strong><small>${esc(p.email)}</small><small class="${p.online?"online":"offline"}">${p.online?"● Online":"● Offline"}</small></div><div class="person-actions"><button class="mini" data-audio="${p.uid}">☎</button><button class="mini" data-video="${p.uid}">▣</button></div></div>`}
function find(uid){return people.find(x=>x.uid===uid)}
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");view=t.dataset.view;closeChat();render()});
$("search").oninput=render;
async function openChat(p){if(!p)return;selected=p;$("empty").classList.add("hidden");$("chat").classList.remove("hidden");$("main")?.classList.add("open");$("chatPhoto").src=avatar(p);$("chatName").textContent=p.displayName;$("chatPresence").textContent=p.online?"Online":"Offline";unMsgs?.();const chatId=chatKey(me.uid,p.uid);unMsgs=onSnapshot(query(collection(db,"chats",chatId,"messages"),orderBy("createdAt","asc")),s=>{$("messages").innerHTML=s.docs.map(d=>bubble(d.data())).join("");$("messages").scrollTop=$("messages").scrollHeight})}
function closeChat(){selected=null;unMsgs?.();unMsgs=null;$("chat").classList.add("hidden");$("empty").classList.remove("hidden")}
const chatKey=(a,b)=>[a,b].sort().join("_");
function bubble(m){const mine=m.senderId===me.uid;return `<div class="bubble ${mine?"mine":""}">${esc(m.text)}<small>${m.createdAt?.toDate?m.createdAt.toDate().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"now"}</small></div>`}
$("messageForm").onsubmit=async e=>{e.preventDefault();const text=$("messageInput").value.trim();if(!text||!selected)return;$("messageInput").value="";const id=chatKey(me.uid,selected.uid);await addDoc(collection(db,"chats",id,"messages"),{text,senderId:me.uid,receiverId:selected.uid,createdAt:serverTimestamp()});await setDoc(doc(db,"chats",id),{participants:[me.uid,selected.uid],updatedAt:serverTimestamp(),lastMessage:text,lastSenderId:me.uid},{merge:true})};

function incoming(c){$("incPhoto").src=avatar({displayName:c.callerName,photoURL:c.callerPhoto});$("incName").textContent=c.callerName;$("incType").textContent=c.type==="video"?"Incoming video call":"Incoming audio call";$("incoming").classList.remove("hidden");$("accept").onclick=()=>acceptCall(c);$("decline").onclick=async()=>{await updateDoc(doc(db,"calls",c.id),{status:"rejected",endedAt:serverTimestamp()});$("incoming").classList.add("hidden")}}
async function media(video){return navigator.mediaDevices.getUserMedia({audio:true,video:video?{facingMode:"user"}:false})}
async function peer(callId,caller){pc=new RTCPeerConnection(rtc);pc.ontrack=e=>{e.streams[0]?.getTracks().forEach(t=>$("remote").srcObject?.addTrack(t));if(!$("remote").srcObject)$("remote").srcObject=new MediaStream(e.streams[0].getTracks());$("connecting").classList.add("hidden")};pc.onicecandidate=async e=>{if(e.candidate)await addDoc(collection(db,"calls",callId,caller?"callerCandidates":"calleeCandidates"),e.candidate.toJSON())};return pc}
async function candidates(id,caller){candidateUnsubs.push(onSnapshot(collection(db,"calls",id,caller?"calleeCandidates":"callerCandidates"),s=>s.docChanges().forEach(c=>{if(c.type==="added")pc?.addIceCandidate(c.doc.data()).catch(()=>{})})))}
async function startCall(target,video){if(!target)return;try{localStream=await media(video);activeCall={target,type:video?"video":"audio",caller:true};showCall(target,video);const ref=await addDoc(collection(db,"calls"),{callerId:me.uid,callerName:me.displayName||"",callerEmail:me.email||"",callerPhoto:me.photoURL||"",calleeId:target.uid,calleeName:target.displayName,calleeEmail:target.email,calleePhoto:target.photoURL||"",type:activeCall.type,status:"ringing",participants:[me.uid,target.uid],createdAt:serverTimestamp()});activeCall.id=ref.id;pc=await peer(ref.id,true);localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));const offer=await pc.createOffer();await pc.setLocalDescription(offer);await updateDoc(ref,{offer:{type:offer.type,sdp:offer.sdp}});await candidates(ref.id,true);onSnapshot(ref,s=>{const d=s.data();if(d?.answer&&!pc.currentRemoteDescription)pc.setRemoteDescription(d.answer);if(d?.status==="rejected")endCall(false);})}catch(e){console.error(e);toast("Microphone/camera permission failed")}}
async function acceptCall(c){$("incoming").classList.add("hidden");try{localStream=await media(c.type==="video");activeCall={id:c.id,target:{uid:c.callerId,displayName:c.callerName,email:c.callerEmail,photoURL:c.callerPhoto},type:c.type,caller:false};showCall(activeCall.target,c.type==="video");pc=await peer(c.id,false);localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));await pc.setRemoteDescription(c.offer);const ans=await pc.createAnswer();await pc.setLocalDescription(ans);await updateDoc(doc(db,"calls",c.id),{answer:{type:ans.type,sdp:ans.sdp},status:"accepted"});await candidates(c.id,false)}catch(e){toast("Could not accept call")}}
function showCall(p,video){$("callName").textContent=p.displayName||p.email;$("call").classList.remove("hidden");$("local").srcObject=localStream;$("local").style.display=video?"block":"none";$("callState").textContent="Connecting…"}
$("hangup").onclick=()=>endCall(true);async function endCall(notify){if(notify&&activeCall?.id)await updateDoc(doc(db,"calls",activeCall.id),{status:"ended",endedAt:serverTimestamp()}).catch(()=>{});candidateUnsubs.forEach(x=>x());candidateUnsubs=[];pc?.close();pc=null;localStream?.getTracks().forEach(t=>t.stop());localStream=null;$("remote").srcObject=null;$("local").srcObject=null;$("call").classList.add("hidden");activeCall=null}
$("mute").onclick=()=>{localStream?.getAudioTracks().forEach(t=>t.enabled=!t.enabled);$("mute").textContent=$("mute").textContent==="Mic"?"Unmute":"Mic"};
$("cam").onclick=()=>{const t=localStream?.getVideoTracks()[0];if(t){t.enabled=!t.enabled;$("cam").textContent=t.enabled?"Camera":"Camera off"}};
$("speaker").onclick=()=>{$("remote").muted=!$("remote").muted;$("speaker").textContent=$("remote").muted?"Speaker off":"Speaker"};
